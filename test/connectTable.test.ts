// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable: a tree table fed by a source, as the VS Code extension's table webview feeds its
// own (its table-main.ts, whose rules these are). Against an in-page source, and against a host
// across a channel (messageSource), where what the table SENDS is part of the contract.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable, type TableBanners, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { DexVariableEditor } from '../src/widgets/variable-editor/index.js';
import { defineContextMenu, type DexContextMenu } from '../src/widgets/context-menu/index.js';
import { createWorkspace, messageSource, type TableChange, type TablePort, type TableSource, type Workspace } from '../src/model/index.js';

defineTreeTable();

const bytes = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, rel)));
const NUMERIC = bytes('./fixtures/numeric_json.sldd');
const TYPELINK = bytes('../test-integration/fixtures/typelink/typelink.sldd');
const PARAMS = bytes('./fixtures/params.sldd');

/** Every pending answer delivered, and the table drawn. */
async function settle(table: DexTreeTable): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

/** A variable editor that records what it is asked. */
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

let workspaces: Workspace[] = [];
let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  for (const ws of workspaces) ws.dispose();
  handles = [];
  workspaces = [];
  document.body.replaceChildren();
});

async function mount(file: Uint8Array, name: string, opts: { rowBudget?: number; uri?: string } = {}) {
  const ws = createWorkspace(opts.rowBudget ? { rowBudget: opts.rowBudget } : {});
  workspaces.push(ws);
  const doc = await ws.open(file, name, opts.uri);
  const table = document.createElement('dex-tree-table');
  document.body.append(table);
  const { editor, calls } = fakeEditor();
  const handle = connectTable(table, doc.table, { variableEditor: editor });
  handles.push(handle);
  await settle(table);
  return { doc, table, handle, editorCalls: calls };
}

describe('the first paint', () => {
  it('shows what open() answers: rows, columns, headings, and the top level open', async () => {
    const { doc, table, handle } = await mount(NUMERIC, 'numeric_json.sldd');
    const view = await doc.table.open();
    expect(handle.view).toEqual(view);
    expect(table.rows).toEqual(view.rows);
    expect(table.columns).toEqual(view.columns);
    expect(table.columnLabels).toEqual(view.columnLabels);
    expect(table.columnGroups).toEqual(view.columnGroups);
    expect(table.loading).toBe(false);
    expect(table.expandTopLevel).toBe(true);
    expect([...table.expandedIds].sort()).toEqual(view.rows.filter((r) => r.parent === null && !r._lazy).map((r) => r.ID).sort());
    expect(table.banners).toBeNull();
  });

  it('is Loading… until the source answers', async () => {
    const table = document.createElement('dex-tree-table');
    document.body.append(table);
    const never: TableSource = {
      open: () => new Promise(() => {}),
      children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
      matrix: async (nodeId) => ({ nodeId, message: 'none' }),
      inspect: async () => ({ groups: [] }),
      subscribe: () => () => {},
    };
    handles.push(connectTable(table, never, { variableEditor: fakeEditor().editor }));
    expect(table.loading).toBe(true);
  });

  it("draws the paint's banners in the table's strip: what the paint held back", async () => {
    const { table } = await mount(NUMERIC, 'numeric_json.sldd', { rowBudget: 5 });
    expect(table.banners?.warnings?.headline).toMatch(/^This file is too large to load at once/);
    const strip = table.shadowRoot!.querySelector('.banners')!;
    expect(strip.querySelector('.banner-warning [class="banner-headline"]')?.textContent).toMatch(/too large/);
    expect(strip.querySelectorAll('.banner-details li').length).toBeGreaterThan(0);
  });

  it("says why a file cannot be shown, in the error banner, and stops loading", async () => {
    const { table } = await mount(new TextEncoder().encode('{"x": '), 'bad.sldd');
    expect(table.loading).toBe(false);
    expect(table.banners?.error).toMatch(/^Failed to parse bad\.sldd: /);
    expect(table.shadowRoot!.querySelector('.banner-error')?.getAttribute('role')).toBe('alert');
  });

  it('draws the banners elsewhere when the app says where', async () => {
    const ws = createWorkspace({ rowBudget: 5 });
    workspaces.push(ws);
    const doc = await ws.open(NUMERIC, 'numeric_json.sldd');
    const table = document.createElement('dex-tree-table');
    document.body.append(table);
    const drawn: unknown[] = [];
    handles.push(connectTable(table, doc.table, { variableEditor: fakeEditor().editor, banners: (b) => drawn.push(b) }));
    await settle(table);
    expect(table.banners).toBeNull();
    expect(drawn.at(-1)).toMatchObject({ warnings: { headline: expect.stringMatching(/too large/) } });
  });
});

