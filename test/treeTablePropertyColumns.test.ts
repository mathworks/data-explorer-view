// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Property columns: the Columns menu's Other Properties group takes any property name typed into
// its field and shows it as a column, whose cells are the rows' `_props` of that name, empty on a
// row whose object has no such property. As the in-MATLAB data explorer's Columns dropdown: a
// built-in column's name or label shows that column instead, a name that is no property name is
// refused with a notice, Reset leaves the property columns alone, and × removes one.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../src/model/rows/rowBuilder.js';

defineTreeTable();

beforeEach(() => {
  localStorage.clear();
});

function row(id: string, props?: Record<string, string>): TreeTableRow {
  return {
    ID: id,
    parent: null,
    Name: { label: id },
    Value: '',
    DataType: '',
    Description: '',
    Status: '',
    ...(props ? { _props: props } : {}),
  } as TreeTableRow;
}

const ROWS = [row('objA', { MyPropA: 'alpha', MyPropB: '2' }), row('objB', { MyPropA: 'beta' }), row('plain')];

async function mount(storageKey = 'dex'): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.storageKey = storageKey;
  table.columns = COLUMNS;
  table.columnLabels = COLUMN_LABELS;
  table.columnGroups = COLUMN_GROUPS;
  document.body.appendChild(table);
  table.rows = ROWS;
  await table.updateComplete;
  return table;
}

async function openMenu(table: DexTreeTable): Promise<HTMLElement> {
  (table.shadowRoot!.querySelector('.columns-button') as HTMLElement).click();
  await table.updateComplete;
  return table.shadowRoot!.querySelector('.column-menu') as HTMLElement;
}

const input = (table: DexTreeTable): HTMLInputElement =>
  table.shadowRoot!.querySelector('.column-menu-input') as HTMLInputElement;

// Types `name` into the field and presses Enter.
async function typeName(table: DexTreeTable, name: string): Promise<void> {
  input(table).value = name;
  input(table).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
  await table.updateComplete;
}

const visible = (table: DexTreeTable): string[] => (table as any)._visibleColumns;
const notice = (table: DexTreeTable): string =>
  table.shadowRoot!.querySelector('.column-menu-notice')?.textContent?.trim() ?? '';
const headerLabels = (table: DexTreeTable): string[] =>
  Array.from(table.shadowRoot!.querySelectorAll('th .th-label')).map((el) => el.textContent!.trim());

// The text of `col`'s cell in each row, in row order.
function columnCells(table: DexTreeTable, label: string): string[] {
  const at = headerLabels(table).indexOf(label);
  if (at < 0) throw new Error(`no column ${label}`);
  return Array.from(table.shadowRoot!.querySelectorAll('tr.data-row')).map(
    (tr) => (tr.querySelectorAll('td')[at] as HTMLElement).textContent!.trim(),
  );
}

describe('adding a property column', () => {
  it("a typed property name is a column at the table's end: each row's value, empty where the object has none", async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    expect(visible(table).at(-1)).toBe('prop:MyPropA');
    expect(headerLabels(table).at(-1)).toBe('MyPropA');
    expect(columnCells(table, 'MyPropA')).toEqual(['alpha', 'beta', '']);
    // The field is emptied for the next name, and the column is listed in Other Properties.
    expect(input(table).value).toBe('');
    const listed = table.shadowRoot!.querySelectorAll('.column-menu-bottom .column-menu-item .col-label');
    expect(Array.from(listed).map((el) => el.textContent!.trim())).toEqual(['MyPropA']);
    table.remove();
  });

  it('a property no row has is a column of empty cells', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropC');
    expect(columnCells(table, 'MyPropC')).toEqual(['', '', '']);
    table.remove();
  });

  it('Add does what Enter does', async () => {
    const table = await mount();
    await openMenu(table);
    input(table).value = '  MyPropB ';
    (table.shadowRoot!.querySelector('.column-menu-add-button') as HTMLElement).click();
    await table.updateComplete;
    expect(columnCells(table, 'MyPropB')).toEqual(['2', '', '']);
    table.remove();
  });

  it("a built-in column's name or label shows that column, and adds no property column", async () => {
    const table = await mount();
    await openMenu(table);
    expect(visible(table)).not.toContain('storageClass');
    await typeName(table, 'StorageClass');
    expect(visible(table)).toContain('storageClass');
    // A label, in any case, spaces and all.
    await typeName(table, 'last modified by');
    expect(visible(table)).toContain('lastModifiedBy');
    expect(input(table).value).toBe('');
    expect(notice(table)).toBe('');
    expect((table as any)._propertyColumns).toEqual([]);
    table.remove();
  });

  it('a name that is no property name is refused, says why, and stays in the field to be corrected', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'CoderInfo.Identifier');
    expect(notice(table)).toBe('"CoderInfo.Identifier" is not a valid property name.');
    expect(input(table).value).toBe('CoderInfo.Identifier');
    expect(input(table).getAttribute('aria-invalid')).toBe('true');
    expect((table as any)._propertyColumns).toEqual([]);
    // An edit takes the notice down.
    input(table).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await table.updateComplete;
    expect(notice(table)).toBe('');
    table.remove();
  });

  it('a name already shown is refused as already in the list; a hidden one is shown again', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    await typeName(table, 'MyPropA');
    expect(notice(table)).toBe('"MyPropA" is already in the list.');
    (table as any)._toggleColumnVisibility('prop:MyPropA');
    input(table).value = '';
    await typeName(table, 'MyPropA');
    expect(notice(table)).toBe('');
    expect(visible(table)).toContain('prop:MyPropA');
    expect((table as any)._propertyColumns).toEqual(['MyPropA']);
    table.remove();
  });

  it("the field's keys stay in the field: none reaches the table", async () => {
    const table = await mount();
    await openMenu(table);
    const seen: string[] = [];
    table.addEventListener('keydown', (e) => seen.push((e as KeyboardEvent).key));
    for (const key of ['a', 'Delete', 'ArrowDown', 'Enter']) {
      input(table).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
    }
    expect(seen).toEqual([]);
    table.remove();
  });
});

