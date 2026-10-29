// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// THE READ-ONLY SWITCH.
//
// Rows say per cell whether it can be edited (`editable`, `_valueEditable`, …), because the row
// builder knows the file and not the app: a viewer showing a dictionary still gets rows whose
// cells say yes. Without a switch, an app that only shows files had to swallow the double-click
// and the grid's Enter before the table saw them (but not the search box's Enter, which commits
// a search), and turn off + Add and row drag one by one.
//
// `readonly` is that switch. On, every gesture that changes the file is gone, and with it the
// event it sends; everything that only looks keeps working. Off — the default — each cell's own
// flags decide, as they always have: the first block pins that, next to the gestures it governs.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';

defineTreeTable();

const COLUMNS = ['Name', 'Value', 'DataType', 'Status', 'Description'];

const ROWS: TreeTableRow[] = [
  { ID: 'section:Design', parent: null, Name: { label: 'Design Data' }, Value: '', DataType: '', Description: '', Status: '' },
  {
    ID: 'k',
    parent: 'section:Design',
    Name: { label: 'K', editable: true },
    Value: { text: '3', editable: true, linkTarget: '' },
    DataType: { text: 'double', linkTarget: 'double@x' },
    Description: 'gain',
    Status: '',
    _descriptionEditable: true,
    _matrix: { name: 'K', className: 'double', dims: [1, 1], nodeId: 'k' },
  } as TreeTableRow,
  { ID: 'k.a', parent: 'k', Name: { label: 'a', editable: true }, Value: { text: '1', editable: true }, DataType: '', Description: '', Status: '' },
  // A Value shown as a summary, whose editor opens on the whole text the host sends.
  { ID: 'w', parent: 'section:Design', Name: { label: 'W' }, Value: '<1x500 double>', _valueEditable: true, _hasEditText: true, DataType: '', Description: '', Status: '' } as any,
];

const SENT = ['dex-edit-completed', 'dex-edit-text-request', 'dex-add-entry', 'dex-row-drag-start', 'dex-row-drop'];

async function mount(configure: (t: DexTreeTable) => void = () => {}): Promise<{ table: DexTreeTable; sent: string[] }> {
  const table = new DexTreeTable();
  table.columns = COLUMNS;
  table.canAdd = true;
  configure(table);
  document.body.appendChild(table);
  table.rows = ROWS;
  (table as any)._expandedIds = new Set(['section:Design', 'k']);
  await table.updateComplete;
  const sent: string[] = [];
  for (const type of SENT) table.addEventListener(type, () => sent.push(type));
  return { table, sent };
}

const sr = (t: DexTreeTable) => t.shadowRoot!;
const td = (t: DexTreeTable, rowId: string, col: string) =>
  sr(t).querySelector(`tr[data-row-id="${rowId}"] td.col-${col}`) as HTMLElement;
const editor = (t: DexTreeTable) => sr(t).querySelector('.edit-input') as HTMLInputElement | null;
const grid = (t: DexTreeTable) => sr(t).querySelector('.table-container') as HTMLElement;

async function dblclick(t: DexTreeTable, rowId: string, col: string): Promise<void> {
  td(t, rowId, col).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await t.updateComplete;
}

// Selects the row (and focuses the column) as a click would, then presses `key` on the grid.
async function press(t: DexTreeTable, rowId: string, col: string, key: string): Promise<void> {
  td(t, rowId, col).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await t.updateComplete;
  grid(t).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await t.updateComplete;
}

function stubTransfer() {
  return { effectAllowed: '', dropEffect: '', setData: () => {}, getData: () => '', setDragImage: () => {} };
}

function drag(t: DexTreeTable, rowId: string, type: string) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as any;
  Object.assign(ev, { dataTransfer: stubTransfer(), altKey: false, ctrlKey: false, clientX: 0, clientY: 0 });
  sr(t).querySelector(`tr[data-row-id="${rowId}"]`)!.dispatchEvent(ev);
  return ev as Event;
}