describe('what the table asks', () => {
  it("fetches a deferred row's children and merges them under it", async () => {
    const { doc, table } = await mount(NUMERIC, 'numeric_json.sldd', { rowBudget: 5 });
    const lazy = table.rows.find((r) => r._lazy)!;
    const { rows } = await doc.table.children(lazy.ID);
    table.expand([lazy.ID]);
    await settle(table);
    for (const child of rows) expect(table.rows.some((r) => r.ID === child.ID), child.ID).toBe(true);
    expect(table.rows.find((r) => r.ID === lazy.ID)?._lazy).toBeUndefined();
  });

  it('opens the variable editor on a glyph and fills it with the cells', async () => {
    const { doc, table, editorCalls } = await mount(NUMERIC, 'numeric_json.sldd');
    const row = table.rows.find((r) => r.Name.label === 'Matrix')!;
    const anchor = document.createElement('a');
    table.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: row._matrix, anchorEl: anchor }, bubbles: true }));
    await settle(table);
    const page = await doc.table.matrix(row._matrix!.nodeId);
    expect(editorCalls.filter((c) => c[0] !== 'close')).toEqual([['show', anchor, row._matrix], ['deliver', page]]);
    expect(page.matrix?.cells).toEqual(['1', '2', '3', '4']);
  });

  it('focuses the search box on Ctrl+F and Cmd+F', async () => {
    const { table } = await mount(PARAMS, 'params.sldd');
    const focus = vi.spyOn(table, 'focusFilter');
    for (const key of [{ ctrlKey: true }, { metaKey: true }]) {
      const e = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ...key });
      table.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    table.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(2);
  });
});

describe('the selection', () => {
  it("says the user's selection, and selects what select() and selectByName() ask", async () => {
    const { table, handle } = await mount(PARAMS, 'params.sldd');
    const heard: string[][] = [];
    handle.on('select', (ids) => heard.push(ids));
    const [kp, uo] = table.rows.filter((r) => !String(r.ID).startsWith('section:'));
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [kp.ID] }, bubbles: true }));
    handle.select([uo.ID]);
    expect(table.selectedRowIds).toEqual([uo.ID]);
    handle.selectByName('Kp');
    expect(table.selectedRowIds).toEqual([kp.ID]);
    // Held until the row comes: nothing yet, then selected when a repaint brings it.
    handle.select(['file:///params.sldd/design/Later']);
    expect(table.selectedRowIds).toEqual([kp.ID]);
    expect(heard).toEqual([[kp.ID], [uo.ID], [kp.ID]]);
  });

  it('keeps the rows of a selection a reload still has, and clears one it took away a task later', async () => {
    const { doc, table, handle } = await mount(PARAMS, 'params.sldd');
    const heard: string[][] = [];
    handle.on('select', (ids) => heard.push(ids));
    const entries = table.rows.filter((r) => !String(r.ID).startsWith('section:'));
    table.selectedRowIds = entries.map((r) => r.ID);
    // The same file again: every row stays, so does the selection, and nothing is said.
    await doc.reload(PARAMS);
    await settle(table);
    expect(table.selectedRowIds).toEqual(entries.map((r) => r.ID));
    // Another file: every selected row went.
    await doc.reload(bytes('./fixtures/chain_leaf.sldd'));
    await table.updateComplete;
    expect(heard).toEqual([]);
    await settle(table);
    expect(table.selectedRowIds).toEqual([]);
    expect(heard).toEqual([[]]);
  });

  it('a select() right after a repaint that took the selection away cancels the clear', async () => {
    const { doc, table, handle } = await mount(PARAMS, 'params.sldd');
    const heard: string[][] = [];
    handle.on('select', (ids) => heard.push(ids));
    table.selectedRowIds = [table.rows[1].ID];
    await doc.reload(bytes('./fixtures/chain_leaf.sldd'));
    const now = table.rows.find((r) => !String(r.ID).startsWith('section:'))!;
    handle.select([now.ID]);
    await settle(table);
    expect(heard).toEqual([[now.ID]]);
    expect(table.selectedRowIds).toEqual([now.ID]);
  });
});

