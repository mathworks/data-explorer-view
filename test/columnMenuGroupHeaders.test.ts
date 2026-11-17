// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Columns menu's group headers, as the in-MATLAB data explorer's Columns dropdown has them
// (its design's G2-G4): each group has a toggle that folds it, a box over its columns, its name,
// which folds it too, and "a of b". A group opens expanded when it shows a column; the window then
// keeps each group's fold for every table of the storageKey, and nothing of it is saved.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../src/model/rows/rowBuilder.js';

defineTreeTable();

beforeEach(() => {
  localStorage.clear();
});

// The fold state is the window's, for every test of this file: each test takes a key of its own.
let keys = 0;
const freshKey = (): string => `fold-${++keys}`;

function row(id: string): TreeTableRow {
  return { ID: id, parent: null, Name: { label: id }, Value: '', DataType: '', Description: '', Status: '' } as TreeTableRow;
}

async function mount(storageKey = freshKey()): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.storageKey = storageKey;
  table.columns = COLUMNS;
  table.columnLabels = COLUMN_LABELS;
  table.columnGroups = COLUMN_GROUPS;
  document.body.appendChild(table);
  table.rows = [row('a')];
  await table.updateComplete;
  return table;
}

async function openMenu(table: DexTreeTable): Promise<HTMLElement> {
  (table.shadowRoot!.querySelector('.columns-button') as HTMLElement).click();
  await table.updateComplete;
  return table.shadowRoot!.querySelector('.column-menu') as HTMLElement;
}

async function closeMenu(table: DexTreeTable): Promise<void> {
  (table.shadowRoot!.querySelector('.columns-button') as HTMLElement).click();
  await table.updateComplete;
}

// A group's header and rows, by the name the header shows.
function group(table: DexTreeTable, label: string) {
  const headers = Array.from(table.shadowRoot!.querySelectorAll('.column-menu-group-header')) as HTMLElement[];
  const header = headers.find((h) => h.querySelector('.column-menu-group-label')!.textContent!.trim() === label);
  if (!header) throw new Error(`no group ${label}`);
  const toggle = header.querySelector('.column-menu-toggle') as HTMLButtonElement;
  const controls = toggle.getAttribute('aria-controls');
  return {
    header,
    toggle,
    box: header.querySelector('.column-menu-group-check') as HTMLInputElement,
    name: header.querySelector('.column-menu-group-label') as HTMLElement,
    count: header.querySelector('.column-menu-group-count')!.textContent!.trim(),
    rows: controls ? (table.shadowRoot!.getElementById(controls) as HTMLElement) : null,
  };
}

const expanded = (table: DexTreeTable, label: string): boolean => {
  const g = group(table, label);
  expect(g.rows?.hidden ?? true).toBe(g.toggle.getAttribute('aria-expanded') !== 'true');
  return g.toggle.getAttribute('aria-expanded') === 'true';
};

const hidden = (table: DexTreeTable): Set<string> => (table as any)._hiddenColumns;

describe('a group header', () => {
  it('has a toggle, a box over the columns, the name and "a of b"', async () => {
    const table = await mount();
    (table as any)._toggleColumnVisibility('Min');
    await openMenu(table);
    const g = group(table, 'Data Object');
    expect(g.count).toBe('1 of 6');
    expect(g.box.getAttribute('aria-label')).toBe('Show all Data Object columns');
    expect(g.box.getAttribute('aria-describedby')).toBe(g.header.querySelector('.column-menu-group-count')!.id);
    expect(g.toggle.getAttribute('aria-labelledby')).toBe(g.name.id);
    expect(g.rows!.querySelectorAll('.column-menu-item').length).toBe(6);
    table.remove();
  });

  it("opens expanded when its group shows a column, folded when it shows none, and says so", async () => {
    const table = await mount();
    (table as any)._toggleColumnVisibility('Min');
    await openMenu(table);
    expect(expanded(table, 'Data Object')).toBe(true);
    expect(expanded(table, 'Code Generation')).toBe(false);
    expect(group(table, 'Code Generation').toggle.textContent!.trim()).toBe('▸');
    expect(group(table, 'Data Object').toggle.textContent!.trim()).toBe('▾');
    table.remove();
  });

  it('folds and unfolds by its toggle and by its name; the name never checks the group', async () => {
    const table = await mount();
    await openMenu(table);
    group(table, 'Code Generation').toggle.click();
    await table.updateComplete;
    expect(expanded(table, 'Code Generation')).toBe(true);
    const before = new Set(hidden(table));
    group(table, 'Code Generation').name.click();
    await table.updateComplete;
    expect(expanded(table, 'Code Generation')).toBe(false);
    expect(hidden(table)).toEqual(before);
    table.remove();
  });
});

