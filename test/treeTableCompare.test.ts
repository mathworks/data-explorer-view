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

describe('focusGrid', () => {
  it('gives the keyboard to the grid, or to an empty table\'s body', async () => {
    const table = await mount(LINES());
    table.focusGrid();
    expect(root(table).activeElement?.getAttribute('role')).toBe('treegrid');
    const empty = await mount([]);
    empty.focusGrid();
    expect(root(empty).activeElement?.classList.contains('empty-state')).toBe(true);
  });

  it('gives it once the table is drawn, when asked before', async () => {
    const table = new DexTreeTable();
    table.columns = COLUMNS;
    table.storageKey = null;
    table.rows = LINES();
    document.body.appendChild(table);
    table.focusGrid();
    await table.updateComplete;
    await table.updateComplete;
    expect(root(table).activeElement?.getAttribute('role')).toBe('treegrid');
  });
});

describe("the marks' colours", () => {
  /** A colour as [r, g, b, a], written #rgb, #rrggbb or rgb(a)(…). */
  const rgba = (colour: string): [number, number, number, number] => {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
    if (hex) {
      const [r, g, b] = (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16));
      return [r!, g!, b!, 1];
    }
    const [r, g, b, a] = colour.match(/[\d.]+/g)!.map(Number);
    return [r!, g!, b!, a ?? 1];
  };
  /** `top` composited over the opaque `under`: what the eye sees of a wash, as rgb(…). */
  const over = (top: string, under: string): string => {
    const [r, g, b, a] = rgba(top);
    const [R, G, B] = rgba(under);
    const mix = (x: number, y: number): number => Math.round(a * x + (1 - a) * y);
    return `rgb(${mix(r, R)}, ${mix(g, G)}, ${mix(b, B)})`;
  };
  // WCAG's contrast ratio of two opaque colours (test/docTabs.test.ts's, over rgba() too).
  function contrast(a: string, b: string): number {
    const luminance = (colour: string): number => {
      const [r, g, bl] = rgba(colour)
        .slice(0, 3)
        .map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  // The surfaces a mark is drawn on, as the stylesheet composites them: the rows' own surface
  // (the rows table's --dex-bg-secondary) under each kind's wash, a differing cell's wash over the
  // changed row's, and the selection surface, which takes the washes' place on a selected row.
  const surfaces = (set: Map<string, string>) => {
    const rows = set.get('--dex-bg-secondary')!;
    const row = (kind: 'added' | 'removed' | 'changed'): string => over(set.get(`--dex-diff-${kind}-bg`)!, rows);
    return { row, cell: over(set.get('--dex-diff-cell-bg')!, row('changed')), selected: set.get('--dex-color-accent-bg')! };
  };

  it.each(Object.entries(THEME_SETS))('draws each bar at 3:1 on its row and on a selected one in the %s set', (_name, set) => {
    const at = surfaces(set);
    for (const kind of ['added', 'removed', 'changed'] as const) {
      const bar = set.get(`--dex-diff-${kind}`)!;
      expect(bar, kind).toBeDefined();
      expect(contrast(bar, at.row(kind)), `${kind} on its row`).toBeGreaterThanOrEqual(3);
      expect(contrast(bar, at.selected), `${kind} on a selected row`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(THEME_SETS))("underlines a differing cell at 3:1 on its wash and on a selected row in the %s set", (_name, set) => {
    const at = surfaces(set);
    const line = set.get('--dex-diff-changed')!;
    expect(contrast(line, at.cell)).toBeGreaterThanOrEqual(3);
    expect(contrast(line, at.selected)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(THEME_SETS))('keeps the text at 4.5:1 on every wash in the %s set', (_name, set) => {
    const at = surfaces(set);
    const text = set.get('--dex-color-text')!;
    for (const kind of ['added', 'removed', 'changed'] as const) expect(contrast(text, at.row(kind)), kind).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, at.cell), 'a differing cell').toBeGreaterThanOrEqual(4.5);
  });

  // The muted ink of a marked row is its text ink at the percentage the stylesheet says (read from
  // it, so the two cannot disagree), and a selected row's is its row ink at the selected row's own
  // percentage: each composited over the surface it is read on.
  const sheetText = (): string => (DexTreeTable.styles as unknown as { cssText: string }[]).map((s) => s.cssText).join('\n');
  const mixPercent = (selector: string, ink: string): number => {
    const sheet = sheetText();
    const at = sheet.indexOf(`${selector} {`);
    const body = sheet.slice(at, sheet.indexOf('}', at));
    const mix = new RegExp(`--dex-color-text-muted:\\s*color-mix\\(\\s*in srgb,\\s*var\\(${ink}(?:,[^)]*)?\\)\\s*(\\d+)%`).exec(body);
    expect(mix, `${selector} redeclares the muted ink`).not.toBeNull();
    return Number(mix![1]) / 100;
  };
  /** `ink` at `share` of its strength (color-mix with transparent) over `under`. */
  const dimmed = (ink: string, share: number, under: string): string => {
    const [r, g, b] = rgba(ink);
    return over(`rgba(${r}, ${g}, ${b}, ${share})`, under);
  };

  it.each(Object.entries(THEME_SETS))('keeps read-only ink at 4.5:1 on every wash and on a selected row in the %s set', (_name, set) => {
    const at = surfaces(set);
    const text = set.get('--dex-color-text')!;
    const marked = mixPercent('tr.data-row.diff-changed:not(.selected)', '--dex-color-text');
    for (const kind of ['added', 'removed', 'changed'] as const) {
      expect(contrast(dimmed(text, marked, at.row(kind)), at.row(kind)), kind).toBeGreaterThanOrEqual(4.5);
    }
    // A differing cell draws its muted parts in the full text ink.
    expect(contrast(text, at.cell), 'a differing cell').toBeGreaterThanOrEqual(4.5);
    // A selected row, whose surface takes the washes' place: its ink, and its read-only ink.
    const ink = set.get('--dex-selection-fg')!;
    const selected = mixPercent('tr.data-row.selected', '--dex-row-ink');
    expect(contrast(ink, at.selected), 'selected text').toBeGreaterThanOrEqual(4.5);
    expect(contrast(dimmed(ink, selected, at.selected), at.selected), 'selected read-only text').toBeGreaterThanOrEqual(4.5);
  });

  it('draws a differing cell in the full text ink, its muted parts included, but on a selected row', () => {
    const sheet = sheetText();
    const at = sheet.indexOf('tr.data-row:not(.selected) td.diff-cell {');
    expect(at).toBeGreaterThan(-1);
    const body = sheet.slice(at, sheet.indexOf('}', at));
    expect(body).toContain('--dex-color-text-muted: var(--dex-color-text, #333)');
    expect(body).toContain('color: var(--dex-color-text, #333)');
  });

  it('underlines a differing cell, and keeps the underline on a selected row', () => {
    const sheet = (DexTreeTable.styles as unknown as { cssText: string }[]).map((s) => s.cssText).join('\n');
    const rule = (selector: string): string => {
      const at = sheet.indexOf(`${selector} {`);
      return at < 0 ? '' : sheet.slice(at, sheet.indexOf('}', at));
    };
    expect(rule('tr.data-row td.diff-cell')).toContain('inset 0 -1px 0 0 var(--dex-diff-changed');
    expect(rule('tr.data-row.selected td.diff-cell')).not.toContain('box-shadow');
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
