// Copyright 2026 The MathWorks, Inc.
//
// Rules about the widgets' stylesheets that only the text can show. happy-dom resolves no custom
// property, evaluates no color-mix and composites no alpha, so "is this surface opaque" or "is
// this ring drawn" is not a question it can answer; what is left for a unit test is the invariant
// the pixels confirm, and that is a fact about the source. Every token read here is declared by
// theme.css, which themeTokens.test.ts pins; these are the rules on top of that.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, THEME_CSS, THEME_SETS, stripComments, widgetSources } from './tools/cssTokens.js';

const SOURCES = widgetSources();
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
// Comments first: the prose in these files quotes token names and whole declarations verbatim to
// explain the trap, so matching against it would let a rule pass on the strength of its own
// obituary.
const code = (rel: string): string => stripComments(read(rel));

// The maintainer has raised this twice. The Add gallery's responsive width arrived as a resize
// listener that measured the tab and wrote inline styles — "the responsiveness of the popup dialog
// should be done throught css directly, why do you need TS code?" (2026-09-28) — and the CSS that
// replaced it still read three TS constants interpolated into its declarations, one of them as the
// literal arithmetic `${2 * ADD_GALLERY_INSET}px`: "why do you do styling calculation in TS code,
// it should be done through CSS only" (2026-09-29).
//
// So the rule is a property of every component, not of the one that broke it: a `css` template is
// CSS text and nothing else. Custom properties are how a number gets in — declared on `:host` when
// only that shadow root needs it, in theme.css when two do — and calc() is how it gets multiplied.
// What this buys beyond doing as asked: an interpolated constant is baked per bundle at build
// time, so two components sharing one can still ship two different numbers, while a var() is
// resolved once at run time and cannot disagree with itself. Read off the source, which tsc copies
// into dist/ as written.
describe('a component stylesheet is CSS, with no TS interpolated into it', () => {
  const files = SOURCES.map(([file]) => file);

  // The guard is only as good as the set it runs over — an empty glob passes everything.
  it('finds the components at all', () => {
    expect(files).toContain(join('src', 'widgets', 'tree-table', 'dex-add-gallery.ts'));
    expect(files).toContain(join('src', 'widgets', 'tree-table', 'dex-tree-table.ts'));
    expect(files.length).toBeGreaterThan(10);
  });

  for (const [file, src] of SOURCES) {
    it(`${file} interpolates nothing into its css template`, () => {
      let found = 0;
      // Every css`…` body: from the tag to the backtick that closes it. A tagged template cannot
      // contain a backtick, so the next one is the end — which is also why the numbers had to be
      // interpolated rather than written inline in the first place.
      for (const tag of src.matchAll(/(^|[^\w.])css\s*`/g)) {
        const start = tag.index! + tag[0].length;
        const end = src.indexOf('`', start);
        expect(end, `unterminated css template in ${file}`).toBeGreaterThan(start);
        const body = src.slice(start, end);
        expect(body.match(/\$\{[^}]*\}/g), `${file} interpolates TS into CSS — declare a custom property instead`).toBeNull();
        found++;
      }
      // A file that takes `css` from lit writes at least one template with it, and a regex that
      // silently matched nothing is the way this check would rot.
      if (/import\s*\{[^}]*\bcss\b[^}]*\}\s*from\s*'lit'/.test(src)) expect(found, file).toBeGreaterThan(0);
    });
  }

  it("the project page's stylesheet string interpolates nothing either", () => {
    // The one stylesheet that is not a css`` template: the page's CSS is a plain string, so the
    // same page can be served as a document (unsafeCSS takes it into the element).
    const src = read(join('src', 'widgets', 'project-page', 'projectPageStyle.ts'));
    const m = /export const PROJECT_PAGE_CSS = `([^`]*)`/.exec(src);
    expect(m, 'no PROJECT_PAGE_CSS template').not.toBeNull();
    expect(m![1].length).toBeGreaterThan(1000);
    expect(m![1].match(/\$\{[^}]*\}/g)).toBeNull();
  });
});

// The Variable Editor: the floating panel, the grid inside it, and the glyph in the table that
// opens it. One feature, three files.
const VARIABLE_EDITOR = {
  'dex-variable-editor.ts': code('src/widgets/variable-editor/dex-variable-editor.ts'),
  'dex-matrix-grid.ts': code('src/widgets/variable-editor/dex-matrix-grid.ts'),
  'dex-matrix-open.ts': code('src/widgets/shared/dex-matrix-open.ts'),
};

// Reported 2026-10-01: "the mini table column header and row header cell background are
// transparent, when scroll, it overlap on the cell content." The header was `rgba(0, 0, 0, 0.04)`
// — a 4%-black wash — so every cell that scrolled behind it stayed visible: measured at 208/255
// worst-case change over 13.8% of the header's pixels, the digits of the row underneath painted
// through the numbers labelling the column. dex-tree-table wrote the rule down on its frozen first
// column: a sticky cell paints its own background, nothing is painted between it and what it
// covers, so anything short of a FULLY opaque background lets the content slide visibly under it.
describe('a sticky header cell paints an opaque surface', () => {
  // The grid pins its column numbers to the top and its row numbers to the left, so every cell in
  // the matrix eventually passes behind one of them.
  const GRID = VARIABLE_EDITOR['dex-matrix-grid.ts'];
  const rule = /\[role='columnheader'\],\s*\[role='rowheader'\]\s*\{([^}]*)\}/.exec(GRID);

  it('is the rule this test thinks it is', () => {
    // A renamed selector would make every assertion below vacuous.
    expect(rule, "no rule styling [role='columnheader'], [role='rowheader']").not.toBeNull();
    expect(rule![1]).toMatch(/position:\s*sticky/);
    expect(rule![1]).toMatch(/background:/);
  });

  it('declares a background that carries no alpha, whichever token resolves', () => {
    const background = /background:([^;]*);/.exec(rule![1])![1];
    // Every way CSS has of being see-through. `transparent` is listed because it is the sneaky
    // one: color-mix(in srgb, <colour> 8%, transparent) reads like a tint and is 92% see-through,
    // which is how this bug would come back.
    for (const alpha of [/rgba\(/, /hsla\(/, /\btransparent\b/, /#[0-9a-fA-F]{4}\b/, /#[0-9a-fA-F]{8}\b/]) {
      expect(background, `header background may not be translucent: ${background.trim()}`).not.toMatch(alpha);
    }
    // And it has to be a colour the theme chose. A bare opaque literal would pass the check above
    // and paint a grey header in every theme on earth.
    expect(background).toMatch(/var\(\s*--dex-/);
  });
});

// `--dex-focus-ring: 0 0 0 2px <colour>` (theme.css). Read as `outline: 2px solid
// var(--dex-focus-ring, …)` the declaration is invalid at computed-value time and the browser
// drops it ENTIRELY — measured on the shipped bundle, a focused cell in the mini table reported
// outlineStyle: none, i.e. a keyboard user navigating the grid could not see where they were.
// dex-context-menu.ts reads the same token correctly, as `box-shadow: inset var(--dex-focus-ring, …)`.
describe('--dex-focus-ring is a shadow, so it cannot be an outline colour', () => {
  const outlines = (css: string): string[] => [...css.matchAll(/outline:([^;]*);/g)].map((m) => m[1]);

  for (const [name, css] of Object.entries(VARIABLE_EDITOR)) {
    it(`${name} does not put it in an outline`, () => {
      for (const value of outlines(css)) {
        expect(value, `outline:${value}`).not.toMatch(/--dex-focus-ring/);
      }
    });
  }

  it('nor does any widget at all', () => {
    let seen = 0;
    for (const [file, src] of SOURCES) {
      for (const value of outlines(stripComments(src))) {
        expect(value, `${file} outline:${value}`).not.toMatch(/--dex-focus-ring/);
        seen++;
      }
    }
    // The rule reads every outline the widgets declare, and there are plenty.
    expect(seen).toBeGreaterThan(10);
  });
});

