// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Every widget honours the `hidden` attribute. Each one's own `:host` rule sets a display (flex,
// block, inline-flex, none-until-open), and a shadow root's `:host` rule beats the browser's
// `[hidden] { display: none }`, so `el.hidden = true` left the widget on screen and an app had to
// write the rule itself.
//
// happy-dom applies no stylesheet, so what is pinned here is the rule: present in every widget,
// and about `[hidden]` alone, so a widget without the attribute is drawn exactly as before. That it
// hides is measured in a real browser (the strict-CSP page of the 3.5a gate).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourceFiles } from './tools/moduleGraph.js';

const SRC = join(process.cwd(), 'src');

// Every LitElement the package declares, found in the sources, so a widget added later without
// the rule fails here rather than in an app.
const WIDGETS = sourceFiles(SRC).flatMap((rel) =>
  [...readFileSync(join(SRC, rel), 'utf8').matchAll(/^export class (\w+) extends LitElement\b/gm)].map((m) => ({
    rel,
    name: m[1]!,
  })),
);

const cssOf = (styles: unknown): string =>
  [styles]
    .flat(Infinity)
    .map((s) => (s as { cssText: string }).cssText)
    .join('\n')
    .replace(/\s+/g, ' ');

describe('the hidden attribute', () => {
  it('finds every widget', () => {
    expect(WIDGETS.map((w) => w.name).sort()).toEqual([
      'DexAddGallery',
      'DexColumnFilter',
      'DexContextMenu',
      'DexErrorDialog',
      'DexFilterBar',
      'DexHierarchy',
      'DexIcon',
      'DexMatrixGrid',
      'DexMatrixOpen',
      'DexPropertyInspector',
      'DexTreeTable',
      'DexVariableEditor',
    ]);
  });

  it.each(WIDGETS)('$name hides its host while it has the attribute', async ({ rel, name }) => {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(join(SRC, rel)).href)) as Record<string, { styles: unknown }>;
    expect(cssOf(mod[name]!.styles)).toContain(':host([hidden]) { display: none !important; }');
  });

  it('says nothing about a widget without it', async () => {
    const { hiddenStyles } = await import('../src/widgets/shared/hidden.styles.js');
    // One rule, one selector: nothing here applies to an element that is not hidden.
    expect(cssOf(hiddenStyles).trim()).toBe(':host([hidden]) { display: none !important; }');
  });
});
