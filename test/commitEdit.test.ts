// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// handle.commitEdit(): a cell editor still open when the host saves or closes is committed as Enter
// would commit it, and the promise settles once the source has the edit, so that a save made after
// it holds what was typed. DexTreeTable.commitEdit() is the table's half: it commits the open editor and
// gives the keyboard back to the table.
import * as assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, type EditableTableSource, type TableSource, type TableView, type Workspace } from '../src/model/index.js';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { createSession } from 'data-explorer-core';
import { createRegisters } from '../src/model/index.js';
import { JsonEngine } from '../src/model/edit/jsonEngine.js';
import { createTextStore } from '../src/model/edit/textStore.js';
import { DocumentRegistry } from '../src/model/workspace/SlddModel.js';
import { file, PARAMS } from './binaryEngine/harness.js';
import { diskOf } from './jsonEngine/harness.js';
import { fixture } from './matEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

let handles: TableHandle[] = [];
let workspaces: Workspace[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  for (const ws of workspaces) ws.dispose();
  handles = [];
  workspaces = [];
  document.body.replaceChildren();
});

const tick = () => new Promise((done) => setTimeout(done, 0));
async function settle(table: any): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    await table.updateComplete;
  }
}

function mount(source: TableSource, editing = true): { table: any; handle: TableHandle } {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, source, { editing });
  handles.push(handle);
  return { table, handle };
}

const editorOf = (table: any) => table.shadowRoot.querySelector('.edit-input') as HTMLInputElement | HTMLTextAreaElement | null;

/** Open the Name editor on `rowId` and type `text` into it, leaving it open. */
async function typeName(table: any, rowId: string, text: string): Promise<void> {
  assert.ok(table.beginRename(rowId), `a Name editor opens on ${rowId}`);
  await table.updateComplete;
  const input = editorOf(table);
  assert.ok(input, 'the editor is open');
  input.value = text;
}

