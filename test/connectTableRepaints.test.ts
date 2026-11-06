// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing}) at a host's repaint: what it keeps (the part of a selection still there,
// a refusal's dialog, a drag in flight), what it clears (a selection whose rows all went, a notice
// about rows it no longer shows, a failure's banner), and what it drops (a rename or a selection
// still waiting for its row, a local link that missed, the drop rules of a document that no longer
// edits); and what it makes of a message it cannot use. Over a host across a channel
// (messageSource), as the VS Code extension wires its table webview; ported from that extension's
// tests of it (data-explorer-vscode test/tableMainReviewFixes, nameSelectTarget, tableMainChildRows,
// refusedDialog and linkRoute at 632f6e0), which drove these through its table-main.ts. Each case is
// one the editing trace (editingTrace.test.ts) does not play.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { createWorkspace, messageSource, type TablePort, type TableSource, type Workspace } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

async function settle(table: DexTreeTable): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

let handles: TableHandle[] = [];
let workspaces: Workspace[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  for (const ws of workspaces) ws.dispose();
  handles = [];
  workspaces = [];
  document.body.replaceChildren();
});

/**
 * A table wired as the extension wires its webview, to a host the test plays: painted with
 * `first`, then what it posts, what it says is selected, and a way to send it what a host sends.
 */
