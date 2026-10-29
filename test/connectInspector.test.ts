// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectInspector: a property inspector following a feed, as the VS Code extension's inspector
// webview follows its host (its pi-main.ts, whose rules these are): beside a table, through the
// table's handle; and across a channel, through inspectorFeed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable } from '../src/widgets/tree-table/index.js';
import { connectInspector, definePropertyInspector } from '../src/widgets/property-inspector/index.js';
import type { DexVariableEditor } from '../src/widgets/variable-editor/index.js';
import { createWorkspace, inspectorFeed, type TablePort } from '../src/model/index.js';

defineTreeTable();
definePropertyInspector();

const NUMERIC = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/numeric_json.sldd')));

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
    pi.dispatchEvent(new CustomEvent('dex-pi-navigate', { detail: { sourceId: 'Kp@file:///w/x.sldd' }, bubbles: true }));
    pi.dispatchEvent(new CustomEvent('dex-pi-navigate', { detail: { sourceId: '' }, bubbles: true }));
    expect(targets).toEqual(['Kp@file:///w/x.sldd']);
  });
});
