// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectInspector: a property inspector following a feed, as the VS Code extension's inspector
// webview follows its host (its pi-main.ts, whose rules these are): beside a table, through the
// table's handle; and across a channel, through inspectorFeed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable } from '../src/widgets/tree-table/index.js';
import { connectInspector, definePropertyInspector } from '../src/widgets/property-inspector/index.js';
import type { DexMatrixGrid, DexVariableEditor, MatrixDescriptor } from '../src/widgets/variable-editor/index.js';
import { createWorkspace, inspectorFeed, type TablePort } from '../src/model/index.js';

defineTreeTable();
definePropertyInspector();

const NUMERIC = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/numeric_json.sldd')));
const PARAMS = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/params.sldd')));

async function settle(table?: DexTreeTable): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table?.updateComplete;
  }
}

function fakeEditor() {
  const calls: unknown[][] = [];
  const editor = {
    show: (...args: unknown[]) => calls.push(['show', ...args]),
    deliver: async (page: unknown) => void calls.push(['deliver', page]),
    close: () => calls.push(['close']),
    remove: () => {},
  };
  return { editor: editor as unknown as DexVariableEditor, calls };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
});

describe('beside a table', () => {
  async function composed() {
    const ws = createWorkspace();
    const doc = await ws.open(NUMERIC, 'numeric_json.sldd');
    const table = document.createElement('dex-tree-table');
    const pi = document.createElement('dex-property-inspector');
    const empty = document.createElement('p');
    document.body.append(table, pi, empty);
    const { editor, calls } = fakeEditor();
    const handle = connectTable(table, doc.table, { variableEditor: editor });
    const inspector = connectInspector(pi, handle, { empty });
    cleanups.push(() => (inspector.dispose(), handle.dispose(), ws.dispose()));
    await settle(table);
    const select = async (name: string) => {
      const row = table.rows.find((r) => r.Name.label === name)!;
      table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [row.ID] }, bubbles: true }));
      await settle(table);
      return row;
    };
    return { doc, table, pi, empty, select, calls };
  }

  it("shows the selection's first row, and the empty state for a section or nothing", async () => {
    const { doc, pi, empty, select } = await composed();
    expect(empty.hidden).toBe(false);
    expect(pi.hidden).toBe(true);
    const row = await select('Matrix');
    expect(pi.groups).toEqual((await doc.table.inspect(row.ID)).groups);
    expect(pi.hidden).toBe(false);
    expect(empty.hidden).toBe(true);
    await select('Design Data');
    expect(pi.groups).toEqual([]);
    expect(empty.hidden).toBe(false);
  });

  it("opens the table's editor on its own glyph, and a new page closes only a grid opened here", async () => {
    const { doc, pi, select, calls } = await composed();
    const row = await select('Matrix');
    const descriptor = pi.groups.flatMap((g) => g.properties).find((p) => p.matrix)!.matrix!;
    pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: descriptor, anchorEl: pi }, bubbles: true }));
    await settle();
    expect(calls.slice(-2)).toEqual([['show', pi, descriptor], ['deliver', await doc.table.matrix(row.ID)]]);
    const before = calls.length;
    await select('Array');
    expect(calls.slice(before)).toEqual([['close']]);
    await select('Matrix');
    expect(calls.slice(before + 1)).toEqual([]);
  });
});

