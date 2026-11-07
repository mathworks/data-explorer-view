// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// `<dex-compare-view>`: two files compared line by line, as a header over two read-only tables side
// by side, whose rows share ids line for line.
//
// What it protects is that the two tables stay one picture. A row opened, scrolled to or selected
// in either is the same in the other, without the two echoing each other forever; each table is a
// compare's (its rows as given, read-only, named for its file, its marks drawn); and the tables'
// own events stay inside the view, so an app listening for a document table's selection or menu
// does not take a compare table's for one. Around them, the header says what differs, holds "Show
// only differences" and Previous and Next Change, and says nothing it cannot do (no step with no
// change to go to).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DexCompareView, defineCompareView, type CompareSide } from '../src/widgets/app-shell/dex-compare-view.js';
import type { DexTreeTable, DiffMark, TreeTableRow } from '../src/widgets/tree-table/index.js';
import { THEME_SETS } from './tools/cssTokens.js';

defineCompareView();

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const COLUMNS = ['Name', 'Value', 'DataType'];
const LABELS = { Name: 'Name', Value: 'Value', DataType: 'Data Type' };
const row = (id: string, parent: string | null, label = id, value = ''): TreeTableRow => ({
  ID: id,
  parent,
  Name: { label },
  Value: value,
  DataType: '',
  Description: '',
  Status: '',
});

/** A side of the four lines: S, and under it a (added on the right: a gap on the left), b (changed in Value) and c. */
function side(which: 'left' | 'right', options: Partial<CompareSide> = {}): CompareSide {
  const left = which === 'left';
  const marks = new Map<string, DiffMark>([
    ['a', { kind: left ? 'gap' : 'added' }],
    ['b', { kind: 'changed', columns: ['Value'] }],
  ]);
  return {
    name: left ? 'a.sldd' : 'b.sldd',
    title: left ? '/w/a.sldd' : '/w/b.sldd',
    editable: true,
    rows: [row('S', null, 'Design Data'), left ? row('a', 'S', '') : row('a', 'S', 'Ka', '1'), row('b', 'S', 'Kb', left ? '1' : '2'), row('c', 'S', 'Kc', '3')],
    columns: COLUMNS,
    columnLabels: LABELS,
    columnGroups: {},
    marks,
    ...options,
  };
}

async function mount(setup: (view: DexCompareView) => void = () => {}): Promise<DexCompareView> {
  const view = document.createElement('dex-compare-view') as DexCompareView;
  view.left = side('left');
  view.right = side('right');
  view.summary = '1 changed, 1 added';
  view.hasChanges = true;
  setup(view);
  document.body.append(view);
  await settle(view);
  return view;
}

async function settle(view: DexCompareView): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await view.updateComplete;
    for (const t of tables(view)) await t.updateComplete;
    await new Promise((done) => setTimeout(done, 0));
  }
}

const root = (view: DexCompareView): ShadowRoot => view.shadowRoot!;
const tables = (view: DexCompareView): DexTreeTable[] => [...root(view).querySelectorAll('dex-tree-table')] as DexTreeTable[];
const heard = <T,>(target: EventTarget, name: string): T[] => {
  const out: T[] = [];
  target.addEventListener(name, (e) => void out.push((e as CustomEvent<T>).detail));
  return out;
};
const rowOf = (table: DexTreeTable, id: string): HTMLElement => table.shadowRoot!.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;
const stepButton = (view: DexCompareView, label: string): HTMLButtonElement =>
  root(view).querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

describe('the header', () => {
  it('says what differs, politely, and holds "Show only differences", checked by default', async () => {
    const view = await mount();
    const status = root(view).querySelector('[role="status"]')!;
    expect(status.textContent!.trim()).toBe('1 changed, 1 added');
    expect(status.getAttribute('aria-live')).toBe('polite');
    const box = root(view).querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.closest('label')!.textContent!.trim()).toBe('Show only differences');

    const changes = heard<{ onlyDifferences: boolean }>(view, 'dex-compare-filter-changed');
    box.click();
    expect(changes).toEqual([{ onlyDifferences: false }]);
    expect(view.onlyDifferences).toBe(false);
  });

  it('steps to the previous and the next change, and not without one', async () => {
    const view = await mount();
    const steps = heard<{ by: number }>(view, 'dex-compare-step');
    const previous = stepButton(view, 'Previous Change');
    const next = stepButton(view, 'Next Change');
    expect(previous.title).toBe('Previous Change (Shift+F7)');
    expect(next.title).toBe('Next Change (F7)');
    previous.click();
    next.click();
    expect(steps).toEqual([{ by: -1 }, { by: 1 }]);

    view.hasChanges = false;
    await settle(view);
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    previous.click();
    next.click();
    expect(steps).toHaveLength(2);
  });
});