async function hosted(first: Record<string, unknown>) {
  const posted: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const port: TablePort = { postMessage: (m) => void posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
  const table = document.createElement('dex-tree-table') as DexTreeTable;
  document.body.append(table);
  const handle = connectTable(table, messageSource(port), { editing: true });
  handles.push(handle);
  const selected: string[][] = [];
  handle.on('select', (rowIds) => void selected.push(rowIds));
  const send = (m: unknown) => hear(m);
  send(first);
  await settle(table);
  posted.length = 0;
  return { table, handle, posted, selected, send };
}

const DOC = 'file:///fx/d.sldd';
const A = 'd/design/A';
const B = 'd/design/B';
const B2 = 'd/design/B2';
const NEW = 'd/design/New';
const dictRows = (): any[] => [
  { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
  { ID: A, parent: 'section:design', Name: { label: 'A' }, _canCopy: true, _canDelete: true },
  { ID: B, parent: 'section:design', Name: { label: 'B' }, _canCopy: true, _canDelete: true },
];
const withoutB = () => dictRows().filter((r) => r.ID !== B);
const withNew = () => [...dictRows(), { ID: NEW, parent: 'section:design', Name: { label: 'New' } }];
const setRows = (rows: any[], over: Record<string, unknown> = {}) => ({
  type: 'setRows',
  docUri: DOC,
  rows,
  columns: ['Name'],
  columnLabels: { Name: 'Name' },
  editable: true,
  ...over,
});

describe('the painted event', () => {
  it('is sent after each whole paint, with its view, once its rows are in the table, and for nothing less', async () => {
    let hear: (m: unknown) => void = () => {};
    const port: TablePort = { postMessage: () => {}, onMessage: (l) => ((hear = l), () => (hear = () => {})) };
    const table = document.createElement('dex-tree-table') as DexTreeTable;
    document.body.append(table);
    const handle = connectTable(table, messageSource(port), { editing: true });
    handles.push(handle);
    const painted: { rows: number; same: boolean; tableRows: number; canCopy: boolean }[] = [];
    handle.on('painted', (view) => {
      // What an app reads off the handle as it hears it is the paint's.
      table.selectedRowIds = [A];
      painted.push({ rows: view.rows.length, same: view === handle.view, tableRows: table.rows.length, canCopy: handle.can('copy') });
      table.selectedRowIds = [];
    });
    // open()'s answer.
    hear(setRows(dictRows()));
    await settle(table);
    expect(painted).toEqual([{ rows: 3, same: true, tableRows: 3, canCopy: true }]);
    // An entry's repaint, and a selection, are no whole paint.
    hear({ type: 'updateEntryRows', entryRowId: A, rows: [dictRows()[1]] });
    hear({ type: 'select', rowIds: [B] });
    await settle(table);
    expect(painted).toHaveLength(1);
    // A replaceAll is.
    hear(setRows(withoutB()));
    await settle(table);
    expect(painted.map((p) => p.rows)).toEqual([3, 2]);
  });
});

describe('a listener that throws', () => {
  it("costs the table nothing: the source is still told of its paint, and the other listeners hear it", async () => {
    const opened = vi.fn();
    const source = {
      open: async () => ({ docUri: DOC, rows: dictRows(), columns: ['Name'], columnLabels: { Name: 'Name' } }),
      children: async () => ({ rows: [] }),
      matrix: async () => ({ message: '' }),
      inspect: async () => ({ groups: [] }),
      subscribe: () => () => {},
      opened,
    } as unknown as TableSource;
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    const table = document.createElement('dex-tree-table') as DexTreeTable;
    document.body.append(table);
    const handle = connectTable(table, source);
    handles.push(handle);
    const heard: number[] = [];
    handle.on('painted', () => {
      throw new Error('the app slipped');
    });
    handle.on('painted', (view) => void heard.push(view.rows.length));
    await settle(table);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([3]);
    expect(table.rows).toHaveLength(3);
    expect(String(said.mock.calls[0]?.[0])).toContain('the app slipped');
    said.mockRestore();
  });
});

describe('a selection across a repaint', () => {
  it('is cleared, and the host told once', async () => {
    // The clear waits a task, so a selection the host sends right behind the repaint (a rename's)
    // can take over first.
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [B];
    send(setRows(withoutB()));
    await settle(table);
    expect(table.selectedRowIds).toEqual([]);
    expect(selected).toEqual([[]]);
    send(setRows(withoutB()));
    await settle(table);
    expect(selected).toHaveLength(1);
  });

  it('a selection that survives in part keeps the part, and says nothing new', async () => {
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [A, B];
    send(setRows(withoutB()));
    await settle(table);
    expect(table.selectedRowIds).toEqual([A]);
    expect(selected).toEqual([]);
  });

  it('a rename re-selects the row under its new id without a "nothing selected" in between', async () => {
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [B];
    // The host asks for the new id first, then repaints (the JSON dictionary's rename).
    send({ type: 'selectRows', rowIds: [B2] });
    send(setRows(dictRows().map((r) => (r.ID === B ? { ...r, ID: B2, Name: { label: 'B2' } } : r))));
    await settle(table);
    expect(table.selectedRowIds).toEqual([B2]);
    expect(selected).toEqual([[B2]]);
  });

  it('nor when the host repaints the renamed entry first and asks for its new id after', async () => {
    // The narrow rename's order: updateEntryRows (the old id leaves the table), then selectRows
    // (the new id), as two messages. Cleared on the first and selected on the second, the table
    // would say "nothing selected" and then the new row, and an inspector would blank between.
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [B];
    send({ type: 'updateEntryRows', entryRowId: B, rows: [{ ID: B2, parent: 'section:design', Name: { label: 'B2' } }] });
    send({ type: 'selectRows', rowIds: [B2] });
    await settle(table);
    expect(table.selectedRowIds).toEqual([B2]);
    expect(selected).toEqual([[B2]]);
  });

  it('an entry-scoped repaint that removes the selected entry clears it too', async () => {
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [A];
    send({ type: 'updateEntryRows', entryRowId: A, rows: [] });
    await settle(table);
    expect(table.selectedRowIds).toEqual([]);
    expect(selected).toEqual([[]]);
  });

  it('a selection the user makes before the clear lands is theirs, and is not cleared', async () => {
    const { table, selected, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [B];
    send(setRows(withoutB()));
    table.selectedRowIds = [A];
    await settle(table);
    expect(table.selectedRowIds).toEqual([A]);
    expect(selected).toEqual([]);
  });
});

// A full paint holds every row it is going to, so a rename or a selection still waiting for its
// row after one has none to wait for: held, it would land on whatever row next takes that id
// (after an undo, a different entry).
describe('a full payload clears what it leaves stale', () => {
  /** The rows the table opened a Name editor on. */
  const renames = (table: DexTreeTable): string[] => {
    const opened: string[] = [];
    table.beginRename = (rowId: string) => (opened.push(rowId), true);
    return opened;
  };

  it('a rename whose row the payload lacks is dropped, not opened on a later row of that id', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    const opened = renames(table);
    send({ type: 'beginRename', rowId: NEW });
    send(setRows(dictRows()));
    send(setRows(withNew()));
    expect(opened).toEqual([]);
  });

  it('a rename whose row the payload carries still opens', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    const opened = renames(table);
    send({ type: 'beginRename', rowId: NEW });
    send(setRows(withNew()));
    expect(opened).toEqual([NEW]);
  });

  it('a selection whose rows the payload lacks is dropped too', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    table.selectedRowIds = [A];
    send({ type: 'selectRows', rowIds: [NEW] });
    send(setRows(dictRows()));
    send(setRows(withNew()));
    expect(table.selectedRowIds).toEqual([A]);
  });
});

