// Copyright 2026 The MathWorks, Inc.
//
// A widget is readable in any app, with no VS Code around and with no theme sheet at all.
//
// Two halves. Every var() in a widget's stylesheet reads a --dex-* token and ends on a literal,
// the light theme's value: a widget on a page that loads nothing renders the light theme rather
// than whatever an undeclared variable leaves behind (a transparent surface, an inherited ink).
// And theme.css (src/theme/tokens.css) declares every token a widget reads, with the same light
// value, and again in the dark and high-contrast sets for every token that paints a colour.
//
// No VS Code variable and no :host-context in the widgets, comments included: the first names
// one host, and the second is Chromium-only and keyed on that host's body classes. VS Code maps
// the tokens onto its theme in its own vscode-theme.css, which is the worked example of mapping
// a design system onto --dex-*.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  THEME_CSS,
  THEME_SETS,
  block,
  chain,
  hasColour,
  normalise,
  stripComments,
  varReads,
  widgetSources,
} from './tools/cssTokens.js';

const SOURCES = widgetSources();
const CODE = SOURCES.map(([file, src]) => [file, stripComments(src)] as const);
const LIGHT = THEME_SETS.light;

const READS = CODE.flatMap(([file, code]) => varReads(code).map((read) => ({ file, ...read })));

/** Tokens a widget declares for itself and reads back (the table's --dex-row-ink, the frozen
 *  edge, the project page's --dex-muted): the widget's own business, not the theme's. A name the
 *  theme also declares stays a theme token — the selected row redeclares --dex-color-text-muted.
 *  Declared in a stylesheet, or set on an element as a styleProps key (`'--dex-table-min-width':`). */