describe('the two sides', () => {
  it("captions each table with its file's name, and says which is read-only and which unsaved", async () => {
    const view = await mount((v) => {
      v.left = side('left', { editable: false });
      v.right = side('right', { dirty: true });
    });
    const [left, right] = [...root(view).querySelectorAll('.caption')] as HTMLElement[];
    expect(left.querySelector('.name')!.textContent).toBe('a.sldd');
    expect(left.title).toBe('/w/a.sldd');
    expect(left.querySelector('.tag')!.textContent).toBe('Read-only');
    expect(left.querySelector('.dirty')).toBeNull();
    expect(right.querySelector('.name')!.textContent).toBe('b.sldd');
    expect(right.querySelector('.tag')).toBeNull();
    expect(right.querySelector('.dirty')!.textContent).toContain('●');
    expect(right.querySelector('.dirty .sr-only')!.textContent).toBe('unsaved');
  });

  it("gives each table its side's rows, as a compare's: as given, read-only, named for its file", async () => {
    const view = await mount();
    const [left, right] = tables(view);
    for (const [table, which] of [
      [left, 'left'],
      [right, 'right'],
    ] as const) {
      expect(table.hasAttribute('fixed-rows')).toBe(true);
      expect(table.hasAttribute('readonly')).toBe(true);
      expect(table.hasAttribute('keyboard-menu')).toBe(true);
      expect(table.getAttribute('grid-label')).toBe(which === 'left' ? 'a.sldd' : 'b.sldd');
      expect(table.rows).toBe(view[which]!.rows);
      expect(table.columns).toBe(view[which]!.columns);
      expect(table.columnLabels).toBe(view[which]!.columnLabels);
      expect(table.diffMarks).toBe(view[which]!.marks);
    }
  });

  it('says a note in place of the tables while both have no rows', async () => {
    const view = await mount((v) => {
      v.left = side('left', { rows: [] });
      v.right = side('right', { rows: [] });
      v.empty = 'No differences';
    });
    expect(tables(view)).toEqual([]);
    expect(root(view).querySelector('.empty')!.textContent!.trim()).toBe('No differences');
  });

  it("draws the caption's Read-only tag at 4.5:1 in every set", () => {
    // WCAG's contrast ratio of two colours written #rgb or #rrggbb (test/docTabs.test.ts).
    const contrast = (a: string, b: string): number => {
      const l = (c: string): number => {
        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)![1]!;
        const [r, g, bl] = (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => {
          const v = parseInt(h, 16) / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
      };
      const [hi, lo] = [l(a), l(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const [name, set] of Object.entries(THEME_SETS)) {
      expect(contrast(set.get('--dex-tag-fg')!, set.get('--dex-tag-bg')!), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the two tables, kept together', () => {
  it('opens a line in the other as it is opened in one', async () => {
    const view = await mount((v) => (v.expandedIds = ['S']));
    const [left, right] = tables(view);
    expect([...right.expandedIds]).toEqual(['S']);
    (rowOf(left, 'S').querySelector('.toggle') as HTMLElement).click();
    await settle(view);
    expect([...left.expandedIds]).toEqual([]);
    expect([...right.expandedIds]).toEqual([...left.expandedIds]);
    expect([...view.expandedIds]).toEqual([]);
  });

  it('scrolls the other to where one scrolled, and not again where it already is', async () => {
    const view = await mount();
    const [left, right] = tables(view);
    const scroll = vi.spyOn(right, 'scrollBodyTo');
    left.dispatchEvent(new CustomEvent('dex-table-scrolled', { detail: { top: 56, left: 0 }, bubbles: true, composed: true }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(56);
    expect(right.bodyScroll.top).toBe(56);
    left.dispatchEvent(new CustomEvent('dex-table-scrolled', { detail: { top: 56, left: 0 }, bubbles: true, composed: true }));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('selects a line in the other as it is selected in one, and keeps the tables’ own events inside', async () => {
    const view = await mount((v) => (v.expandedIds = ['S']));
    const [left, right] = tables(view);
    const selected = heard<{ lineIds: string[] }>(view, 'dex-compare-selected');
    const outside = heard<unknown>(document, 'dex-row-selected');
    (rowOf(right, 'b').querySelector('td.col-Value') as HTMLElement).click();
    await settle(view);
    expect(right.selectedRowIds).toEqual(['b']);
    expect(left.selectedRowIds).toEqual(['b']);
    expect(view.selectedIds).toEqual(['b']);
    expect(selected).toEqual([{ lineIds: ['b'] }]);
    expect(outside).toEqual([]);
  });

  it("asks for a line's menu, saying which side and which lines", async () => {
    const view = await mount((v) => (v.expandedIds = ['S']));
    const [left] = tables(view);
    const menus = heard<{ side: string; lineIds: string[]; x: number; y: number; keyboard?: true }>(view, 'dex-compare-menu');
    const outside = heard<unknown>(document, 'dex-table-context-menu');
    rowOf(left, 'c').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 40, clientY: 70 }));
    await settle(view);
    expect(menus).toEqual([{ side: 'left', lineIds: ['c'], x: 40, y: 70 }]);
    expect(outside).toEqual([]);
  });

  it('selects and opens lines as the app says, in both, sending nothing', async () => {
    const view = await mount();
    const [left, right] = tables(view);
    const selected = heard<unknown>(view, 'dex-compare-selected');
    view.select(['b']);
    await settle(view);
    expect(left.selectedRowIds).toEqual(['b']);
    expect(right.selectedRowIds).toEqual(['b']);
    // Its parent opened, in both, to bring it into view.
    expect([...left.expandedIds]).toContain('S');
    expect([...right.expandedIds]).toContain('S');
    expect(selected).toEqual([]);

    view.expandedIds = [];
    await settle(view);
    expect([...left.expandedIds]).toEqual([]);
    expect([...right.expandedIds]).toEqual([]);
    view.expandedIds = ['S'];
    await settle(view);
    expect([...left.expandedIds]).toEqual(['S']);
    expect([...right.expandedIds]).toEqual(['S']);
  });

  it("gives the keyboard to the left table's grid", async () => {
    const view = await mount();
    view.focus();
    const [left] = tables(view);
    expect(left.shadowRoot!.activeElement?.getAttribute('role')).toBe('treegrid');
  });
});