// A by-name target (selectByName, a local link) means a top-level ENTRY, and a table with no
// section rows (a MAT-file's) has no section header for one to sit under: its variables ARE its
// top level. Read as "the parent is a section header", the entry pass there found nothing, and
// the fallback picked a nested field that shared the variable's name.
describe('a by-name selection in a table with no section rows prefers the top-level row', () => {
  it('selects the variable, not an earlier field of the same name', async () => {
    const { table, handle, selected } = await hosted({
      ...setRows([
        { ID: 'm/cfg', parent: null, Name: { label: 'cfg' } },
        { ID: 'm/cfg/gain', parent: 'm/cfg', Name: { label: 'gain' } },
        { ID: 'm/gain', parent: null, Name: { label: 'gain' } },
      ]),
      docUri: 'file:///fx/gains.mat',
    });
    handle.selectByName('gain');
    expect(table.selectedRowIds).toEqual(['m/gain']);
    expect(selected).toEqual([['m/gain']]);
  });

  it('a dictionary is unchanged: its section headers are never the entry a name means', async () => {
    const { table, handle } = await hosted(
      setRows([
        { ID: 'section:design', parent: null, Name: { label: 'A' } },
        { ID: B, parent: 'section:design', Name: { label: 'B' } },
        { ID: `${B}/A`, parent: B, Name: { label: 'A' } },
        { ID: A, parent: 'section:design', Name: { label: 'A' } },
      ]),
    );
    handle.selectByName('A');
    expect(table.selectedRowIds).toEqual([A]);
  });
});

// arch_binary.sldd spells `ValueType` at two depths: a bus ELEMENT named after the value type it
// references, whose Data Type cell links to it, and the `Simulink.ValueType` entry that link
// means. The element comes FIRST, because its interface is entered before the value type, so the
// first row in document order is the row the click came from, and the link looked dead. Every
// by-name target means the entry; a nested row is the fallback (a block named before SIDs has no
// entry). The rows are the workspace's own, from the real file: rows written here would keep the
// collision only as long as someone remembered to, and the collision is the whole test.
describe('a by-name navigation selects the definition, not a same-named child', () => {
  const HERE = 'file:///w/arch_binary.sldd';
  // The srcId a workspace registers a compressed-binary dictionary under, which its rows' ids and
  // its links spell.
  const SRC = `binedit:${HERE}`;
  const ENTRY_ROW = `${SRC}/arch/ValueType`;
  const ELEMENT_ROW = `${SRC}/arch/DataInterface/ValueType`;

  async function open() {
    const ws = createWorkspace();
    workspaces.push(ws);
    const doc = await ws.open(new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'arch_binary.sldd'))), 'arch_binary.sldd', HERE);
    const table = document.createElement('dex-tree-table') as DexTreeTable;
    document.body.append(table);
    const handle = connectTable(table, doc.table);
    handles.push(handle);
    await settle(table);
    const selected: string[][] = [];
    handle.on('select', (rowIds) => void selected.push(rowIds));
    return { table, handle, selected };
  }

  it('is a fixture where the name really is spelled twice', async () => {
    // If this ever stops holding, the cases below pass for the wrong reason: they would be asserting
    // the only row there is. The Data Type cell is read from the row too, so this also names where
    // the click comes from: the ELEMENT's cell, pointing at the ENTRY.
    const { table } = await open();
    expect(table.rows.filter((r) => r.Name?.label === 'ValueType').map((r) => r.ID)).toEqual([ELEMENT_ROW, ENTRY_ROW]);
    expect(table.rows.find((r) => r.ID === ELEMENT_ROW)?.DataType).toEqual({
      prefix: 'ValueType: ',
      text: 'ValueType',
      linkTarget: `ValueType@${SRC}`,
    });
  });

  it('selects the entry for a local Data Type click', async () => {
    const { table, selected } = await open();
    const target = (table.rows.find((r) => r.ID === ELEMENT_ROW)?.DataType as { linkTarget: string }).linkTarget;
    table.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target } }));
    expect(selected).toEqual([[ENTRY_ROW]]);
  });

  it('answers a host selectByName the same way', async () => {
    // The other path to the same matcher (a link from another document, an inspector's link):
    // one rule reached by two paths is where this kind of bug lives.
    const { handle, selected } = await open();
    handle.selectByName('ValueType');
    expect(selected).toEqual([[ENTRY_ROW]]);
  });

  it('still selects a nested row when no entry has the name', async () => {
    // The entry pass is a preference, not a filter: gated on entries alone, a target naming a row
    // deep in a block tree would select nothing.
    const { handle, selected } = await open();
    handle.selectByName('Element');
    expect(selected).toEqual([[`${SRC}/arch/StructType/Element`]]);
  });
});