const PREDICT_YES = () => ({ canDrop: true, cursor: 'move', tooltip: 'Move', noop: false });

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('off, the default: the cells decide, as they always have', () => {
  it('is false, and the table has no readonly attribute', async () => {
    const { table } = await mount();
    expect(table.readonly).toBe(false);
    expect(table.hasAttribute('readonly')).toBe(false);
    expect(grid(table).hasAttribute('aria-readonly')).toBe(false);
  });

  it('a double-click, Enter and beginRename open an editable cell', async () => {
    const { table } = await mount();
    await dblclick(table, 'k', 'Value');
    expect(editor(table)?.value).toBe('3');
    editor(table)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await table.updateComplete;
    await press(table, 'k', 'Description', 'Enter');
    expect(editor(table)?.value).toBe('gain');
    editor(table)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await table.updateComplete;
    expect(table.beginRename('k')).toBe(true);
  });

  it('draws an editable cell as editable, offers + Add, and drags rows', async () => {
    const { table, sent } = await mount((t) => (t.dropPredictor = PREDICT_YES));
    expect(td(table, 'k', 'Value').classList.contains('cell-editable')).toBe(true);
    expect(sr(table).querySelector('.add-button')).not.toBeNull();
    table.toggleAddGallery();
    await table.updateComplete;
    expect(sr(table).querySelector('dex-add-gallery')).not.toBeNull();
    expect(sr(table).querySelector('tr[data-row-id="k"]')!.getAttribute('draggable')).toBe('true');
    drag(table, 'k', 'dragstart');
    expect(drag(table, 'k.a', 'dragover').defaultPrevented).toBe(true);
    drag(table, 'k.a', 'drop');
    expect(sent).toEqual(['dex-row-drag-start', 'dex-row-drop']);
  });

  it('asks for a summarized Value’s whole text when its editor opens', async () => {
    const { table, sent } = await mount();
    await dblclick(table, 'w', 'Value');
    expect(sent).toEqual(['dex-edit-text-request']);
  });
});