describe('following another feed', () => {
  // One inspector beside a table per tab: it follows the active tab's table, and shows its empty
  // state while no tab has one.
  async function tabs() {
    const ws = createWorkspace();
    const params = await ws.open(PARAMS, 'params.sldd');
    const numeric = await ws.open(NUMERIC, 'numeric_json.sldd');
    const pi = document.createElement('dex-property-inspector');
    const empty = document.createElement('p');
    document.body.append(pi, empty);
    const shared = fakeEditor();
    const tab = (doc: typeof params, name: string, editor = shared.editor) => {
      const table = document.createElement('dex-tree-table');
      document.body.append(table);
      const handle = connectTable(table, doc.table, { variableEditor: editor });
      const select = async (label: string) => {
        const row = table.rows.find((r) => r.Name.label === label)!;
        table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [row.ID] }, bubbles: true }));
        await settle(table);
        return row;
      };
      return { doc, name, table, handle, select };
    };
    const a = tab(params, 'params.sldd');
    const b = tab(numeric, 'numeric_json.sldd');
    cleanups.push(() => (a.handle.dispose(), b.handle.dispose(), ws.dispose()));
    await settle(a.table);
    await settle(b.table);
    return { pi, empty, a, b, tab, calls: shared.calls };
  }

  it("switches to the new feed's page, keeps its listeners, and shows the empty state for null", async () => {
    const { pi, empty, a, b } = await tabs();
    const kp = await a.select('Kp');
    const matrix = await b.select('Matrix');
    const inspector = connectInspector(pi, a.handle, { empty });
    cleanups.push(() => inspector.dispose());
    const targets: string[] = [];
    inspector.on('navigate', (t) => targets.push(t));
    await settle();
    expect(pi.groups).toEqual((await a.doc.table.inspect(kp.ID)).groups);

    inspector.follow(b.handle);
    expect(pi.groups).toEqual([]);
    expect(empty.hidden).toBe(false);
    await settle();
    expect(pi.groups).toEqual((await b.doc.table.inspect(matrix.ID)).groups);
    expect(pi.hidden).toBe(false);
    // The table it left says nothing to it now.
    const uo = await a.select('Uo');
    expect(pi.groups).toEqual((await b.doc.table.inspect(matrix.ID)).groups);

    inspector.follow(null);
    expect(pi.groups).toEqual([]);
    expect(pi.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
    await b.select('Array');
    expect(pi.groups).toEqual([]);

    inspector.follow(a.handle);
    await settle();
    expect(pi.groups).toEqual((await a.doc.table.inspect(uo.ID)).groups);
    pi.dispatchEvent(new CustomEvent('dex-property-navigate', { detail: { sourceId: 'Kp@file:///w/x.sldd' }, bubbles: true }));
    expect(targets).toEqual(['Kp@file:///w/x.sldd']);
  });

  it('closes a grid it opened, and leaves one the table opened in the shared editor', async () => {
    const { pi, a, b, calls } = await tabs();
    await a.select('Kp');
    const matrix = await b.select('Matrix');
    const inspector = connectInspector(pi, b.handle, { variableEditor: b.handle.variableEditor });
    cleanups.push(() => inspector.dispose());
    await settle();
    const descriptor = pi.groups.flatMap((g) => g.properties).find((p) => p.matrix)!.matrix!;
    pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: descriptor, anchorEl: pi }, bubbles: true }));
    await settle();
    expect(calls.slice(-2)).toEqual([['show', pi, descriptor], ['deliver', await b.doc.table.matrix(matrix.ID)]]);
    let before = calls.length;
    inspector.follow(a.handle);
    expect(calls.slice(before)).toEqual([['close']]);
    await settle();

    // The table's own glyph, in the editor both share: following elsewhere leaves it open.
    b.table.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: matrix._matrix, anchorEl: b.table }, bubbles: true }));
    await settle(b.table);
    before = calls.length;
    inspector.follow(null);
    inspector.follow(b.handle);
    inspector.follow(b.handle); // the feed it follows: nothing
    await settle();
    expect(calls.slice(before)).toEqual([]);
  });

  it("opens the followed table's own editor when it is given none", async () => {
    const { pi, a, b, tab } = await tabs();
    const own = fakeEditor();
    const c = tab(b.doc, 'numeric again', own.editor);
    cleanups.push(() => c.handle.dispose());
    await settle(c.table);
    await c.select('Matrix');
    const inspector = connectInspector(pi, a.handle);
    cleanups.push(() => inspector.dispose());
    inspector.follow(c.handle);
    await settle();
    const descriptor = pi.groups.flatMap((g) => g.properties).find((p) => p.matrix)!.matrix!;
    pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: descriptor, anchorEl: pi }, bubbles: true }));
    await settle();
    expect(own.calls.map((call) => call[0])).toEqual(['close', 'show', 'deliver']);
  });

  it('starts with no feed, empty, and follows one when it is given', async () => {
    const { pi, empty, a } = await tabs();
    const kp = await a.select('Kp');
    const inspector = connectInspector(pi, null, { empty });
    cleanups.push(() => inspector.dispose());
    expect(empty.hidden).toBe(false);
    expect(pi.hidden).toBe(true);
    // A glyph with nothing followed asks nobody.
    pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: { name: 'M', className: 'double', dims: [1, 1], nodeId: 'n' }, anchorEl: pi }, bubbles: true }));
    inspector.follow(a.handle);
    await settle();
    expect(pi.groups).toEqual((await a.doc.table.inspect(kp.ID)).groups);
    // It uses the table's editor, and made none of its own.
    expect(document.querySelectorAll('dex-variable-editor')).toHaveLength(0);
    inspector.dispose();
    inspector.follow(null);
    expect(pi.groups).toEqual((await a.doc.table.inspect(kp.ID)).groups);

    // Given a feed with no editor, it makes one then, and takes it away on dispose().
    const pages = new Set<(page: { groups: [] }) => void>();
    const bare = connectInspector(pi, null);
    bare.follow({ onPage: (l) => (pages.add(l), () => void pages.delete(l)), matrix: async (nodeId) => ({ nodeId, message: 'none' }) });
    expect(document.querySelectorAll('dex-variable-editor')).toHaveLength(1);
    bare.dispose();
    expect(document.querySelectorAll('dex-variable-editor')).toHaveLength(0);
    expect(pages.size).toBe(0);
  });
});