/** Double-click `rowId`'s Value cell, as the user opens its editor. */
async function openValue(table: any, rowId: string): Promise<void> {
  table.shadowRoot.querySelector(`tr[data-row-id="${CSS.escape(rowId)}"] td.col-Value`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await table.updateComplete;
}

const VIEW: TableView = {
  docUri: 'file:///w/d.sldd',
  rows: [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } } as any,
    { ID: 'u/design/A', parent: 'section:design', Name: { label: 'A', editable: true }, Value: '1', _valueEditable: true } as any,
    { ID: 'u/design/B', parent: 'section:design', Name: { label: 'B', editable: true }, Value: '2' } as any,
    // A Value shown as a summary, edited as its whole text (openWholeValueEditor).
    { ID: 'u/design/W', parent: 'section:design', Name: { label: 'W' }, Value: '<1x500 double>', _valueEditable: true, _hasEditText: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};

/** A source whose edits finish when the test lets them (the oldest, unless the newest is named), as a JSON dictionary's writes do. */
function slowSource(outcome: 'written' | 'refused' = 'written') {
  const edits: unknown[] = [];
  const finishes: (() => void)[] = [];
  const noop = () => {};
  const source = {
    open: async () => VIEW,
    children: async (nodeId: string) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId: string) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: () => noop,
    edit: (edit: unknown) => {
      edits.push(edit);
      return new Promise<void>((resolve, reject) => {
        finishes.push(() => (outcome === 'written' ? resolve() : reject(new Error('refused'))));
      });
    },
    ...Object.fromEntries(['copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map((n) => [n, noop])),
  } as unknown as EditableTableSource;
  return { source, edits, finish: (which: 'oldest' | 'newest' = 'oldest') => (which === 'oldest' ? finishes.shift() : finishes.pop())!() };
}

describe('handle.commitEdit()', () => {
  it('commits the open editor, and settles only once the source has the edit', async () => {
    const { source, edits, finish } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await typeName(table, 'u/design/A', 'B');
    let settled = false;
    const committing = handle.commitEdit().then(() => void (settled = true));
    assert.deepStrictEqual(edits, [{ rowId: 'u/design/A', columnId: 'Name', oldValue: 'A', newValue: 'B' }]);
    await tick();
    assert.strictEqual(settled, false, 'not before the source has the edit');
    finish();
    await committing;
    assert.strictEqual(settled, true);
    assert.strictEqual(table.shadowRoot.querySelector('.edit-input'), null, 'and the editor is closed');
  });

  it('settles too when the source refuses the edit', async () => {
    const { source, finish } = slowSource('refused');
    const { table, handle } = mount(source);
    await settle(table);
    await typeName(table, 'u/design/A', 'B');
    const committing = handle.commitEdit();
    finish();
    await committing;
  });

  it('settles at once, sending nothing, with no editor open, or one whose text did not change', async () => {
    const { source, edits } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await handle.commitEdit();
    assert.strictEqual(table.commitEdit(), false, 'no editor was open');
    await typeName(table, 'u/design/A', 'A');
    await handle.commitEdit();
    assert.deepStrictEqual(edits, []);
  });

  it('settles at once without editing, and on a handle disposed', async () => {
    const { source } = slowSource();
    const { table, handle } = mount(source, false);
    await settle(table);
    await handle.commitEdit();
    handle.dispose();
    await handle.commitEdit();
  });

  it('leaves an editor open under a handle disposed: nothing hears its edit', async () => {
    const { source, edits } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await typeName(table, 'u/design/A', 'B');
    handle.dispose();
    await handle.commitEdit();
    assert.deepStrictEqual(edits, []);
    assert.ok(editorOf(table), 'the table keeps what it shows');
  });

  it('waits for every edit still being written, not only its own', async () => {
    const { source, edits, finish } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await typeName(table, 'u/design/A', 'A1');
    editorOf(table)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
    await settle(table);
    await typeName(table, 'u/design/B', 'B1');
    let settled = false;
    const committing = handle.commitEdit().then(() => void (settled = true));
    assert.deepStrictEqual(edits.map((e: any) => e.newValue), ['A1', 'B1']);
    finish('newest');
    await settle(table);
    assert.strictEqual(settled, false, 'not while the edit Enter committed is still being written');
    finish();
    await committing;
  });

  it('commits a Value editor, and a whole Value in its textarea with the line breaks it held', async () => {
    const { source, edits, finish } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await openValue(table, 'u/design/A');
    editorOf(table)!.value = '5';
    let committing = handle.commitEdit();
    finish();
    await committing;
    await openValue(table, 'u/design/W');
    table.openWholeValueEditor('u/design/W', '1\r\n2');
    await table.updateComplete;
    const area = editorOf(table)!;
    assert.strictEqual(area.tagName, 'TEXTAREA');
    area.value = '1\n2\n3';
    committing = handle.commitEdit();
    finish();
    await committing;
    assert.deepStrictEqual(edits, [
      { rowId: 'u/design/A', columnId: 'Value', oldValue: '1', newValue: '5' },
      { rowId: 'u/design/W', columnId: 'Value', oldValue: '1\r\n2', newValue: '1\r\n2\r\n3' },
    ]);
  });

  it('gives the keyboard back to the table, as Enter does', async () => {
    const { source, finish } = slowSource();
    const { table, handle } = mount(source);
    await settle(table);
    await typeName(table, 'u/design/A', 'B');
    assert.strictEqual(table.shadowRoot.activeElement, editorOf(table), 'the editor has the keyboard');
    const committing = handle.commitEdit();
    finish();
    await committing;
    await settle(table);
    assert.ok(table.shadowRoot.activeElement?.classList.contains('table-container'), `the table has it (${table.shadowRoot.activeElement?.className})`);
  });
});

describe("commitEdit() before a save, through each of the page's editing engines", () => {
  // The row to rename: a dictionary's entry (Kp, gravity), a MAT-file's first variable.
  const CASES: [string, () => Uint8Array, string, string | null][] = [
    ['a JSON dictionary', () => file('test/fixtures/params.sldd'), 'params.sldd', 'Kp'],
    ['a compressed dictionary', () => file(PARAMS), 'params_binary.sldd', 'gravity'],
    ['a MAT-file', () => fixture('pv_basic.mat'), 'pv_basic.mat', null],
  ];
  for (const [label, bytes, name, entry] of CASES) {
    it(`${label}: the name typed into an editor still open is in the bytes the save then writes`, async () => {
      const ws = createWorkspace({ editing: true });
      workspaces.push(ws);
      const doc = await ws.open(bytes(), name, `file:///w/${name}`);
      const { table, handle } = mount(doc.table);
      await settle(table);
      const rows = table.rows as any[];
      const row = entry === null ? rows.find((r) => r.parent == null) : rows.find((r) => r.Name?.label === entry && r.parent != null);
      assert.ok(row, `${label} has the row to rename`);
      const rowId: string = row.ID;
      const was: string = row.Name.label;
      await typeName(table, rowId, `${was}Typed`);
      await handle.commitEdit();
      assert.strictEqual(doc.dirty, true, 'the document holds the edit');
      const { bytes: saved } = doc.serialize();
      const reread = createWorkspace();
      workspaces.push(reread);
      const back = await reread.open(saved, name, `file:///w/back-${name}`);
      const names = (await back.table.open()).rows.map((r: any) => r.Name?.label);
      assert.ok(names.includes(`${was}Typed`), `the save holds ${was}Typed (${names.join(', ')})`);
    });
  }
});

describe("commitEdit() of a Value the engine refuses, through each of the page's editing engines", () => {
  const CASES: [string, () => Uint8Array, string, string][] = [
    ['a JSON dictionary', () => file('test/fixtures/params.sldd'), 'params.sldd', 'Kp'],
    ['a compressed dictionary', () => file(PARAMS), 'params_binary.sldd', 'gravity'],
    ['a MAT-file', () => fixture('pv_basic.mat'), 'pv_basic.mat', 'p'],
  ];
  for (const [label, bytes, name, entry] of CASES) {
    it(`${label}: settles, the document unchanged, and the dialog says why`, async () => {
      const ws = createWorkspace({ editing: true });
      workspaces.push(ws);
      const doc = await ws.open(bytes(), name, `file:///w/${name}`);
      const { table, handle } = mount(doc.table);
      await settle(table);
      const row = (table.rows as any[]).find((r) => r.Name?.label === entry);
      assert.ok(row, `${label} has ${entry}`);
      await openValue(table, row.ID);
      editorOf(table)!.value = '[1 2';
      await handle.commitEdit();
      await settle(table);
      assert.strictEqual(doc.dirty, false);
      const dialog = document.querySelector('dex-error-dialog[open]');
      assert.ok(dialog, 'a dialog is open');
      assert.match(dialog.shadowRoot!.textContent!, /Cannot edit/);
    });
  }
});

describe("commitEdit() over a JSON dictionary whose text takes its edit later, as a host's document does", () => {
  /**
   * The JSON engine over the page's own text store, its writes held until the test lets them
   * through: a TextStore over a document whose edit lands a turn later (a VS Code TextDocument's
   * does). As a real store, it takes its version check at the call: a write asked for over a text
   * that moved before it landed is refused, not applied at stale offsets.
   */
  function heldJson() {
    const store = createTextStore(new TextDecoder().decode(file('test/fixtures/params.sldd')));
    const held: (() => void)[] = [];
    const slow = Object.create(store);
    slow.apply = (patches: unknown) => {
      const asked = store.version;
      return new Promise<boolean>((resolve) =>
        held.push(() => (store.version !== asked ? resolve(false) : void store.apply(patches as any).then(resolve))),
      );
    };
    const engine = new JsonEngine({
      registry: new DocumentRegistry(createSession()),
      uri: 'file:///work/params.sldd',
      name: 'params.sldd',
      text: slow,
      registers: createRegisters(),
      notify: () => {},
      disk: diskOf(file('test/fixtures/params.sldd')),
    });
    engines.push(engine);
    return { store, held, engine };
  }
  let engines: JsonEngine[] = [];
  afterEach(() => {
    for (const engine of engines) engine.dispose();
    engines = [];
  });
  const rowNamed = (table: any, name: string) => (table.rows as any[]).find((r) => r.Name?.label === name && r.parent != null);

  it("waits for the JSON engine's write, and the text then holds what was typed", async () => {
    const { store, held, engine } = heldJson();
    const { table, handle } = mount(engine.view());
    await settle(table);
    await typeName(table, rowNamed(table, 'Kp').ID, 'KpTyped');
    let settled = false;
    const committing = handle.commitEdit().then(() => void (settled = true));
    await settle(table);
    assert.strictEqual(settled, false, 'not while the text has not taken the edit');
    assert.ok(!store.text.includes('KpTyped'));
    for (const release of held.splice(0)) release();
    await committing;
    assert.ok(store.text.includes('"KpTyped"'), 'the text holds the name typed');
  });

  it('waits for both of two writes held, and the text is still JSON holding the first', async () => {
    const { store, held, engine } = heldJson();
    const { table, handle } = mount(engine.view());
    await settle(table);
    await typeName(table, rowNamed(table, 'Kp').ID, 'KpFirst');
    editorOf(table)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
    await settle(table);
    await typeName(table, rowNamed(table, 'Ki').ID, 'KiSecond');
    let settled = false;
    const committing = handle.commitEdit().then(() => void (settled = true));
    await settle(table);
    assert.strictEqual(held.length, 2, 'both writes are held');
    held.shift()!();
    await settle(table);
    assert.strictEqual(settled, false, 'not while the second write is held');
    held.shift()!();
    await committing;
    JSON.parse(store.text);
    assert.ok(store.text.includes('"KpFirst"'), 'the text holds the first name');
    // The second was asked for over a text the first then moved, so the store refused it, as VS Code
    // refuses a WorkspaceEdit over a document that moved. Out of reach today: the page's own store
    // lands a write within a turn, and the extension's webview does not wait for its host.
  });
});
