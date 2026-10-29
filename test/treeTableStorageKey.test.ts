// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Where the column choices are kept. The order the user dragged the columns into and the ones
// they hid live in the page's localStorage, under keys every table used to share: hiding a column
// in a MAT-file's table hid it in a dictionary's, and nothing namespaced the keys against the rest
// of an app's page. `storageKey` names them. Its default is the old keys exactly — VS Code's users
// have layouts saved under them — and null keeps the choices out of storage altogether.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DexTreeTable, defineTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';

defineTreeTable();

const COLUMNS = ['Name', 'Value', 'DataType', 'UsedBy', 'Status', 'Kind', 'Class', 'Description'];
const OLD_KEYS = ['dex-column-order', 'dex-hidden-columns', 'dex-known-columns'];

async function mount(configure: (t: DexTreeTable) => void = () => {}, after?: (t: DexTreeTable) => void): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = COLUMNS;
  configure(table);
  document.body.appendChild(table);
  after?.(table);
  await table.updateComplete;
  return table;
}

const visible = (t: DexTreeTable): string[] => (t as any)._visibleColumns;
const toggle = (t: DexTreeTable, col: string): void => (t as any)._toggleColumnVisibility(col);
const keys = (): string[] => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('by default', () => {
  it("is 'dex', and the attribute is storage-key", async () => {
    const table = await mount();
    expect(table.storageKey).toBe('dex');
    const el = document.createElement('dex-tree-table') as DexTreeTable;
    el.setAttribute('storage-key', 'mine');
    expect(el.storageKey).toBe('mine');
  });

  it('keeps the choices under the keys every table has always used, and no other', async () => {
    const table = await mount();
    toggle(table, 'Kind');
    (table as any)._resetColumns(new Event('click'));
    toggle(table, 'Class');
    expect(keys()).toEqual(OLD_KEYS.slice().sort());
    expect(JSON.parse(localStorage.getItem('dex-hidden-columns')!)).not.toContain('Class');
  });

  it('reads a layout saved under those keys, as before', async () => {
    localStorage.setItem('dex-column-order', JSON.stringify(['Name', 'Status', 'Value', 'DataType', 'UsedBy']));
    localStorage.setItem('dex-hidden-columns', JSON.stringify(['Value']));
    const table = await mount();
    expect(visible(table).slice(0, 4)).toEqual(['Name', 'Status', 'DataType', 'UsedBy']);
  });

  it('is one layout for every table that keeps the default', async () => {
    const a = await mount();
    toggle(a, 'Kind');
    const b = await mount();
    expect(visible(b)).toContain('Kind');
  });
});

describe('a key of its own', () => {
  it('keeps the choices under that key, apart from the default ones', async () => {
    const mat = await mount((t) => (t.storageKey = 'app-mat'));
    toggle(mat, 'Kind');
    expect(keys()).toEqual(['app-mat-hidden-columns', 'app-mat-known-columns']);

    const dictionary = await mount();
    expect(visible(dictionary)).not.toContain('Kind');
    const again = await mount((t) => (t.storageKey = 'app-mat'));
    expect(visible(again)).toContain('Kind');
  });

  it('is read again when set after the table was connected', async () => {
    localStorage.setItem('app-mat-hidden-columns', JSON.stringify([]));
    localStorage.setItem('app-mat-known-columns', JSON.stringify(['Name', 'Value', 'DataType', 'UsedBy', 'Status', 'Kind', 'Class']));
    // Appended first and configured after: the default layout was read on connect.
    const table = await mount(undefined, (t) => (t.storageKey = 'app-mat'));
    expect(visible(table)).toContain('Kind');
    expect(visible(table)).toContain('Class');
    // And a key that holds nothing is the defaults, not the layout read before it.
    table.storageKey = 'empty';
    await table.updateComplete;
    expect(visible(table)).not.toContain('Kind');
  });
});

describe('null', () => {
  it('keeps the choices for the element only, and never touches localStorage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const table = await mount((t) => (t.storageKey = null));
    toggle(table, 'Kind');
    (table as any)._onMenuDragStart('Status', new Event('dragstart'));
    expect(visible(table)).toContain('Kind');
    (table as any)._resetColumns(new Event('click'));
    expect(visible(table)).not.toContain('Kind');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(keys()).toEqual([]);
  });

  it("'' is the same", async () => {
    const table = await mount((t) => (t.storageKey = ''));
    toggle(table, 'Kind');
    expect(keys()).toEqual([]);
  });

  it('set after connecting, starts from the defaults rather than the shared layout', async () => {
    localStorage.setItem('dex-hidden-columns', JSON.stringify([]));
    localStorage.setItem('dex-known-columns', JSON.stringify(['Name', 'Value', 'DataType', 'UsedBy', 'Status', 'Kind', 'Class']));
    const table = await mount(undefined, (t) => (t.storageKey = null));
    expect(visible(table)).not.toContain('Kind');
    // Read on connect, as the default always was; from then on nothing is written to it.
    const saved = localStorage.getItem('dex-hidden-columns');
    toggle(table, 'Kind');
    expect(localStorage.getItem('dex-hidden-columns')).toBe(saved);
  });
});