// Two tokens shipped undeclared in the per-column filter popup, and the colour one was severe.
// `.op-button[aria-pressed=true]` — the button that says WHICH comparison Apply is about to write,
// i.e. the popup's entire state display — read `--dex-bg-selected`, which no theme declares, so it
// painted its light-theme literal in every theme: 1.22:1 against its own ink in VS Code's Dark
// Modern, failing AA and AA-Large. The declared token for this surface already existed:
// --dex-color-accent-bg, whose light value is #cde4f7 — the shipped literal was that value with
// one hex digit changed, which is the evidence that the token name was a slip and not a design.
// The second was --dex-font-family-mono on `.writes-value`, where --dex-font-mono is declared: the
// line showing the literal filter syntax ignored the user's configured editor font.
//
// Named individually, on top of themeTokens.test.ts's sweep, because the sweep passes the moment
// a name is DECLARED — and declaring --dex-bg-selected in theme.css would be the wrong repair: it
// would add a fourth spelling of "the selected surface" beside --dex-selection-bg,
// --dex-color-accent-bg and --dex-bg-active. The requirement is that this component reads the
// EXISTING token, not that the invented name acquires a value.
describe('the two tokens that shipped undeclared stay gone', () => {
  const CSS = code('src/widgets/tree-table/dex-column-filter.ts');

  it('takes the pressed operator surface from --dex-color-accent-bg', () => {
    const rule = /\.op-button\[aria-pressed='true'\]\s*\{([^}]*)\}/.exec(CSS);
    expect(rule, "no rule styling .op-button[aria-pressed='true']").not.toBeNull();
    const background = /background:([^;]*);/.exec(rule![1]);
    expect(background, 'the pressed operator declares no background').not.toBeNull();
    expect(background![1]).toMatch(/var\(\s*--dex-color-accent-bg\b/);
    expect(CSS).not.toContain('--dex-bg-selected');
  });

  it('takes the syntax line monospace from --dex-font-mono', () => {
    const rule = /\.writes-value\s*\{([^}]*)\}/.exec(CSS);
    expect(rule, 'no rule styling .writes-value').not.toBeNull();
    expect(rule![1]).toMatch(/font-family:\s*var\(\s*--dex-font-mono\b/);
    expect(CSS).not.toContain('--dex-font-family-mono');
  });
});

