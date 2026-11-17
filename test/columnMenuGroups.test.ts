// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Columns menu's groups and layout, as the in-MATLAB data explorer's Columns dropdown has
// them: a column is reordered within its group only (in the menu and by its header), the table's
// columns are always group by group, Reset sits at the top beside the title, Other Properties is at
// the bottom, and the built-in columns between them are the part that scrolls.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../src/model/rows/rowBuilder.js';

defineTreeTable();

beforeEach(() => {
  localStorage.clear();
});

function row(id: string): TreeTableRow {
  return { ID: id, parent: null, Name: { label: id }, Value: '', DataType: '', Description: '', Status: '' } as TreeTableRow;
}

async function mount(): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = COLUMNS;
  table.columnLabels = COLUMN_LABELS;
  table.columnGroups = COLUMN_GROUPS;
  (table as any)._hiddenColumns = new Set<string>();
  document.body.appendChild(table);
  table.rows = [row('a'), row('b')];
  await table.updateComplete;
  return table;
}

async function openMenu(table: DexTreeTable): Promise<HTMLElement> {
  (table.shadowRoot!.querySelector('.columns-button') as HTMLElement).click();
  await table.updateComplete;
  return table.shadowRoot!.querySelector('.column-menu') as HTMLElement;
}

const ordered = (table: DexTreeTable): string[] => (table as any)._orderedColumns;

function menuItem(table: DexTreeTable, label: string): HTMLElement {
  const items = Array.from(table.shadowRoot!.querySelectorAll('.column-menu-item')) as HTMLElement[];
  const found = items.find((el) => (el.querySelector('.col-label') as HTMLElement).textContent!.trim() === label);
  if (!found) throw new Error(`no column-menu item for ${label}`);
  return found;
}

function headerFor(table: DexTreeTable, col: string): HTMLElement {
  const label = COLUMN_LABELS[col] ?? col;
  const th = Array.from(table.shadowRoot!.querySelectorAll('th')).find(
    (el) => el.querySelector('.th-label')?.textContent?.trim() === label,
  );
  if (!th) throw new Error(`no header for ${col}`);
  return th as HTMLElement;
}

function dragEvent(type: string): DragEvent {
  return new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
}

describe('reordering in the menu stays within the group', () => {
  it('a column moves among its own group: Max above Min in Data Object', async () => {
    const table = await mount();
    await openMenu(table);
    menuItem(table, 'Max').dispatchEvent(dragEvent('dragstart'));
    const over = dragEvent('dragover');
    menuItem(table, 'Min').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    (table as any)._menuDragOverSide = 'top';
    menuItem(table, 'Min').dispatchEvent(dragEvent('drop'));
    expect(ordered(table).indexOf('Max')).toBe(ordered(table).indexOf('Min') - 1);
    table.remove();
  });

  it('an item of another group is no drop target: the dragover is not accepted and the drop moves nothing', async () => {
    const table = await mount();
    await openMenu(table);
    const before = [...ordered(table)];
    // Storage Class (Code Generation) onto Min (Data Object).
    menuItem(table, 'Storage Class').dispatchEvent(dragEvent('dragstart'));
    const over = dragEvent('dragover');
    menuItem(table, 'Min').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect((table as any)._menuDragOverCol).toBeNull();
    menuItem(table, 'Min').dispatchEvent(dragEvent('drop'));
    expect(ordered(table)).toEqual(before);
    expect(localStorage.getItem('dex-column-order')).toBeNull();
    table.remove();
  });

  it('a column with no group moves among the others with none, and into no group', async () => {
    const table = await mount();
    await openMenu(table);
    const before = [...ordered(table)];
    (table as any)._menuDragCol = 'Value';
    (table as any)._menuDragOverSide = 'bottom';
    (table as any)._onMenuDrop('Unit', { preventDefault() {} } as unknown as DragEvent);
    expect(ordered(table)).toEqual(before);
    (table as any)._menuDragCol = 'Value';
    (table as any)._menuDragOverSide = 'bottom';
    (table as any)._onMenuDrop('Status', { preventDefault() {} } as unknown as DragEvent);
    expect(ordered(table).indexOf('Value')).toBe(ordered(table).indexOf('Status') + 1);
    table.remove();
  });
});

describe('reordering by the header stays within the group', () => {
  it('a header of another group is no drop target, and a drop on it moves nothing', async () => {
    const table = await mount();
    const before = [...ordered(table)];
    headerFor(table, 'storageClass').dispatchEvent(dragEvent('dragstart'));
    const over = dragEvent('dragover');
    headerFor(table, 'Min').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    headerFor(table, 'Min').dispatchEvent(dragEvent('drop'));
    expect(ordered(table)).toEqual(before);
    table.remove();
  });

  it('a header of the same group takes the drop', async () => {
    const table = await mount();
    headerFor(table, 'alignment').dispatchEvent(dragEvent('dragstart'));
    const over = dragEvent('dragover');
    headerFor(table, 'storageClass').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    (table as any)._dragOverSide = 'left';
    headerFor(table, 'storageClass').dispatchEvent(dragEvent('drop'));
    expect(ordered(table).indexOf('alignment')).toBe(ordered(table).indexOf('storageClass') - 1);
    table.remove();
  });
});