describe('a local click that finds no row still reaches the host', () => {
  const HERE = 'file:///w/Controller.sldd';
  const paint = (names: string[]) =>
    setRows(names.map((name, i) => ({ ID: `r${i}`, parent: null, Name: { label: name } })), { docUri: HERE, editable: false });

  it('selects locally and posts no navigate when the row is here', async () => {
    // A read-only document is sent no drop rules, so the uri its setRows carries is the only one
    // it has to know a link into itself by.
    const { table, handle, selected } = await hosted(paint(['artFsAimCmd']));
    const navigated: string[] = [];
    handle.on('navigate', ({ target }) => void navigated.push(target));
    table.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: `artFsAimCmd@${HERE}` } }));
    expect(selected).toEqual([['r0']]);
    expect(navigated).toEqual([]);
  });

  it('does not let a missed local target hijack the next repaint', async () => {
    // A name held for its row is right for selectByName, whose target may arrive before its rows.
    // A local target's rows were already here, so a miss is a bad target, and held, it would
    // select the row the next repaint happens to bring, long after the click.
    const { table, handle, selected, send } = await hosted(paint(['artFsAimCmd']));
    const navigated: string[] = [];
    handle.on('navigate', ({ target }) => void navigated.push(target));
    table.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: `latecomer@${HERE}` } }));
    expect(navigated).toEqual([`latecomer@${HERE}`]);
    send(paint(['artFsAimCmd', 'latecomer']));
    await settle(table);
    expect(selected).toEqual([]);
    expect(table.selectedRowIds).toEqual([]);
  });
});

// A row whose children did not fit in a paint is asked about when it is opened. Its answer can
// still lose rows: a node with more direct children than one delivery holds. The paint's own
// banner cannot say so, since it was drawn before the user opened anything, so the answer carries
// the count and the table says it.
describe("an answer about a row's children, and what the table says of it", () => {
  const lazy = () =>
    setRows(
      [
        { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
        { ID: 'A', parent: 'section:design', Name: { label: 'A' }, _lazy: true },
        { ID: 'B', parent: 'section:design', Name: { label: 'B' } },
      ],
      { docUri: 'file:///fx/big.mat', columns: ['Name', 'Value'], columnLabels: { Name: 'Name', Value: 'Value' }, editable: false },
    );
  const kids = [
    { ID: 'A.k0', parent: 'A', Name: { label: 'k0' } },
    { ID: 'A.k1', parent: 'A', Name: { label: 'k1' } },
  ];
  /** The table asks about `nodeId`, as a click on its twisty does, and the host answers. */
  async function answer(hosting: Awaited<ReturnType<typeof hosted>>, nodeId: string, rows: unknown[], truncated: number) {
    hosting.table.dispatchEvent(new CustomEvent('dex-request-children', { detail: { nodeId } }));
    hosting.send({ type: 'childRows', nodeId, rows, truncated });
    await settle(hosting.table);
  }
  const ids = (table: DexTreeTable) => table.rows.map((r) => r.ID);

  it('says nothing to the user, because nothing was lost', async () => {
    const hosting = await hosted(lazy());
    await answer(hosting, 'A', kids, 0);
    expect(ids(hosting.table)).toEqual(['section:design', 'A', 'A.k0', 'A.k1', 'B']);
    expect(hosting.table.banners).toBeNull();
  });

  it('names the rows that are not there, because they have no twisty to offer', async () => {
    const hosting = await hosted(lazy());
    const { table } = hosting;
    await answer(hosting, 'A', kids, 143257);
    expect(table.banners?.error).toContain('143,257');
    expect(table.shadowRoot!.querySelector('.banner-error')?.textContent).toContain('143,257');
    // And the rows that did come are merged: a partial answer is worth having.
    expect(ids(table)).toEqual(['section:design', 'A', 'A.k0', 'A.k1', 'B']);
  });

  it('clears on the next payload, so it cannot outlive the view it describes', async () => {
    const hosting = await hosted(lazy());
    await answer(hosting, 'A', kids, 7);
    expect(hosting.table.banners?.error).toContain('7');
    hosting.send(lazy());
    expect(hosting.table.banners).toBeNull();
  });

  it('says nothing about a truncation the user cannot see either', async () => {
    // A repaint rebuilt the tree while the fetch was in flight: the count is about rows under a
    // row the table no longer has.
    const hosting = await hosted(lazy());
    await answer(hosting, 'gone', kids, 500);
    expect(hosting.table.banners).toBeNull();
    expect(ids(hosting.table)).toEqual(['section:design', 'A', 'B']);
  });
});

// A refused Add Child, Delete or Add is said in the dialog a refused cell edit is said in, which
// stays until it is closed, because the host often repaints right after it.
describe('a refusal, and a failure, across the repaint after them', () => {
  it('stays open through the repaint that follows it', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    const dialog = document.querySelector('dex-error-dialog')!;
    send({ type: 'refused', title: 'Cannot Delete', reason: "This element can't be removed from its parent." });
    send(setRows(dictRows()));
    await settle(table);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.shadowRoot!.textContent).toContain('Cannot Delete');
  });

  it('where a failure in the banner is cleared by it, which is why a refusal is not said there', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    send({ type: 'error', message: 'Failed to apply edit: boom' });
    expect(table.banners?.error).toBe('Failed to apply edit: boom');
    send(setRows(dictRows()));
    expect(table.banners).toBeNull();
  });
});