// --dex-bg-badge was the filter bar's one undeclared read: the term chips painted
// `var(--dex-bg-badge, rgba(128, 128, 128, 0.18))` and nothing declared the name, so the fallback
// always won. The repair DECLARES it with that literal, so the chips render as before. A mid-grey
// at 18% alpha is self-neutral, and the chip-ink contrast measured in the browser on 2026-10-04
// (11.47 / 8.16 / 17.92 / 14.88 :1 across Dark Modern, Light Modern, HC Black, HC White) was taken
// at exactly this value. A theme override, or a remap onto a solid colour, would change every chip
// and void those numbers, so this pins every declaration in theme.css to that one value, and holds
// the chip's own fallback to it so none of them can drift apart.
describe('the filter bar chip wash is declared, at the value it was measured at', () => {
  const WASH = 'rgba(128, 128, 128, 0.18)';

  it(`.chip reads --dex-bg-badge, which every theme declares as ${WASH}`, () => {
    const rule = /\.chip\s*\{([^}]*)\}/.exec(code('src/widgets/tree-table/dex-filter-bar.ts'));
    expect(rule, 'no rule styling .chip').not.toBeNull();
    const background = /background:([^;]*);/.exec(rule![1]);
    expect(background, 'the .chip rule declares no background').not.toBeNull();
    const reads = /^\s*var\(\s*--dex-bg-badge\s*(?:,\s*(.*))?\)\s*$/.exec(background![1]);
    expect(reads, `.chip background is not var(--dex-bg-badge): ${background![1]}`).not.toBeNull();

    const declared = [...stripComments(THEME_CSS).matchAll(/--dex-bg-badge\s*:\s*([^;]*);/g)].map((m) => m[1].trim());
    expect(declared.length, 'declarations of --dex-bg-badge').toBeGreaterThan(1);
    for (const value of declared) expect(value).toBe(WASH);
    for (const [set, tokens] of Object.entries(THEME_SETS)) expect(tokens.get('--dex-bg-badge'), set).toBe(WASH);

    if (reads![1] !== undefined) expect(reads![1].trim(), 'the .chip fallback').toBe(WASH);
  });
});