describe('the columns are always group by group', () => {
  it('an order saved before the rule, with a column outside its group, is shown grouped, each group in its saved order', () => {
    localStorage.setItem(
      'dex-column-order',
      JSON.stringify(['Name', 'storageClass', 'Value', 'Max', 'DataType', 'Min', ...COLUMNS.filter((c) => !['Name', 'storageClass', 'Value', 'Max', 'DataType', 'Min'].includes(c))]),
    );
    const table = new DexTreeTable();
    table.columns = COLUMNS;
    table.columnGroups = COLUMN_GROUPS;
    (table as any)._loadPersistedState();
    const order = ordered(table);
    // The columns of no group first, as the document has them first, in the saved order.
    expect(order.slice(0, 3)).toEqual(['Name', 'Value', 'DataType']);
    // Max before Min, as saved, inside Data Object; Storage Class back in Code Generation.
    expect(order.indexOf('Max')).toBeLessThan(order.indexOf('Min'));
    expect(order.indexOf('storageClass')).toBeGreaterThan(order.indexOf('Unit'));
    expect(order.indexOf('storageClass')).toBeLessThan(order.indexOf('lastModified'));
  });

  it('without host groups, the order is the saved one, as before', () => {
    localStorage.setItem('dex-column-order', JSON.stringify(['Name', 'Status', 'Value']));
    const table = new DexTreeTable();
    table.columns = ['Name', 'Value', 'Status'];
    (table as any)._loadPersistedState();
    expect(ordered(table)).toEqual(['Name', 'Status', 'Value']);
  });
});

describe('the menu has its title and Reset at the top, Other Properties at the bottom, and scrolls between them', () => {
  it('top, built-in columns, bottom, in that order', async () => {
    const table = await mount();
    const menu = await openMenu(table);
    const parts = Array.from(menu.children).map((el) => el.className);
    expect(parts).toEqual(['column-menu-top', 'column-menu-builtins', 'column-menu-bottom']);
    const top = menu.querySelector('.column-menu-top') as HTMLElement;
    expect(top.querySelector('.column-menu-title')!.textContent!.trim()).toBe('Columns');
    const reset = top.querySelector('.column-menu-reset') as HTMLElement;
    expect(reset.textContent!.trim()).toBe('Reset');
    expect(reset.getAttribute('title')).toBe('Restore default columns');
    // Every built-in column is in the middle part, and nothing else is.
    const middle = menu.querySelector('.column-menu-builtins')!;
    expect(middle.querySelectorAll('.column-menu-item').length).toBe(COLUMNS.length);
    expect(middle.querySelector('input[type=text], .column-menu-reset')).toBeNull();
    // Other Properties: its header, then the field and Add.
    const bottom = menu.querySelector('.column-menu-bottom')!;
    expect(bottom.querySelector('.column-menu-group-header')!.textContent!.trim()).toBe('Other Properties');
    expect(bottom.querySelector('input.column-menu-input')).not.toBeNull();
    expect(bottom.querySelector('.column-menu-add-button')!.textContent!.trim()).toBe('Add');
    table.remove();
  });

  it('only the middle part scrolls; the top and the bottom keep their size', () => {
    const css = ((DexTreeTable as any).styles as any[] | any);
    const text = (Array.isArray(css) ? css : [css]).map((x: any) => String(x.cssText)).join('\n').replace(/\s+/g, ' ');
    expect(text).toMatch(/\.column-menu \{[^}]*display: flex;[^}]*flex-direction: column;/);
    expect(text).toMatch(/\.column-menu-top \{[^}]*flex: 0 0 auto;/);
    expect(text).toMatch(/\.column-menu-builtins \{[^}]*flex: 1 1 auto;[^}]*overflow-y: auto;/);
    expect(text).toMatch(/\.column-menu-bottom \{[^}]*flex: 0 0 auto;/);
  });

  it('opens no taller than the space below the button, and never shorter than its floor', async () => {
    const table = await mount();
    const menu = await openMenu(table);
    const top = parseFloat(menu.style.top);
    const max = parseFloat(menu.style.maxHeight);
    expect(max).toBeGreaterThanOrEqual(120);
    expect(max).toBeLessThanOrEqual(Math.max(120, window.innerHeight - top));
    table.remove();
  });

  it('Reset is clicked at the top and restores the default columns', async () => {
    const table = await mount();
    const menu = await openMenu(table);
    (table as any)._toggleColumnVisibility('Status');
    (menu.querySelector('.column-menu-top .column-menu-reset') as HTMLElement).click();
    await table.updateComplete;
    expect((table as any)._visibleColumns).toContain('Status');
    expect((table as any)._visibleColumns).not.toContain('Class');
    table.remove();
  });
});