describe('links', () => {
  const URI = 'file:///w/typelink.sldd';
  it('selects the row a Data Type link names in this document', async () => {
    const { table, handle } = await mount(TYPELINK, 'typelink.sldd', { uri: URI });
    const navigated: unknown[] = [];
    handle.on('navigate', (n) => navigated.push(n));
    table.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: `MyAlias@${URI}` }, bubbles: true }));
    expect(table.selectedRowIds).toEqual([`${URI}/design/MyAlias`]);
    expect(navigated).toEqual([]);
  });

  it('hands every other target to the app, parsed', async () => {
    const { table, handle } = await mount(TYPELINK, 'typelink.sldd', { uri: URI });
    const navigated: unknown[] = [];
    handle.on('navigate', (n) => navigated.push(n));
    const click = (target: string) =>
      table.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target }, bubbles: true }));
    click('Other@file:///w/other.sldd');
    click(`blocks:65@${URI}`);
    click('plant.slx');
    click(`Missing@${URI}`); // local, but no such row: the app may resolve what this table cannot
    expect(navigated).toEqual([
      { target: 'Other@file:///w/other.sldd', link: { kind: 'entry', name: 'Other', source: 'file:///w/other.sldd' } },
      { target: `blocks:65@${URI}`, link: { kind: 'block', block: '65', source: URI } },
      { target: 'plant.slx', link: { kind: 'file', file: 'plant.slx' } },
      { target: `Missing@${URI}`, link: { kind: 'entry', name: 'Missing', source: URI } },
    ]);
  });
});

