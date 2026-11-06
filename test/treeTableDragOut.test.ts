// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// `dragOut`: a table's rows dragged OUT of it, onto another part of the page (the app shell's
// Explorer, which takes a drop on an open file). Two things, both off by default so that a table
// that drags nothing (the VS Code extension's read-only views) still drags nothing:
//  - a table that takes no row drag of its own (`readonly`, or `rowDrag` false) still lets its rows
//    be dragged out, as a COPY alone: the drag allows no move, so its document never loses an entry,
//    and no row of it takes a drop;
//  - while a row drag of the table's is on, the box at the pointer (the dragged row's icon and name,
//    which stands in for the browser's drag image) follows the pointer over the rest of the page too,
//    saying no action there, where the part under the pointer says what a drop does. Without it, the
//    box stayed where the pointer left the table.
// happy-dom has no drag pipeline: events are dispatched with a stub DataTransfer, as
// treeTableDragDrop.test.ts does.
import { afterEach, describe, expect, it } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';

defineTreeTable();
afterEach(() => document.body.replaceChildren());

const row = (id: string, name = id): TreeTableRow => ({ ID: id, parent: null, Name: { label: name }, Value: '', DataType: '', Description: '', Status: '' });
const ROWS = [row('a', 'Kp'), row('b', 'Ki')];

async function mount(set: Partial<Pick<DexTreeTable, 'readonly' | 'rowDrag' | 'dragOut'>>): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = ['Name', 'Value'];
  Object.assign(table, set);
  document.body.appendChild(table);
  table.rows = ROWS;
  await table.updateComplete;
  return table;
}

function stubTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: '',
    dropEffect: '',
    types: ['application/dex-rows'],
    setData: (t: string, v: string) => void store.set(t, v),
    getData: (t: string) => store.get(t) ?? '',
    setDragImage: () => {},
  };
}

function fire(target: EventTarget, type: string, init: { clientX?: number; clientY?: number; altKey?: boolean; ctrlKey?: boolean } = {}) {
  const dataTransfer = stubTransfer();
  const ev = new Event(type, { bubbles: true, cancelable: true, composed: true }) as any;
  Object.assign(ev, { dataTransfer, altKey: false, ctrlKey: false, clientX: 0, clientY: 0 }, init);
  target.dispatchEvent(ev);
  return { ev, dataTransfer };
}
const tr = (table: DexTreeTable, id: string) => table.shadowRoot!.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)!;
const box = (table: DexTreeTable) => table.shadowRoot!.querySelector<HTMLElement>('.drop-tooltip');

describe('a table that takes no row drag, with dragOut', () => {
  it.each([{ readonly: true }, { rowDrag: false }])('%o: its rows are dragged out as a copy alone', async (set) => {
    const table = await mount({ ...set, dragOut: true });
    expect(tr(table, 'a').getAttribute('draggable')).toBe('true');
    const starts: string[][] = [];
    table.addEventListener('dex-row-drag-start', (e) => starts.push(e.detail.rowIds));
    const ends: unknown[] = [];
    table.addEventListener('dex-row-drag-end', (e) => ends.push(e));
    const { ev, dataTransfer } = fire(tr(table, 'a'), 'dragstart');
    expect(ev.defaultPrevented).toBe(false);
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(starts).toEqual([['a']]);
    fire(tr(table, 'a'), 'dragend');
    expect(ends).toHaveLength(1);
  });

  it('takes no drop on its rows, as a table that takes no row drag never does', async () => {
    const table = await mount({ readonly: true, dragOut: true });
    const drops: unknown[] = [];
    table.addEventListener('dex-row-drop', (e) => drops.push(e));
    fire(tr(table, 'a'), 'dragstart');
    const over = fire(tr(table, 'b'), 'dragover');
    expect(over.ev.defaultPrevented).toBe(false);
    expect(over.dataTransfer.dropEffect).toBe('none');
    fire(tr(table, 'b'), 'drop');
    expect(drops).toEqual([]);
  });

  it('without dragOut, drags nothing, as before', async () => {
    const table = await mount({ readonly: true });
    expect(tr(table, 'a').getAttribute('draggable')).toBe('false');
    const starts: unknown[] = [];
    table.addEventListener('dex-row-drag-start', (e) => starts.push(e));
    expect(fire(tr(table, 'a'), 'dragstart').ev.defaultPrevented).toBe(true);
    expect(starts).toEqual([]);
  });
});

describe('a table that takes row drags, with dragOut', () => {
  it('drags as it always did: a move or a copy', async () => {
    const table = await mount({ dragOut: true });
    const { ev, dataTransfer } = fire(tr(table, 'a'), 'dragstart');
    expect(ev.defaultPrevented).toBe(false);
    expect(dataTransfer.effectAllowed).toBe('copyMove');
  });
});

describe("the box at the pointer, over the rest of the page", () => {
  it.each([{}, { readonly: true }])('%o: follows the pointer outside the table, with no action said there', async (set) => {
    const table = await mount({ ...set, dragOut: true });
    const elsewhere = document.createElement('nav');
    document.body.append(elsewhere);
    fire(tr(table, 'a'), 'dragstart', { clientX: 5, clientY: 5 });
    fire(elsewhere, 'dragover', { clientX: 300, clientY: 120 });
    await table.updateComplete;
    expect(box(table)?.style.left).toBe('314px');
    expect(box(table)?.style.top).toBe('136px');
    expect(box(table)?.querySelector('.drop-tooltip-name')?.textContent).toBe('Kp');
    expect(box(table)?.querySelector('.drop-tooltip-action')).toBeNull();
    expect(box(table)?.classList.contains('forbidden')).toBe(false);
  });

  it('follows it over the rows of a table that takes no drop too, which answer no dragover themselves', async () => {
    const table = await mount({ readonly: true, dragOut: true });
    fire(tr(table, 'a'), 'dragstart', { clientX: 5, clientY: 5 });
    fire(tr(table, 'b'), 'dragover', { clientX: 40, clientY: 60 });
    await table.updateComplete;
    expect(box(table)?.style.left).toBe('54px');
    expect(box(table)?.querySelector('.drop-tooltip-action')).toBeNull();
  });

  it('stops following once the drag has ended', async () => {
    const table = await mount({ dragOut: true });
    const elsewhere = document.createElement('nav');
    document.body.append(elsewhere);
    fire(tr(table, 'a'), 'dragstart');
    fire(tr(table, 'a'), 'dragend');
    fire(elsewhere, 'dragover', { clientX: 300, clientY: 120 });
    await table.updateComplete;
    expect(box(table)).toBeNull();
  });

  it('without dragOut, stays over the table as before', async () => {
    const table = await mount({});
    const elsewhere = document.createElement('nav');
    document.body.append(elsewhere);
    fire(tr(table, 'a'), 'dragstart', { clientX: 5, clientY: 5 });
    await table.updateComplete;
    const before = box(table)?.style.left;
    fire(elsewhere, 'dragover', { clientX: 300, clientY: 120 });
    await table.updateComplete;
    expect(box(table)?.style.left).toBe(before);
  });
});