const OWNED = new Set(
  CODE.flatMap(([, code]) => [...code.matchAll(/(--dex-[\w-]+)'?\s*:/g)].map((m) => m[1])).filter(
    (name) => !LIGHT.has(name),
  ),
);
const THEME_READS = READS.filter((read) => !OWNED.has(read.name));
const THEME_TOKENS = [...new Set(THEME_READS.map((read) => read.name))].sort();

const where = (read: { file: string; line: number }) => `${read.file}:${read.line}`;

describe('a widget needs no VS Code and no theme sheet', () => {
  it('reads widget styles from the files this test thinks it does', () => {
    // A renamed folder or a stripped-out stylesheet would make every check below vacuous.
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(READS.length).toBeGreaterThan(200);
  });

  it('names no VS Code variable and uses no :host-context, comments included', () => {
    for (const [file, src] of SOURCES) {
      expect(src.includes('--vscode-'), `${file} mentions a --vscode-* variable`).toBe(false);
      expect(src.includes(':host-context'), `${file} uses :host-context`).toBe(false);
    }
  });

  it('reads only --dex-* tokens, each through a fallback that ends on a literal', () => {
    for (const read of READS) {
      expect(read.name, where(read)).toMatch(/^--dex-[a-z0-9-]+$/);
      expect(read.fallback, `${where(read)} ${read.name} has no fallback`).not.toBeNull();
      // A fallback may be another --dex-* token (the gallery's width falls back to its floor),
      // but the chain has to END on something a page with no theme can paint.
      const { final } = chain(read);
      expect(final, `${where(read)} ${read.name} chain has no literal end`).not.toBeNull();
      expect(final!, `${where(read)} ${read.name} ends on a var()`).not.toMatch(/var\(/);
    }
  });

  it('falls back, at every read, to the value theme.css gives the light theme', () => {
    // So "no theme sheet" and "the light theme" are the same picture, and a widget cannot
    // drift to a grey of its own that nobody chose.
    for (const read of THEME_READS) {
      const { names, final } = chain(read);
      const innermost = names[names.length - 1];
      if (OWNED.has(innermost)) continue;
      expect(LIGHT.get(innermost), `${where(read)} ${innermost} is not in theme.css :root`).toBeDefined();
      expect(normalise(final!), `${where(read)} ${innermost} fallback`).toBe(LIGHT.get(innermost));
    }
  });
});

describe('theme.css declares every token a widget reads', () => {
  it('reads enough tokens for the sets below to mean something', () => {
    expect(THEME_TOKENS.length).toBeGreaterThan(50);
  });

  it('in the light set, on :root', () => {
    const missing = THEME_TOKENS.filter((name) => !LIGHT.has(name));
    expect(missing, 'read by a widget, not declared on :root').toEqual([]);
  });

  for (const set of ['dark', 'high-contrast'] as const) {
    it(`again in the ${set} set, for every token that paints a colour`, () => {
      // Literals in every set, not tokens derived from others: a var() inside a custom
      // property is resolved where it is declared, so a derived token on :root would keep its
      // light value under a data-theme placed on a descendant. Fonts, sizes and lengths are the
      // same in every theme and are left to :root.
      const missing = THEME_TOKENS.filter((name) => hasColour(LIGHT.get(name) ?? '') && !THEME_SETS[set].has(name));
      expect(missing, `colour token(s) the ${set} set does not declare`).toEqual([]);
      for (const name of THEME_TOKENS) {
        const value = THEME_SETS[set].get(name);
        if (value !== undefined) expect(value, `${set} ${name}`).not.toMatch(/var\(/);
      }
    });
  }

  it('in literals, so no set depends on another being loaded', () => {
    for (const [name, value] of LIGHT) expect(value, name).not.toMatch(/var\(/);
  });
});

describe("the frozen column shade is the theme's, as one whole layer per theme", () => {
  // Every clause is a bug already paid for. A host variable in the shade took the whole
  // box-shadow down with it when it did not resolve to a usable colour — the line included,
  // since one bad value invalidates the entire declaration. The host's own widget shadow, once it
  // did resolve, was too faint to see. And black over a near-black background has so little room
  // to darken it that the dark band has to cover more ground as well, so geometry and colour
  // travel together.
  it('is not declared by the table itself', () => {
    const [, table] = CODE.find(([file]) => file.endsWith('dex-tree-table.ts'))!;
    expect(table).not.toMatch(/--dex-frozen-shade\s*:/);
  });

  for (const [set, values] of Object.entries(THEME_SETS)) {
    it(`${set}: four lengths and a colour, with a spread of minus half the blur`, () => {
      const shade = values.get('--dex-frozen-shade');
      expect(shade, `${set} declares no --dex-frozen-shade`).toBeDefined();
      expect(shade!).not.toContain('var(');
      // A whole layer: a bare colour would leave the two sides of the transition different
      // lengths, and box-shadow would snap instead.
      const layer = /^(\S+) (\S+) (\S+) (\S+) (.+)$/.exec(shade!);
      expect(layer, `${set} ${shade}`).not.toBeNull();
      // A shadow is a copy of the whole cell box offset sideways, so a blur reaches above and
      // below it across the column's full width, and the header's bleed lands on the first row.
      const [, , , blur, spread] = layer!;
      expect(parseFloat(spread), `${set} spread vs blur`).toBeCloseTo(-parseFloat(blur) / 2, 5);
    });
  }

  it('is no shade at all in high contrast, where a hard line is the idiom', () => {
    expect(THEME_SETS['high-contrast'].get('--dex-frozen-shade')).toBe('0 0 0 0 transparent');
  });
});

describe("each set says which scheme it is, for the browser's own controls", () => {
  // Scrollbars, a <select>'s list and a checkbox are drawn by the browser, from color-scheme, and
  // no --dex-* token reaches them: without it a dark set draws light scrollbars on a dark table.
  const scheme = (selector: string): string | null =>
    /(?:^|;)\s*color-scheme\s*:\s*([^;]+);/.exec(block(THEME_CSS, selector))?.[1]?.trim() ?? null;

  it('dark in the dark set, light in the light high-contrast one', () => {
    expect(scheme('[data-theme="dark"]')).toBe('dark');
    expect(scheme('[data-theme="high-contrast"]')).toBe('light');
  });

  it('nothing on :root, so a page that chooses no theme keeps its own (VS Code\'s webview does)', () => {
    expect(scheme(':root')).toBeNull();
    expect(stripComments(THEME_CSS).match(/color-scheme/g)?.length).toBe(2);
  });
});

describe('the theme is exported', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it('as data-explorer-view/theme.css', () => {
    expect(pkg.exports['./theme.css']).toBe('./src/theme/tokens.css');
    expect(pkg.files).toContain('src/theme');
  });

  it('and nothing else: the 0.x theme/global.css is gone, and no stylesheet but theme.css is exported', () => {
    expect(existsSync(join(ROOT, 'src', 'theme', 'global.css'))).toBe(false);
    expect(Object.keys(pkg.exports).filter((key) => key.endsWith('.css') || key.includes('theme'))).toEqual(['./theme.css']);
  });
});