describe('the read-only context menu', () => {
  function fakeMenu() {
    const shown: unknown[][] = [];
    const menu = Object.assign(new EventTarget(), { show: (...a: unknown[]) => shown.push(a), remove() {} });
    return { menu: menu as unknown as DexContextMenu, shown };
  }

  it("offers the selection's name and value, then the app's items, and copies or says which", async () => {
    const ws = createWorkspace();
    workspaces.push(ws);
    const doc = await ws.open(PARAMS, 'params.sldd');
    const table = document.createElement('dex-tree-table');
    document.body.append(table);
    const { menu, shown } = fakeMenu();
    const handle = connectTable(table, doc.table, {
      variableEditor: fakeEditor().editor,
      contextMenu: menu,
      menuItems: () => [{ id: 'reveal', label: 'Reveal in Folder' }],
    });
    handles.push(handle);
    await settle(table);
    const kp = table.rows.find((r) => r.Name.label === 'Kp')!;
    table.selectedRowIds = [kp.ID];
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 3, y: 4, rowId: kp.ID }, bubbles: true }));
    expect(shown).toEqual([
      [
        3,
        4,
        [
          { id: 'copyName', label: 'Copy Name', icon: 'copy' },
          { id: 'copyValue', label: 'Copy Value' },
          { id: '', label: '', separator: true },
          { id: 'reveal', label: 'Reveal in Folder' },
        ],
      ],
    ]);
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
    menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: 'copyName' } }));
    expect(written).toEqual(['Kp']);
    const actions: unknown[] = [];
    handle.on('action', (a) => actions.push(a));
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 3, y: 4, rowId: kp.ID }, bubbles: true }));
    menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: 'reveal' } }));
    expect(actions).toEqual([{ actionId: 'reveal', rowId: kp.ID, rowIds: [kp.ID] }]);
  });

  it('acts for the table that opened a shared menu, and for none whose menu was dismissed', async () => {
    defineContextMenu();
    const menu = document.createElement('dex-context-menu');
    document.body.append(menu);
    const ws = createWorkspace();
    workspaces.push(ws);
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
    const actions: string[] = [];
    const open = async (file: Uint8Array, name: string, row: string) => {
      const doc = await ws.open(file, name);
      const table = document.createElement('dex-tree-table');
      document.body.append(table);
      const handle = connectTable(table, doc.table, {
        variableEditor: fakeEditor().editor,
        contextMenu: menu,
        menuItems: () => [{ id: 'reveal', label: 'Reveal in Folder' }],
      });
      handles.push(handle);
      handle.on('action', ({ rowIds }) => actions.push(`${name} ${rowIds.length}`));
      await settle(table);
      const id = table.rows.find((r) => r.Name.label === row)!.ID;
      table.selectedRowIds = [id];
      return () => table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 3, y: 4, rowId: id }, bubbles: true }));
    };
    const rightClickA = await open(PARAMS, 'params.sldd', 'Kp');
    const rightClickB = await open(NUMERIC, 'numeric_json.sldd', 'Matrix');
    const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const choose = async (label: string) => {
      await frame();
      await menu.updateComplete;
      [...menu.shadowRoot!.querySelectorAll<HTMLElement>('.item')].find((i) => i.textContent?.includes(label))!.click();
    };

    // Opened from A and dismissed with Escape; opened from B, whose Copy Name is chosen.
    rightClickA();
    await frame();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hasAttribute('open')).toBe(false);
    rightClickB();
    await choose('Copy Name');
    expect(written).toEqual(['Matrix']);

    // Opened from A and dismissed by a click elsewhere; B's own item is chosen.
    rightClickA();
    await frame();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    rightClickB();
    await choose('Reveal in Folder');
    expect(actions).toEqual(['numeric_json.sldd 1']);

    // Opened from A, then from B over it (no dismissal between, as the menu key does): B's.
    rightClickA();
    rightClickB();
    await choose('Copy Name');
    expect(written).toEqual(['Matrix', 'Matrix']);
    // And A's menu, chosen from, is A's.
    rightClickA();
    await choose('Copy Name');
    expect(written).toEqual(['Matrix', 'Matrix', 'Kp']);

    // Opened from A and dismissed; the app then fills the same menu with an item of its own.
    rightClickA();
    await frame();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    menu.show(0, 0, [{ id: 'reveal', label: 'Reveal in Folder' }]);
    await choose('Reveal in Folder');
    expect(actions).toEqual(['numeric_json.sldd 1']);
  });

  it('acts for the table that opened it last even in a menu that never says it closed', async () => {
    const ws = createWorkspace();
    workspaces.push(ws);
    const { menu } = fakeMenu();
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
    const rightClicks: (() => void)[] = [];
    for (const [file, name, row] of [[PARAMS, 'params.sldd', 'Kp'], [NUMERIC, 'numeric_json.sldd', 'Matrix']] as const) {
      const doc = await ws.open(file, name);
      const table = document.createElement('dex-tree-table');
      document.body.append(table);
      handles.push(connectTable(table, doc.table, { variableEditor: fakeEditor().editor, contextMenu: menu }));
      await settle(table);
      const id = table.rows.find((r) => r.Name.label === row)!.ID;
      table.selectedRowIds = [id];
      rightClicks.push(() => table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: id }, bubbles: true })));
    }
    rightClicks[0]();
    rightClicks[1]();
    menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: 'copyName' } }));
    // A's context went with that choice, made in B's menu: a second one finds no table's.
    menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: 'copyName' } }));
    expect(written).toEqual(['Matrix']);
  });

  it('opens none when told not to, and none for a selection of section headings', async () => {
    const ws = createWorkspace();
    workspaces.push(ws);
    const doc = await ws.open(PARAMS, 'params.sldd');
    for (const menuOn of [false, true]) {
      const table = document.createElement('dex-tree-table');
      document.body.append(table);
      const { menu, shown } = fakeMenu();
      handles.push(connectTable(table, doc.table, { variableEditor: fakeEditor().editor, contextMenu: menu, menu: menuOn }));
      await settle(table);
      const section = table.rows.find((r) => r.parent === null)!;
      table.selectedRowIds = menuOn ? [section.ID] : [table.rows[1].ID];
      table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: table.selectedRowIds[0] }, bubbles: true }));
      expect(shown).toEqual([]);
    }
  });

  describe('copying', () => {
    /** A table on params.sldd with a menu, and a way to choose Copy Name or Copy Value for rows. */
    async function copier(options: Parameters<typeof connectTable>[2] = {}, source?: (s: TableSource) => TableSource) {
      const ws = createWorkspace();
      workspaces.push(ws);
      const doc = await ws.open(PARAMS, 'params.sldd');
      const table = document.createElement('dex-tree-table');
      document.body.append(table);
      const { menu } = fakeMenu();
      const handle = connectTable(table, source ? source(doc.table) : doc.table, { variableEditor: fakeEditor().editor, contextMenu: menu, ...options });
      handles.push(handle);
      await settle(table);
      const failures: unknown[] = [];
      handle.on('copyFailed', (f) => failures.push(f));
      const choose = async (actionId: 'copyName' | 'copyValue', ...names: string[]) => {
        table.selectedRowIds = names.map((n) => table.rows.find((r) => r.Name.label === n)!.ID);
        table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: table.selectedRowIds[0] }, bubbles: true }));
        menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId } }));
        await settle(table);
      };
      return { table, failures, choose };
    }

    it("puts the text on the app's clipboard when it gives one, and not the page's", async () => {
      const page = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: page }, configurable: true });
      const copied: string[] = [];
      const { table, failures, choose } = await copier({ copy: (text) => void copied.push(text) });
      await choose('copyName', 'Kp', 'Uo');
      await choose('copyValue', 'Kp');
      expect(copied).toEqual(['Kp\nUo', cellOf(table, 'Kp', 'Value')]);
      expect(copied[1]).not.toBe('');
      expect(page).not.toHaveBeenCalled();
      expect(failures).toEqual([]);
      expect(table.banners).toBeNull();
    });

    it('says a copy that failed, in the error banner and to the handle, until one succeeds', async () => {
      let refuse: 'reject' | 'throw' | null = 'reject';
      const { table, failures, choose } = await copier({
        copy: (text) => {
          if (refuse === 'throw') throw new Error('no clipboard here');
          if (refuse === 'reject') return Promise.reject(new Error('Document is not focused.'));
          return void text;
        },
      });
      await choose('copyName', 'Kp');
      expect(failures).toEqual([{ text: 'Kp', message: 'Document is not focused.' }]);
      expect(table.banners?.error).toBe('Could not copy to the clipboard: Document is not focused.');
      expect(table.shadowRoot!.querySelector('.banner-error')?.getAttribute('role')).toBe('alert');
      refuse = 'throw';
      await choose('copyName', 'Uo');
      expect(failures.at(-1)).toEqual({ text: 'Uo', message: 'no clipboard here' });
      expect(table.banners?.error).toBe('Could not copy to the clipboard: no clipboard here');
      refuse = null;
      await choose('copyName', 'Kp');
      expect(table.banners).toBeNull();
      expect(failures).toHaveLength(2);
    });

    it('gives back the error a failed copy covered, and leaves one a repaint drew', async () => {
      let say: (change: TableChange) => void = () => {};
      const spy = (s: TableSource): TableSource => ({ ...s, subscribe: (l) => ((say = l), s.subscribe(l)) });
      let refuse = true;
      const { table, choose } = await copier({ copy: () => (refuse ? Promise.reject(new Error('no')) : undefined) }, spy);
      say({ kind: 'error', message: 'Failed to apply edit: no.' });
      await choose('copyName', 'Kp');
      await choose('copyName', 'Kp');
      expect(table.banners?.error).toBe('Could not copy to the clipboard: no');
      refuse = false;
      await choose('copyName', 'Kp');
      expect(table.banners?.error).toBe('Failed to apply edit: no.');

      refuse = true;
      await choose('copyName', 'Kp');
      say({ kind: 'error', message: 'Another.' });
      refuse = false;
      await choose('copyName', 'Kp');
      expect(table.banners?.error).toBe('Another.');
    });

    it("says it of the page's clipboard too: one that refuses, and none at all", async () => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('Write permission denied.')) }, configurable: true });
      const { table, failures, choose } = await copier();
      await choose('copyValue', 'Kp');
      expect(failures).toEqual([{ text: cellOf(table, 'Kp', 'Value'), message: 'Write permission denied.' }]);
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      await choose('copyName', 'Kp');
      expect(table.banners?.error).toBe('Could not copy to the clipboard: this page has no clipboard access');
    });

    it('draws the failure where the app draws its banners', async () => {
      const drawn: TableBanners[] = [];
      const { table, choose } = await copier({ copy: () => Promise.reject(new Error('no')), banners: (b) => drawn.push(b) });
      await choose('copyName', 'Kp');
      expect(drawn.at(-1)?.error).toBe('Could not copy to the clipboard: no');
      expect(table.banners).toBeNull();
    });
  });
});