describe('Escape in the field', () => {
  it('closes the menu and gives the focus back to the Columns button', async () => {
    const table = await mount();
    await openMenu(table);
    input(table).focus();
    input(table).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    await table.updateComplete;
    expect(table.shadowRoot!.querySelector('.column-menu')).toBeNull();
    expect(table.shadowRoot!.activeElement).toBe(table.shadowRoot!.querySelector('.columns-button'));
    table.remove();
  });
});

describe('a property column, once added', () => {
  it('is kept under the storageKey, shown or hidden, for the next table', async () => {
    const first = await mount('k');
    await openMenu(first);
    await typeName(first, 'MyPropA');
    await typeName(first, 'MyPropB');
    (first as any)._toggleColumnVisibility('prop:MyPropB');
    first.remove();

    const next = await mount('k');
    expect((next as any)._propertyColumns).toEqual(['MyPropA', 'MyPropB']);
    expect(visible(next)).toContain('prop:MyPropA');
    expect(visible(next)).not.toContain('prop:MyPropB');
    next.remove();
  });

  it('is shown and hidden by its box, and moves among the property columns only', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    await typeName(table, 'MyPropB');
    // Not onto a built-in column, and no built-in one onto it.
    (table as any)._menuDragCol = 'prop:MyPropB';
    (table as any)._menuDragOverSide = 'top';
    (table as any)._onMenuDrop('Value', { preventDefault() {} } as unknown as DragEvent);
    (table as any)._menuDragCol = 'Status';
    (table as any)._menuDragOverSide = 'top';
    (table as any)._onMenuDrop('prop:MyPropA', { preventDefault() {} } as unknown as DragEvent);
    expect(visible(table).slice(-2)).toEqual(['prop:MyPropA', 'prop:MyPropB']);
    // Among themselves, it moves, and that order is kept.
    (table as any)._menuDragCol = 'prop:MyPropB';
    (table as any)._menuDragOverSide = 'top';
    (table as any)._onMenuDrop('prop:MyPropA', { preventDefault() {} } as unknown as DragEvent);
    expect(visible(table).slice(-2)).toEqual(['prop:MyPropB', 'prop:MyPropA']);
    expect(JSON.parse(localStorage.getItem('dex-property-columns')!)).toEqual(['MyPropB', 'MyPropA']);
    table.remove();
  });

  it('is searched by its name, and its cells by any term', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    const shown = (text: string): string[] =>
      (table as any)._filterRows(table.rows, text).map((r: TreeTableRow) => r.ID);
    expect(shown('MyPropA:beta')).toEqual(['objB']);
    expect(shown('alpha')).toEqual(['objA']);
    table.remove();
  });

  it('stays through Reset, shown or hidden as it was, while the built-in columns go back to their defaults', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    await typeName(table, 'MyPropB');
    (table as any)._toggleColumnVisibility('prop:MyPropB');
    (table as any)._toggleColumnVisibility('Status');
    (table.shadowRoot!.querySelector('.column-menu-reset') as HTMLElement).click();
    await table.updateComplete;
    expect(visible(table)).toContain('Status');
    expect(visible(table)).toContain('prop:MyPropA');
    expect(visible(table)).not.toContain('prop:MyPropB');
    expect((table as any)._propertyColumns).toEqual(['MyPropA', 'MyPropB']);
    table.remove();
  });

  it('is removed by its ×, with its hidden mark and sort, and stays removed', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, 'MyPropA');
    (table as any)._sortState = [{ column: 'prop:MyPropA', direction: 'asc' }];
    const remove = table.shadowRoot!.querySelector('.column-menu-bottom .column-menu-remove') as HTMLElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove MyPropA');
    remove.click();
    await table.updateComplete;
    expect(visible(table)).not.toContain('prop:MyPropA');
    expect(headerLabels(table)).not.toContain('MyPropA');
    expect((table as any)._sortState).toEqual([]);
    expect(JSON.parse(localStorage.getItem('dex-property-columns')!)).toEqual([]);
    // The menu stays open: × is a click inside it.
    expect(table.shadowRoot!.querySelector('.column-menu')).not.toBeNull();
    table.remove();
  });
});