describe("a group's fold", () => {
  it('is kept while the window lasts, for every table of the storageKey, and saved nowhere', async () => {
    const key = freshKey();
    const first = await mount(key);
    await openMenu(first);
    group(first, 'Code Generation').toggle.click();
    await first.updateComplete;
    await closeMenu(first);
    await openMenu(first);
    expect(expanded(first, 'Code Generation')).toBe(true);
    first.remove();

    const second = await mount(key);
    await openMenu(second);
    expect(expanded(second, 'Code Generation')).toBe(true);
    second.remove();
    const other = await mount();
    await openMenu(other);
    expect(expanded(other, 'Code Generation')).toBe(false);
    other.remove();
    // Only the column choices a table always keeps are in storage.
    const saved = Object.keys(localStorage);
    expect(saved.filter((k) => !/-(column-order|hidden-columns|known-columns|property-columns)$/.test(k))).toEqual([]);
  });

  it("is what the group opened in while the menu is open: unchecking a group's last column does not fold it", async () => {
    const table = await mount();
    (table as any)._toggleColumnVisibility('Min');
    await openMenu(table);
    (table as any)._toggleColumnVisibility('Min');
    await table.updateComplete;
    expect(group(table, 'Data Object').count).toBe('0 of 6');
    expect(expanded(table, 'Data Object')).toBe(true);
    await closeMenu(table);
    await openMenu(table);
    expect(expanded(table, 'Data Object')).toBe(true);
    table.remove();
  });

  it('is left alone by Reset', async () => {
    const table = await mount();
    await openMenu(table);
    group(table, 'Variant Bank').toggle.click();
    await table.updateComplete;
    (table.shadowRoot!.querySelector('.column-menu-reset') as HTMLElement).click();
    await table.updateComplete;
    expect(expanded(table, 'Variant Bank')).toBe(true);
    table.remove();
  });
});

describe("a group's box", () => {
  it('is mixed while some columns show, checked when all do, and empty when none do', async () => {
    const table = await mount();
    await openMenu(table);
    const box = () => group(table, 'Data Dictionary').box;
    expect([box().checked, box().indeterminate]).toEqual([false, false]);
    (table as any)._toggleColumnVisibility('lastModified');
    await table.updateComplete;
    expect([box().checked, box().indeterminate]).toEqual([false, true]);
    (table as any)._toggleColumnVisibility('lastModifiedBy');
    await table.updateComplete;
    expect([box().checked, box().indeterminate]).toEqual([true, false]);
    table.remove();
  });

  it('shows every column of a group not all shown, and hides every one of a group all shown', async () => {
    const table = await mount();
    (table as any)._toggleColumnVisibility('Min');
    await openMenu(table);
    const box = () => group(table, 'Data Object').box;
    box().click();
    await table.updateComplete;
    for (const col of ['dimensions', 'dimensionsMode', 'complexity', 'Min', 'Max', 'Unit']) expect(hidden(table).has(col), col).toBe(false);
    expect(group(table, 'Data Object').count).toBe('6 of 6');
    box().click();
    await table.updateComplete;
    for (const col of ['dimensions', 'dimensionsMode', 'complexity', 'Min', 'Max', 'Unit']) expect(hidden(table).has(col), col).toBe(true);
    // Kept as any column's shown or hidden state is.
    expect(JSON.parse(localStorage.getItem(`${table.storageKey}-hidden-columns`)!)).toContain('Unit');
    // Other groups are untouched.
    expect(hidden(table).has('storageClass')).toBe(true);
    expect(hidden(table).has('Value')).toBe(false);
    table.remove();
  });
});

describe('Other Properties', () => {
  async function addProperty(table: DexTreeTable, name: string): Promise<void> {
    const input = table.shadowRoot!.querySelector('.column-menu-input') as HTMLInputElement;
    input.value = name;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
    await table.updateComplete;
  }

  it('has the same header; with no property column there is nothing to fold or check, and it counts 0 of 0', async () => {
    const table = await mount();
    await openMenu(table);
    const g = group(table, 'Other Properties');
    expect(g.toggle.disabled).toBe(true);
    expect(g.box.disabled).toBe(true);
    expect(g.count).toBe('0 of 0');
    table.remove();
  });

  it('folds its columns away but keeps the field, and Add unfolds it so the new column is seen', async () => {
    const table = await mount();
    await openMenu(table);
    await addProperty(table, 'MyPropA');
    expect(expanded(table, 'Other Properties')).toBe(true);
    group(table, 'Other Properties').toggle.click();
    await table.updateComplete;
    expect(expanded(table, 'Other Properties')).toBe(false);
    expect((table.shadowRoot!.querySelector('.column-menu-input') as HTMLElement).closest('[hidden]')).toBeNull();
    await addProperty(table, 'MyPropB');
    expect(expanded(table, 'Other Properties')).toBe(true);
    expect(group(table, 'Other Properties').count).toBe('2 of 2');
    // Its box hides and shows the property columns, as any group's does.
    group(table, 'Other Properties').box.click();
    await table.updateComplete;
    expect(hidden(table).has('prop:MyPropA') && hidden(table).has('prop:MyPropB')).toBe(true);
    table.remove();
  });
});