/** What the table shows in `column` for the row named `name`. */
function cellOf(table: DexTreeTable, name: string, column: string): string {
  const cell = table.rows.find((r) => r.Name.label === name)?.[column];
  return typeof cell === 'string' ? cell : (cell as { text?: string } | undefined)?.text ?? '';
}

describe('the inspector feed', () => {
  it('pages the first selected row, refreshes on a reload, and sends a page only when it changes', async () => {
    const { doc, table, handle } = await mount(PARAMS, 'params.sldd');
    const pages: unknown[] = [];
    handle.onPage((p) => pages.push(p));
    const kp = table.rows.find((r) => r.Name.label === 'Kp')!;
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [kp.ID] }, bubbles: true }));
    await settle(table);
    expect(pages).toEqual([await doc.table.inspect(kp.ID)]);
    await doc.reload(PARAMS); // the same file: the same page, not sent again
    await settle(table);
    expect(pages).toHaveLength(1);
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [table.rows[0].ID] }, bubbles: true }));
    await settle(table);
    expect(pages.at(-1)).toEqual({ groups: [] });
  });
});

describe('against a host across a channel', () => {
  /** A port whose host is the test: what the table posts, and a way to answer. */
  function hostPort() {
    const posted: any[] = [];
    let hear: (m: unknown) => void = () => {};
    const port: TablePort = {
      postMessage: (m) => posted.push(m),
      onMessage: (listener) => ((hear = listener), () => (hear = () => {})),
    };
    return { port, posted, send: (m: unknown) => hear(m) };
  }

  it("posts what the extension's table posts, and paints what its host sends", async () => {
    const ws = createWorkspace({ rowBudget: 5 });
    workspaces.push(ws);
    const doc = await ws.open(NUMERIC, 'numeric_json.sldd');
    const view = await doc.table.open();
    const { port, posted, send } = hostPort();
    const table = document.createElement('dex-tree-table');
    document.body.append(table);
    const { editor } = fakeEditor();
    handles.push(connectTable(table, messageSource(port), { variableEditor: editor }));
    expect(posted).toEqual([{ type: 'ready' }]);
    send({ type: 'setRows', ...view, hasTextView: true });
    await settle(table);
    expect(table.rows).toEqual(view.rows);

    const lazy = view.rows.find((r) => r._lazy)!;
    table.expand([lazy.ID]);
    const matrixRow = view.rows.find((r) => r._matrix)!;
    table.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: matrixRow._matrix, anchorEl: table }, bubbles: true }));
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [lazy.ID] }, bubbles: true }));
    expect(posted.slice(1)).toEqual([
      { type: 'requestChildren', nodeId: lazy.ID },
      { type: 'requestMatrix', nodeId: matrixRow._matrix!.nodeId },
    ]);
    send({ type: 'childRows', ...(await doc.table.children(lazy.ID)) });
    await settle(table);
    expect(table.rows.length).toBeGreaterThan(view.rows.length);

    // An entry repaint the table cannot apply: it asks for the whole table again.
    send({ type: 'updateEntryRows', entryRowId: 'no such entry', rows: [] });
    await settle(table);
    expect(posted.at(-1)).toEqual({ type: 'ready' });
    send({ type: 'error', message: 'Failed to apply edit: no.' });
    await settle(table);
    expect(table.banners?.error).toBe('Failed to apply edit: no.');
    send({ type: 'setRows', ...view });
    await settle(table);
    expect(table.banners?.error).toBeUndefined();
  });
});