const RULES = { type: 'sectionRules', docUri: DOC, rules: [{ sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] }] };
const bus = { className: 'Simulink.Bus', arrayClass: 'Simulink.Bus', kind: 'Bus', isMatlabVariable: false, isScalarNumeric: false };

/** A dragover on the row, as the browser sends it; whether the table took it. */
function dragOver(table: DexTreeTable, rowId: string): boolean {
  const ev = new Event('dragover', { bubbles: true, cancelable: true }) as any;
  Object.assign(ev, { dataTransfer: { dropEffect: '', effectAllowed: '' }, altKey: false, ctrlKey: false, clientX: 0, clientY: 0 });
  table.shadowRoot!.querySelector(`tr[data-row-id="${rowId}"]`)!.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/** Cmd/Ctrl+V on the table. */
const pressPaste = (table: DexTreeTable) =>
  table.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true, composed: true }));

describe('the editing state across a repaint', () => {
  it('a drag in flight is still predicted after a repaint lands under it', async () => {
    // The drag the host broadcasts mirrors its drag register, which a repaint does not touch: only
    // the host ends a drag. Cleared by the repaint, the rest of the drag would be refused after,
    // say, the file changed on disk.
    const { table, send } = await hosted(setRows(dictRows()));
    send(RULES);
    send({ type: 'dragState', descriptor: { docUri: 'file:///fx/other.sldd', items: [{ ...bus, sectionName: 'design' }] } });
    await table.updateComplete;
    expect(dragOver(table, B)).toBe(true);
    send(setRows(dictRows()));
    send(RULES);
    await table.updateComplete;
    expect(dragOver(table, B)).toBe(true);
    send({ type: 'dragState', descriptor: null });
    expect(dragOver(table, B)).toBe(false);
  });

  it("a payload whose rows do not travel drops the document's rules; one whose rows do keeps them", async () => {
    const { table, posted, send } = await hosted(setRows(dictRows()));
    send({ type: 'clipboardState', canPaste: true, mode: 'copy', items: [bus] });
    const pasted = () => {
      table.selectedRowIds = [A];
      posted.length = 0;
      pressPaste(table);
      return posted.some((m) => m.type === 'paste');
    };
    // Rules are sent after the payload they belong to, and survive the next editable one.
    send(setRows(dictRows()));
    send(RULES);
    send(setRows(dictRows()));
    expect(pasted()).toBe(true);
    // A read-only payload: no rule is about this view any more.
    send(setRows(dictRows(), { editable: false }));
    send(setRows(dictRows()));
    expect(pasted()).toBe(false);
  });
});

