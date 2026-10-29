// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The table's Status "Modified" mark takes its colour from the theme: --dex-color-modified,
// which vscode-theme.css maps onto the same theme colour as the sections tree's Modified badge
// (DECORATIONS.modified in src/model/hierarchy/health.ts), so "modified" is one colour on both
// surfaces there. data-explorer-vscode pins that mapping.
//
// It used to be the literal #b45309, chosen against a light background: 3.54:1 on Dark
// Modern's #181818 and 4.18:1 on HC Black's #000, both under WCAG AA's 4.5. A theme colour
// is the theme's own answer for each variant, high contrast included. The literal stays as
// the light theme's value, which is the fallback a page with no theme sheet gets.
//
// happy-dom computes no colour, so the rule is asserted as text here, through the element
// the real render path produces; the rendered contrast was measured in a browser against
// the shipped bundle.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { THEME_SETS } from './tools/cssTokens.js';

defineTreeTable();

beforeEach(() => localStorage.clear());

const sheet = (): string =>
  (DexTreeTable.styles as unknown as { cssText: string }[])
    .map((s) => s.cssText)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every innermost rule in the stylesheet as [selector list, declaration block]. */
const rules = (): [string, string][] =>
  [...sheet().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

/** The `color` the declaration block sets, whitespace-normalised, or null. */
function colorOf(block: string): string | null {
  const m = /(?:^|[;\s])color\s*:([^;]*)(;|$)/.exec(block);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

async function mountModifiedRow(): Promise<{ table: DexTreeTable; mark: HTMLElement }> {
  const table = new DexTreeTable();
  table.columns = ['Name', 'Status'];
  document.body.appendChild(table);
  (table as any)._hiddenColumns = new Set<string>();
  const row: TreeTableRow = { ID: 'm', parent: null, Name: { label: 'Kp' }, Status: 'Modified' };
  table.rows = [row];
  table.requestUpdate();
  await table.updateComplete;
  const td = table.shadowRoot!.querySelector('tr[data-row-id="m"] td.col-Status') as HTMLElement;
  expect(td, 'the Status cell rendered').not.toBeNull();
  const mark = td.querySelector('span') as HTMLElement;
  expect(mark?.textContent?.trim()).toBe('Modified');
  return { table, mark };
}

/** The colour of every rule that selects the rendered mark itself (not an ancestor). */
function colorsSelecting(mark: HTMLElement): { selector: string; color: string }[] {
  const out: { selector: string; color: string }[] = [];
  for (const [selectorList, block] of rules()) {
    const color = colorOf(block);
    if (color === null || selectorList.startsWith('@')) continue;
    for (const selector of selectorList.split(',').map((s) => s.trim())) {
      let hit = false;
      try {
        hit = mark.matches(selector);
      } catch {
        // :host(...), ::part and friends: not a selector a light element can match.
      }
      if (hit) out.push({ selector, color });
    }
  }
  return out;
}

describe('the Status "Modified" mark reads the theme', () => {
  it('reads --dex-color-modified, with the light theme\'s value as its fallback', async () => {
    const { table, mark } = await mountModifiedRow();
    const colours = colorsSelecting(mark);
    expect(colours.map((c) => c.selector)).toContain('.status-modified');
    // Every rule that colours the mark: a second, literal one (a "high contrast override")
    // would put back exactly the unthemed colour this replaces.
    for (const { selector, color } of colours) {
      expect(color, selector).toBe('var(--dex-color-modified, #b45309)');
    }
    // And it keeps its weight, the half of the cue that is not colour.
    const own = rules().find(([sel]) => sel === '.status-modified');
    expect(own![1]).toMatch(/font-weight\s*:\s*500\s*;/);
    table.remove();
  });

  it('is a colour every theme set chooses for itself', () => {
    // The literal was a light-background colour; the dark and high-contrast sets each pick one
    // that clears AA on their own background (#e2c08d on #1e1e1e is 9.65:1, #7a4800 on #fff 7.62:1).
    expect(THEME_SETS.light.get('--dex-color-modified')).toBe('#b45309');
    for (const set of ['dark', 'high-contrast'] as const) {
      const value = THEME_SETS[set].get('--dex-color-modified');
      expect(value, set).toMatch(/^#[0-9a-f]{6}$/);
      expect(value, set).not.toBe('#b45309');
    }
  });
});