describe("across a channel, from a host's pages", () => {
  function hostPort() {
    const posted: unknown[] = [];
    let hear: (m: unknown) => void = () => {};
    const port: TablePort = { postMessage: (m) => posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
    return { port, posted, send: (m: unknown) => hear(m) };
  }

  it("says ready, shows each page, asks for a glyph's cells and hands a cross-reference on", async () => {
    const { port, posted, send } = hostPort();
    const pi = document.createElement('dex-property-inspector');
    document.body.append(pi);
    const states: boolean[] = [];
    const { editor, calls } = fakeEditor();
    const feed = inspectorFeed(port);
    const inspector = connectInspector(pi, feed, { variableEditor: editor, empty: (e) => states.push(e) });
    cleanups.push(() => (inspector.dispose(), feed.dispose()));
    expect(states).toEqual([true]);
    expect(posted).toEqual([{ type: 'ready' }]);

    const groups = [{ title: 'Value', properties: [{ name: 'Value', value: '[1 2; 3 4]', matrix: { name: 'M', className: 'double', dims: [2, 2], nodeId: 'n' } }] }];
    send({ type: 'showProps', groups });
    expect(pi.groups).toEqual(groups);
    expect(states).toEqual([true, false]);

    pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: groups[0].properties[0].matrix, anchorEl: pi }, bubbles: true }));
    expect(posted.at(-1)).toEqual({ type: 'requestMatrix', nodeId: 'n' });
    const cells = { name: 'M', className: 'double', dims: [2, 2], nodeId: 'n', cells: ['1', '2', '3', '4'] };
    send({ type: 'matrixCells', nodeId: 'n', matrix: cells });
    await settle();
    expect(calls.at(-1)).toEqual(['deliver', { nodeId: 'n', matrix: cells }]);

    send({ type: 'empty' });
    expect(calls.at(-1)).toEqual(['close']);
    expect(states.at(-1)).toBe(true);

    const targets: string[] = [];
    inspector.on('navigate', (t) => targets.push(t));
    pi.dispatchEvent(new CustomEvent('dex-property-navigate', { detail: { sourceId: 'Kp@file:///w/x.sldd' }, bubbles: true }));
    pi.dispatchEvent(new CustomEvent('dex-property-navigate', { detail: { sourceId: '' }, bubbles: true }));
    expect(targets).toEqual(['Kp@file:///w/x.sldd']);
  });

  describe('the variable editor its glyph opens', () => {
    // It owns BOTH directions: the glyph's event out as a `requestMatrix`, and the host's
    // `matrixCells` back in as a deliver(). Keeping the pair in one place is the point — an
    // inspector that asked but never listened would open a panel that waits forever. These drive
    // a real editor, where the cases above use a fake one.
    const descriptor = (over: Partial<MatrixDescriptor> = {}): MatrixDescriptor =>
      ({ name: 'A', className: 'double', dims: [2, 2], nodeId: 'n1', ...over });
    const cells = (over: Partial<MatrixDescriptor> = {}) =>
      ({ type: 'matrixCells', nodeId: descriptor(over).nodeId, matrix: { ...descriptor(over), cells: ['1', '2', '3', '4'] } });
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    function wire(withEditor = true) {
      const host = hostPort();
      const pi = document.createElement('dex-property-inspector');
      const anchor = document.createElement('button');
      document.body.append(pi, anchor);
      const editor = withEditor ? document.createElement('dex-variable-editor') : undefined;
      if (editor) document.body.append(editor);
      const feed = inspectorFeed(host.port);
      const inspector = connectInspector(pi, feed, { variableEditor: editor, empty: () => {} });
      cleanups.push(() => (editor?.close(), inspector.dispose(), feed.dispose()));
      // What connecting says first: the inspector is up (`ready`). The cases are about what follows.
      host.posted.length = 0;
      const fire = (detail: unknown) =>
        pi.dispatchEvent(new CustomEvent('dex-matrix-open', { detail, bubbles: true, composed: true }));
      return { ...host, pi, anchor, editor: editor!, inspector, fire };
    }

    function title(editor: DexVariableEditor): string {
      return editor.shadowRoot!.querySelector('.title')!.textContent!.trim();
    }

    it('opens the editor on the event, anchored on the glyph that fired it', async () => {
      const { editor, anchor, fire } = wire();
      fire({ matrix: descriptor({ name: 'Mat' }), anchorEl: anchor });
      await frame();
      await editor.updateComplete;
      expect(editor.hasAttribute('open')).toBe(true);
      expect(title(editor)).toBe('Mat — 2x2 double');
      // Closing hands focus back to that glyph.
      editor.shadowRoot!.querySelector<HTMLButtonElement>('.close')!.focus();
      editor.close();
      expect(document.activeElement).toBe(anchor);
    });

    it('asks the host for the cells of exactly the node that was opened', () => {
      const { posted, anchor, fire } = wire();
      fire({ matrix: descriptor({ name: 'Mat', nodeId: 'node-9' }), anchorEl: anchor });
      expect(posted).toEqual([{ type: 'requestMatrix', nodeId: 'node-9' }]);
    });

    it('delivers the host’s answer into the open editor', async () => {
      const { editor, anchor, fire, send } = wire();
      fire({ matrix: descriptor(), anchorEl: anchor });
      await frame();
      send(cells());
      await settle();
      await editor.updateComplete;
      const grid = editor.shadowRoot!.querySelector('dex-matrix-grid') as DexMatrixGrid;
      expect(grid.matrix!.cells).toEqual(['1', '2', '3', '4']);
    });

    it('leaves every other host message alone', async () => {
      // The same channel carries showProps, the answers to other requests, and whatever else the
      // host sends. Reacting to one of those would hand the editor a payload-shaped thing that is
      // not one. A page comes last: it closes the editor, which is a different rule.
      const { editor, anchor, fire, send } = wire();
      fire({ matrix: descriptor(), anchorEl: anchor });
      await frame();
      const spy = vi.spyOn(editor, 'deliver');
      for (const data of [undefined, null, 'matrixCells', { type: 'setRows', rows: [] }, { type: 'matrixCells' },
        cells({ nodeId: 'not-asked' }), { type: 'empty' }]) {
        expect(() => send(data)).not.toThrow();
      }
      await settle();
      expect(spy).not.toHaveBeenCalled();
    });

    it('closes on the next page, which is what showProps and empty are', async () => {
      const { editor, anchor, fire, send } = wire();
      for (const page of [{ type: 'showProps', groups: [] }, { type: 'empty' }]) {
        fire({ matrix: descriptor(), anchorEl: anchor });
        await frame();
        expect(editor.hasAttribute('open')).toBe(true);
        send(page);
        await editor.updateComplete;
        expect(editor.hasAttribute('open')).toBe(false);
      }
    });

    it('ignores an event with no descriptor, and asks for nothing', async () => {
      const { editor, posted, anchor, fire } = wire();
      for (const detail of [undefined, null, { anchorEl: anchor }, { matrix: descriptor() }]) fire(detail);
      await frame();
      await editor.updateComplete;
      expect(editor.hasAttribute('open')).toBe(false);
      expect(posted).toEqual([]);
    });

    it('asks for nothing when the descriptor carries no node id', async () => {
      // Nothing to fetch with. Opening a panel that can never be answered is worse than not
      // opening one, so neither happens.
      const { editor, posted, anchor, fire } = wire();
      fire({ matrix: { name: 'A', className: 'double', dims: [2, 2] }, anchorEl: anchor });
      fire({ matrix: descriptor({ nodeId: '' }), anchorEl: anchor });
      await frame();
      await editor.updateComplete;
      expect(posted).toEqual([]);
      expect(editor.hasAttribute('open')).toBe(false);
    });

    it('makes an editor of its own when the page passes none', async () => {
      const { inspector, posted, anchor, fire } = wire(false);
      fire({ matrix: descriptor({ name: 'Own' }), anchorEl: anchor });
      await frame();
      const made = document.body.querySelector('dex-variable-editor')!;
      await made.updateComplete;
      expect(made.hasAttribute('open')).toBe(true);
      expect(title(made)).toBe('Own — 2x2 double');
      expect(posted).toEqual([{ type: 'requestMatrix', nodeId: 'n1' }]);
      made.close();
      inspector.dispose();
      expect(document.body.querySelector('dex-variable-editor')).toBeNull();
    });

    it('stops listening in both directions after dispose', async () => {
      // dispose() alone, with the channel still up: the glyph asks nothing, and the host's pages
      // no longer reach the inspector.
      const { editor, pi, posted, anchor, inspector, fire, send } = wire();
      const groups = [{ title: 'Value', properties: [{ name: 'Value', value: '1' }] }];
      send({ type: 'showProps', groups });
      inspector.dispose();
      fire({ matrix: descriptor(), anchorEl: anchor });
      await frame();
      await editor.updateComplete;
      expect(editor.hasAttribute('open')).toBe(false);
      expect(posted).toEqual([]);
      send({ type: 'empty' });
      send({ type: 'showProps', groups: [] });
      expect(pi.groups).toEqual(groups);
    });
  });
});
