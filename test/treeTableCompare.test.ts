// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What a compare asks of the tree table: two tables side by side, given the same row ids line for
// line (a gap row where a file lacks the line), kept together by whoever holds them
// (<dex-compare-view>).
//
//  - `diffMarks`: each line's mark on this side, drawn as a bar, a wash, a glyph with the word for a
//    screen reader, the differing cells washed deeper, a gap hatched; and never by colour alone.
//  - `fixedRows`: the rows as given. A sort or a search on one side alone would break the lines,
//    so a header press sorts nothing, and there is no search box and no column filter.
//  - `gridLabel`: two grids on one page are told apart by name.
//  - `dex-expansion-changed` and `dex-table-scrolled`, with `bodyScroll`/`scrollBodyTo`: what one
//    table did, for the other to follow, sent for the table's own changes and not for the ones its
//    holder made (which would echo back and forth).
//
// A table given none of these is the table as it always was: no mark, the search and the sort
// where they were (every other test/treeTable*.test.ts holds that).
import { beforeEach, describe, expect, it } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import type { DiffMark } from '../src/widgets/tree-table/index.js';
import { THEME_SETS } from './tools/cssTokens.js';

defineTreeTable();

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

const COLUMNS = ['Name', 'Value', 'DataType', 'Description'];

function row(id: string, parent: string | null, cells: Partial<TreeTableRow> = {}): TreeTableRow {
  return { ID: id, parent, Name: { label: id }, Value: '', DataType: '', Description: '', Status: '', ...cells };
}

/** S at the top, a, b, c and g under it, S open. */
const LINES = (): TreeTableRow[] => [row('S', null), row('a', 'S'), row('b', 'S'), row('c', 'S', { Value: '2' }), row('g', 'S')];

async function mount(rows: TreeTableRow[], setup: (t: DexTreeTable) => void = () => {}): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = COLUMNS;
  table.storageKey = null;
  setup(table);
  document.body.appendChild(table);
  (table as any)._hiddenColumns = new Set<string>();
  table.rows = rows;
  await table.updateComplete;
  await table.updateComplete;
  return table;
}

const root = (t: DexTreeTable): ShadowRoot => t.shadowRoot!;
const tr = (t: DexTreeTable, id: string): HTMLElement => root(t).querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;
const order = (t: DexTreeTable): string[] => [...root(t).querySelectorAll('tr.data-row')].map((r) => (r as HTMLElement).dataset.rowId!);
const heard = <T,>(t: DexTreeTable, name: string): T[] => {
  const out: T[] = [];
  t.addEventListener(name, (e) => void out.push((e as CustomEvent<T>).detail));
  return out;
};

describe("a compare's marks", () => {
  it('draws each kind of mark, its glyph and its word, and no mark without them', async () => {
    const marks = new Map<string, DiffMark>([
      ['a', { kind: 'added' }],
      ['b', { kind: 'removed' }],
      ['c', { kind: 'changed', columns: ['Value'] }],
      ['g', { kind: 'gap' }],
    ]);
    const table = await mount(LINES(), (t) => {
      t.expandedIds = ['S'];
      t.diffMarks = marks;
    });
    const a = tr(table, 'a');
    expect(a.classList.contains('diff-added')).toBe(true);
    const glyph = a.querySelector('td.col-Name .diff-glyph')!;
    expect(glyph.textContent).toBe('+');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(a.querySelector('td.col-Name .sr-only')!.textContent).toBe('Added');
    expect(tr(table, 'b').classList.contains('diff-removed')).toBe(true);
    expect(tr(table, 'b').querySelector('.diff-glyph')!.textContent).toBe('−');
    expect(tr(table, 'b').querySelector('.sr-only')!.textContent).toBe('Removed');

    const c = tr(table, 'c');
    expect(c.classList.contains('diff-changed')).toBe(true);
    expect(c.querySelector('.diff-glyph')!.textContent).toBe('~');
    expect(c.querySelector('.sr-only')!.textContent).toBe('Changed');
    expect(c.querySelector('td.col-Value')!.classList.contains('diff-cell')).toBe(true);
    expect(c.querySelector('td.col-DataType')!.classList.contains('diff-cell')).toBe(false);

    const g = tr(table, 'g');
    expect(g.classList.contains('diff-gap')).toBe(true);
    expect(g.querySelector('.diff-glyph')).toBeNull();
    expect(g.querySelector('td.col-Name .sr-only')!.textContent).toBe('Not in this file');
    // An unmarked line draws nothing.
    expect(tr(table, 'S').className).not.toMatch(/diff-/);

    table.diffMarks = null;
    await table.updateComplete;
    const marked = [...root(table).querySelectorAll('*')].filter((el) => [...el.classList].some((c) => c.startsWith('diff-')));
    expect(marked).toEqual([]);
    expect(root(table).querySelector('.sr-only')).toBeNull();
  });
});