describe('on', () => {
  const readonly = (t: DexTreeTable) => {
    t.readonly = true;
    t.dropPredictor = PREDICT_YES;
  };

  it('is the attribute too, reflected, and tells assistive tech', async () => {
    const { table } = await mount(readonly);
    expect(table.hasAttribute('readonly')).toBe(true);
    expect(grid(table).getAttribute('aria-readonly')).toBe('true');
    const el = document.createElement('dex-tree-table') as DexTreeTable;
    el.setAttribute('readonly', '');
    expect(el.readonly).toBe(true);
  });

  it('opens no editor: not on a double-click, Enter, F2 or typing, nor for beginRename', async () => {
    const { table, sent } = await mount(readonly);
    for (const col of ['Name', 'Value', 'Description']) {
      await dblclick(table, 'k', col);
      expect(editor(table), col).toBeNull();
      for (const key of ['Enter', 'F2', 'x']) {
        await press(table, 'k', col, key);
        expect(editor(table), `${col} ${key}`).toBeNull();
      }
    }
    expect(table.beginRename('k')).toBe(false);
    expect(editor(table)).toBeNull();
    expect(sent).toEqual([]);
  });

  it('asks for no whole Value, and opens none it is sent', async () => {
    const { table, sent } = await mount(readonly);
    await dblclick(table, 'w', 'Value');
    table.openWholeValueEditor('w', '[1 2 3]');
    await table.updateComplete;
    expect(editor(table)).toBeNull();
    expect(sent).toEqual([]);
  });

  it('draws no cell as editable', async () => {
    const { table } = await mount(readonly);
    expect(sr(table).querySelectorAll('td.cell-editable').length).toBe(0);
    expect(td(table, 'k', 'Value').classList.contains('cell-readonly')).toBe(true);
  });

  it('closes an editor that was open when it was set, writing nothing', async () => {
    const { table, sent } = await mount();
    await dblclick(table, 'k', 'Value');
    editor(table)!.value = 'typed';
    table.readonly = true;
    await table.updateComplete;
    expect(editor(table)).toBeNull();
    expect((table as any)._editingCell).toBeNull();
    expect(sent).toEqual([]);
  });

  it('offers no + Add, whatever canAdd says, and closes a gallery that was open', async () => {
    const { table, sent } = await mount();
    table.toggleAddGallery();
    await table.updateComplete;
    expect(sr(table).querySelector('dex-add-gallery')).not.toBeNull();
    table.readonly = true;
    await table.updateComplete;
    expect(sr(table).querySelector('dex-add-gallery')).toBeNull();
    expect(sr(table).querySelector('.add-button')).toBeNull();
    expect(table.canAdd).toBe(true);
    table.toggleAddGallery();
    await table.updateComplete;
    expect(sr(table).querySelector('dex-add-gallery')).toBeNull();
    // A tile event that reached the table anyway is dropped.
    (table as any)._onAddTile(new CustomEvent('dex-add-tile', { detail: { className: 'Simulink.Parameter', section: 'Design', label: 'Parameter' } }));
    expect(sent).toEqual([]);
  });

  it('drags no row and takes no drop, whatever rowDrag says', async () => {
    const { table, sent } = await mount(readonly);
    expect(table.rowDrag).toBe(true);
    expect(sr(table).querySelector('tr[data-row-id="k"]')!.getAttribute('draggable')).toBe('false');
    expect(drag(table, 'k', 'dragstart').defaultPrevented).toBe(true);
    expect(drag(table, 'k.a', 'dragover').defaultPrevented).toBe(false);
    drag(table, 'k.a', 'drop');
    const body = new Event('dragover', { bubbles: true, cancelable: true }) as any;
    body.dataTransfer = stubTransfer();
    grid(table).dispatchEvent(body);
    expect(body.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
  });

  it('still selects, opens, searches, sorts, follows links, asks for a menu and draws the matrix glyph', async () => {
    const { table } = await mount(readonly);
    const got: Record<string, unknown[]> = {};
    for (const type of ['dex-row-selected', 'dex-link-clicked', 'dex-table-context-menu']) {
      table.addEventListener(type, (e) => (got[type] ??= []).push((e as CustomEvent).detail));
    }
    td(table, 'k', 'Name').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await table.updateComplete;
    expect(table.selectedRowIds).toEqual(['k']);

    // Space closes and opens the selected row; so does its twisty.
    grid(table).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await table.updateComplete;
    expect(sr(table).querySelector('tr[data-row-id="k.a"]')).toBeNull();
    (sr(table).querySelector('tr[data-row-id="k"] .toggle') as HTMLElement).click();
    await table.updateComplete;
    expect(sr(table).querySelector('tr[data-row-id="k.a"]')).not.toBeNull();

    (table as any)._setFilterText('W');
    await table.updateComplete;
    expect(sr(table).querySelector('tr[data-row-id="w"]')).not.toBeNull();
    expect(sr(table).querySelector('tr[data-row-id="k"]')).toBeNull();
    (table as any)._setFilterText('');
    await table.updateComplete;

    (sr(table).querySelector('th') as HTMLElement).click();
    await table.updateComplete;
    expect(sr(table).querySelector('th')!.getAttribute('aria-sort')).toBe('ascending');

    (td(table, 'k', 'DataType').querySelector('a.value-link') as HTMLElement).click();
    sr(table).querySelector('tr[data-row-id="k"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(got['dex-row-selected']!.length).toBeGreaterThan(0);
    expect(got['dex-link-clicked']).toEqual([{ target: 'double@x' }]);
    expect(got['dex-table-context-menu']!.length).toBe(1);
    expect(td(table, 'k', 'Value').querySelector('dex-matrix-open')).not.toBeNull();
  });

  it('turned off again, the cells decide again', async () => {
    const { table } = await mount(readonly);
    table.readonly = false;
    await table.updateComplete;
    await dblclick(table, 'k', 'Value');
    expect(editor(table)?.value).toBe('3');
    expect(sr(table).querySelector('.add-button')).not.toBeNull();
  });
});