// A message of a shape the table cannot use (a null, a field of the wrong kind) must not throw in
// the listener: a throw there is a table that stops repainting without a word. A row repaint the
// table cannot apply asks for the whole table, and the state messages keep only what is well-formed.
describe('a malformed message does not take the table down', () => {
  it('a message that is not an object is ignored', async () => {
    const { table, posted, send } = await hosted(setRows(dictRows()));
    for (const data of [null, undefined, 42, 'setRows', true]) send(data);
    expect(table.rows.map((r) => r.ID)).toEqual(dictRows().map((r) => r.ID));
    expect(posted).toEqual([]);
  });

  it('a row repaint whose rows are not a list asks for a full payload instead', async () => {
    const { table, posted, send } = await hosted(setRows(dictRows()));
    for (const type of ['updateEntryRows', 'insertEntryRows']) {
      posted.length = 0;
      send({ type, entryRowId: A, sectionRowId: 'section:design', rows: { not: 'a list' } });
      expect(posted, type).toEqual([{ type: 'ready' }]);
      // And nothing was removed on the strength of it.
      expect(table.rows.map((r) => r.ID), type).toEqual(dictRows().map((r) => r.ID));
    }
  });

  it('a full payload whose rows are not a list shows an empty table', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    send({ ...setRows([]), rows: 'oops' });
    expect(table.rows).toEqual([]);
  });

  it('an answer to a fetch whose rows are not a list is dropped', async () => {
    const { table, send } = await hosted(setRows(dictRows()));
    table.dispatchEvent(new CustomEvent('dex-request-children', { detail: { nodeId: A } }));
    send({ type: 'childRows', nodeId: A, rows: 7, truncated: 'many' });
    await settle(table);
    expect(table.rows.map((r) => r.ID)).toEqual(dictRows().map((r) => r.ID));
    expect(table.banners).toBeNull();
  });

  it('rules, clipboard items and a drag that are not well-formed keep only what is', async () => {
    const { table, posted, send } = await hosted(setRows(dictRows()));
    send({
      type: 'sectionRules',
      docUri: DOC,
      rules: [null, 5, { sectionLabel: 'no name' }, { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: 'all' }],
    });
    send({ type: 'clipboardState', canPaste: true, mode: 'copy', items: [null, 'x', bus] });
    send({ type: 'dragState', descriptor: { docUri: 'file:///fx/o.sldd', items: 'not a list' } });
    await table.updateComplete;
    table.selectedRowIds = [A];
    pressPaste(table);
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { rowId: A, x: 1, y: 1 } }));
    // A drag whose items are not a list is no drag: nothing to predict, so the row takes none.
    expect(dragOver(table, B)).toBe(false);
    // The one well-formed item, against the one well-formed rule (its allow-list that is not a list
    // read as no restriction).
    expect(posted.filter((m) => m.type === 'paste')).toEqual([{ type: 'paste', rowId: A }]);
  });
});

// A row-less paste or drop ('') means the document itself, which only a document with a
// whole-file rule (a MAT-file) can be a target as.
describe('a paste or drop with no row is posted only by a one-target document', () => {
  it('a menu opened at no row posts no paste once the rules have no whole-file target', async () => {
    // The guard on its real path: connectTable acts only on a choice from a menu it opened, and a
    // dictionary opens none at no row. A menu opened at no row of a MAT-file, whose rules then
    // become a dictionary's while it is still open, is the one way a choice anchored at no row
    // meets a document with no whole-file rule.
    const MAT = 'file:///fx/gains.mat';
    const { table, posted, send } = await hosted(setRows([{ ID: 'm/x', parent: null, Name: { label: 'x' } }], { docUri: MAT }));
    send({ type: 'sectionRules', docUri: MAT, rules: [{ sectionName: '', sectionLabel: 'gains.mat', isDerived: false, allowedTypes: [] }] });
    send({
      type: 'clipboardState',
      canPaste: true,
      mode: 'copy',
      items: [{ className: 'double', arrayClass: 'double', kind: 'Variable', isMatlabVariable: true, isScalarNumeric: true }],
    });
    await table.updateComplete;
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { rowId: null, x: 1, y: 1 } }));
    const menu = document.querySelector('dex-context-menu')!;
    expect(menu.hasAttribute('open'), 'the menu opened at no row').toBe(true);
    send({ type: 'sectionRules', docUri: MAT, rules: [{ sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] }] });
    posted.length = 0;
    menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: 'paste' } }));
    expect(posted.filter((m) => m.type === 'paste')).toEqual([]);
  });
});
