// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Columns menu from the keyboard, as the in-MATLAB data explorer's Columns dropdown: opening
// it puts the focus on its first column box; Alt+↑/↓ moves the focused column one place within
// its group (never past Name), the focus following it and the live region saying "<column> moved
// to position i of n"; Escape anywhere in it closes it, back on the Columns button. And a storage
// class attribute typed by its path is the column of its short name.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../src/model/rows/rowBuilder.js';

defineTreeTable();

beforeEach(() => {
  localStorage.clear();
});

let keys = 0;

function row(id: string): TreeTableRow {
  return { ID: id, parent: null, Name: { label: id }, Value: '', DataType: '', Description: '', Status: '' } as TreeTableRow;
}

async function mount(): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.storageKey = `keys-${++keys}`;
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
  // The focus goes in after the menu is drawn.
  await new Promise((r) => setTimeout(r, 0));
  return table.shadowRoot!.querySelector('.column-menu') as HTMLElement;
}

const box = (table: DexTreeTable, col: string): HTMLInputElement =>
  table.shadowRoot!.querySelector(`.column-menu-item[data-col="${col}"] input[type=checkbox]`) as HTMLInputElement;

const focused = (table: DexTreeTable): Element | null => table.shadowRoot!.activeElement;
const ordered = (table: DexTreeTable): string[] => (table as any)._orderedColumns;
const announced = (table: DexTreeTable): string =>
  table.shadowRoot!.querySelector('.column-menu-live')!.textContent!.trim();

// Alt+<arrow> on `col`'s box, as a key press on it, then the render and the refocus after it.
async function altArrow(table: DexTreeTable, col: string, key: 'ArrowUp' | 'ArrowDown', extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, composed: true, cancelable: true, ...extra });
  box(table, col).dispatchEvent(event);
  await table.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  return event;
}

describe('opening the menu', () => {
  it("puts the focus on its first column box that takes it: Value's, as Name's is disabled", async () => {
    const table = await mount();
    await openMenu(table);
    expect(focused(table)).toBe(box(table, 'Value'));
    table.remove();
  });
});

describe('Alt+↑ and Alt+↓', () => {
  it('move the column one place within its group, the focus with it, and say where it is now', async () => {
    const table = await mount();
    await openMenu(table);
    // Data Object: dimensions, dimensionsMode, complexity, Min, Max, Unit.
    const event = await altArrow(table, 'Max', 'ArrowUp');
    expect(event.defaultPrevented).toBe(true);
    expect(ordered(table).indexOf('Max')).toBe(ordered(table).indexOf('Min') - 1);
    expect(focused(table)).toBe(box(table, 'Max'));
    expect(announced(table)).toBe('Max moved to position 4 of 6');
    await altArrow(table, 'Max', 'ArrowDown');
    await altArrow(table, 'Max', 'ArrowDown');
    expect(ordered(table).indexOf('Max')).toBe(ordered(table).indexOf('Unit') + 1);
    expect(announced(table)).toBe('Max moved to position 6 of 6');
    // Kept, as a drag's move is.
    expect(JSON.parse(localStorage.getItem(`${table.storageKey}-column-order`)!).indexOf('Max')).toBeGreaterThan(
      JSON.parse(localStorage.getItem(`${table.storageKey}-column-order`)!).indexOf('Unit'),
    );
    table.remove();
  });

  it("stop at the group's edge, and never take a column above Name", async () => {
    const table = await mount();
    await openMenu(table);
    const before = [...ordered(table)];
    await altArrow(table, 'dimensions', 'ArrowUp');
    await altArrow(table, 'lastModifiedBy', 'ArrowDown');
    await altArrow(table, 'Value', 'ArrowUp');
    expect(ordered(table)).toEqual(before);
    expect(announced(table)).toBe('');
    table.remove();
  });

  it('move a property column among the property columns', async () => {
    const table = await mount();
    await openMenu(table);
    const input = table.shadowRoot!.querySelector('.column-menu-input') as HTMLInputElement;
    for (const name of ['MyPropA', 'MyPropB']) {
      input.value = name;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
      await table.updateComplete;
    }
    await altArrow(table, 'prop:MyPropB', 'ArrowUp');
    expect((table as any)._propertyColumns).toEqual(['MyPropB', 'MyPropA']);
    expect(announced(table)).toBe('MyPropB moved to position 1 of 2');
    table.remove();
  });

  it('leave the key alone with another modifier held, or without Alt', async () => {
    const table = await mount();
    await openMenu(table);
    const before = [...ordered(table)];
    const shifted = await altArrow(table, 'Max', 'ArrowUp', { shiftKey: true });
    const plain = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true, cancelable: true });
    box(table, 'Max').dispatchEvent(plain);
    await table.updateComplete;
    expect(ordered(table)).toEqual(before);
    expect([shifted.defaultPrevented, plain.defaultPrevented]).toEqual([false, false]);
    table.remove();
  });
});

describe('Escape in the menu', () => {
  it('closes it from a column box, and the focus goes back to the Columns button', async () => {
    const table = await mount();
    await openMenu(table);
    box(table, 'Value').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    await table.updateComplete;
    expect(table.shadowRoot!.querySelector('.column-menu')).toBeNull();
    expect(focused(table)).toBe(table.shadowRoot!.querySelector('.columns-button'));
    table.remove();
  });
});

describe('a storage class attribute typed by its path', () => {
  async function typeName(table: DexTreeTable, name: string): Promise<HTMLInputElement> {
    const input = table.shadowRoot!.querySelector('.column-menu-input') as HTMLInputElement;
    input.value = name;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
    await table.updateComplete;
    return input;
  }
  const notice = (table: DexTreeTable): string =>
    table.shadowRoot!.querySelector('.column-menu-notice')?.textContent?.trim() ?? '';

  it('is the column of its short name; one a built-in column has shows that column', async () => {
    const table = await mount();
    await openMenu(table);
    await typeName(table, ' CoderInfo.CustomAttributes.GetFunction ');
    expect((table as any)._propertyColumns).toEqual(['GetFunction']);
    await typeName(table, 'CoderInfo.CustomAttributes.HeaderFile');
    expect((table as any)._visibleColumns).toContain('headerFile');
    expect((table as any)._propertyColumns).toEqual(['GetFunction']);
    table.remove();
  });

  it('that names no attribute is refused, quoting what was typed', async () => {
    const table = await mount();
    await openMenu(table);
    const input = await typeName(table, 'CoderInfo.CustomAttributes.A.B');
    expect(notice(table)).toBe('"CoderInfo.CustomAttributes.A.B" is not a valid property name.');
    expect(input.value).toBe('CoderInfo.CustomAttributes.A.B');
    await typeName(table, 'CoderInfo.CustomAttributes.');
    expect(notice(table)).toBe('"CoderInfo.CustomAttributes." is not a valid property name.');
    expect((table as any)._propertyColumns).toEqual([]);
    table.remove();
  });
});