describe('fixedRows', () => {
  const xy = (): TreeTableRow[] => [row('x', null, { Value: 'b' }), row('y', null, { Value: 'a' })];
  const clickHeader = async (t: DexTreeTable, label: string): Promise<void> => {
    const th = [...root(t).querySelectorAll('th')].find((h) => h.querySelector('.th-label')?.textContent === label)!;
    th.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await t.updateComplete;
  };

  it('keeps the rows as given: a header press sorts nothing', async () => {
    const sorted = await mount(xy());
    await clickHeader(sorted, 'Value');
    expect(order(sorted)).toEqual(['y', 'x']);
    expect(root(sorted).querySelector('.sort-indicator')).not.toBeNull();

    const fixed = await mount(xy(), (t) => (t.fixedRows = true));
    expect(fixed.hasAttribute('fixed-rows')).toBe(true);
    await clickHeader(fixed, 'Value');
    expect(order(fixed)).toEqual(['x', 'y']);
    expect(root(fixed).querySelector('.sort-indicator')).toBeNull();
  });

  it('draws no search box and no column filter, and keeps the Columns button', async () => {
    const fixed = await mount(xy(), (t) => (t.fixedRows = true));
    expect(root(fixed).querySelector('dex-filter-bar')).toBeNull();
    expect(root(fixed).querySelector('.columns-button')).not.toBeNull();
    const filters = [...root(fixed).querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Filter '));
    expect(filters).toEqual([]);
    // A search set before still filters nothing.
    (fixed as any)._filterText = 'zzz';
    await fixed.updateComplete;
    expect(order(fixed)).toEqual(['x', 'y']);
  });
});

describe('gridLabel', () => {
  it("names the grid for a screen reader", async () => {
    const table = await mount(LINES());
    expect(root(table).querySelector('[role="treegrid"]')!.getAttribute('aria-label')).toBe('Data entries');
    table.gridLabel = 'a.sldd';
    await table.updateComplete;
    expect(root(table).querySelector('[role="treegrid"]')!.getAttribute('aria-label')).toBe('a.sldd');
  });
});

describe('dex-expansion-changed', () => {
  it("says the table's own changes of what is open, and not its holder's", async () => {
    const table = await mount(LINES(), (t) => (t.expandedIds = ['S']));
    const events = heard<{ expandedIds: string[] }>(table, 'dex-expansion-changed');
    const twisty = (): HTMLElement => tr(table, 'S').querySelector('.toggle') as HTMLElement;

    twisty().click();
    await table.updateComplete;
    expect(events).toHaveLength(1);
    expect(events[0].expandedIds).not.toContain('S');
    twisty().click();
    await table.updateComplete;
    expect(events).toHaveLength(2);
    expect(events[1].expandedIds).toContain('S');

    table.expandedIds = [];
    await table.updateComplete;
    table.expand(['S']);
    await table.updateComplete;
    table.collapse(['S']);
    await table.updateComplete;
    expect(events).toHaveLength(2);

    // A selection whose parents the table opened.
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    expect(events).toHaveLength(3);
    expect(events[2].expandedIds).toContain('S');
  });
});

describe('dex-table-scrolled', () => {
  it('scrolls as told, says where it scrolled to, and answers where it is', async () => {
    const table = await mount(Array.from({ length: 200 }, (_, i) => row(`r${i}`, null)));
    const events = heard<{ top: number; left: number }>(table, 'dex-table-scrolled');
    table.scrollBodyTo(280);
    const container = root(table).querySelector('.table-container') as HTMLElement;
    expect(container.scrollTop).toBe(280);
    // happy-dom fires no scroll event of its own.
    container.dispatchEvent(new Event('scroll'));
    expect(events).toEqual([{ top: 280, left: 0 }]);
    expect(table.bodyScroll).toEqual({ top: 280, left: 0 });
  });
});

describe("the marks' colours", () => {
  // WCAG's contrast ratio of two colours written #rgb, #rrggbb or rgb(r, g, b) (test/docTabs.test.ts).
  function contrast(a: string, b: string): number {
    const luminance = (colour: string): number => {
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
      const parts = hex
        ? (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16))
        : colour.match(/\d+/g)!.slice(0, 3).map(Number);
      const [r, g, bl] = parts.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  it.each(Object.entries(THEME_SETS))('draws each bar at 3:1 against the rows in the %s set', (_name, set) => {
    for (const bar of ['--dex-diff-added', '--dex-diff-removed', '--dex-diff-changed']) {
      expect(set.get(bar), bar).toBeDefined();
      expect(contrast(set.get(bar)!, set.get('--dex-bg-primary')!), bar).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the differing cells and the gaps in forced colours', () => {
    const sheet = (DexTreeTable.styles as unknown as { cssText: string }[])
      .map((s) => s.cssText)
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const forced = [...sheet.matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n {6}\}/g)].map((m) => m[1]).join('\n');
    expect(forced).toContain('diff-cell');
    expect(forced).toContain('diff-gap');
  });
});
