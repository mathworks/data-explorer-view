// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Each widget's define registers the parts its template draws, then the widget. Nothing is
// defined on import, so a part a define forgets never upgrades: the table would hold an inert
// <dex-filter-bar>, and nothing would say so. The parts are read from each widget's source
// (every `<dex-…` in its code, and the parts of those parts; its comments name other widgets
// without drawing them), so a template that gains a part fails here until its define gains it
// too.
//
// The registry is stubbed empty around each call: the real one is shared by the whole file, and
// in it a part some earlier define registered would pass for one this define registered.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankCommentsAndKeepLines } from './tools/moduleGraph.js';
import { DexContextMenu, defineContextMenu } from '../src/widgets/context-menu/dex-context-menu.js';
import { DexErrorDialog, defineErrorDialog } from '../src/widgets/error-dialog/dex-error-dialog.js';
import { DexPropertyInspector, definePropertyInspector } from '../src/widgets/property-inspector/dex-property-inspector.js';
import { DexIcon, defineIcon } from '../src/widgets/shared/dex-icon.js';
import { DexMatrixOpen, defineMatrixOpen } from '../src/widgets/shared/dex-matrix-open.js';
import { DexAddGallery, defineAddGallery } from '../src/widgets/tree-table/dex-add-gallery.js';
import { DexColumnFilter, defineColumnFilter } from '../src/widgets/tree-table/dex-column-filter.js';
import { DexFilterBar, defineFilterBar } from '../src/widgets/tree-table/dex-filter-bar.js';
import { DexTreeTable, defineTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';
import { DexMatrixGrid, defineMatrixGrid } from '../src/widgets/variable-editor/dex-matrix-grid.js';
import { DexVariableEditor, defineVariableEditor } from '../src/widgets/variable-editor/dex-variable-editor.js';

interface Widget {
  tag: string;
  file: string;
  cls: CustomElementConstructor;
  define: (tag?: string) => void;
}

const WIDGETS: Widget[] = [
  { tag: 'dex-tree-table', file: 'tree-table/dex-tree-table.ts', cls: DexTreeTable, define: defineTreeTable },
  { tag: 'dex-filter-bar', file: 'tree-table/dex-filter-bar.ts', cls: DexFilterBar, define: defineFilterBar },
  { tag: 'dex-column-filter', file: 'tree-table/dex-column-filter.ts', cls: DexColumnFilter, define: defineColumnFilter },
  { tag: 'dex-add-gallery', file: 'tree-table/dex-add-gallery.ts', cls: DexAddGallery, define: defineAddGallery },
  { tag: 'dex-property-inspector', file: 'property-inspector/dex-property-inspector.ts', cls: DexPropertyInspector, define: definePropertyInspector },
  { tag: 'dex-variable-editor', file: 'variable-editor/dex-variable-editor.ts', cls: DexVariableEditor, define: defineVariableEditor },
  { tag: 'dex-matrix-grid', file: 'variable-editor/dex-matrix-grid.ts', cls: DexMatrixGrid, define: defineMatrixGrid },
  { tag: 'dex-context-menu', file: 'context-menu/dex-context-menu.ts', cls: DexContextMenu, define: defineContextMenu },
  { tag: 'dex-error-dialog', file: 'error-dialog/dex-error-dialog.ts', cls: DexErrorDialog, define: defineErrorDialog },
  { tag: 'dex-matrix-open', file: 'shared/dex-matrix-open.ts', cls: DexMatrixOpen, define: defineMatrixOpen },
  { tag: 'dex-icon', file: 'shared/dex-icon.ts', cls: DexIcon, define: defineIcon },
];
const byTag = new Map(WIDGETS.map((w) => [w.tag, w]));

// import.meta.dirname, not a URL against import.meta.url: under happy-dom that URL resolves
// against the document, not this file.
const drawn = (w: Widget): string[] => {
  const src = blankCommentsAndKeepLines(readFileSync(join(import.meta.dirname, '../src/widgets', w.file), 'utf8'));
  return [...new Set([...src.matchAll(/<(dex-[a-z-]+)/g)].map((m) => m[1]!))].filter((t) => t !== w.tag);
};

/** Every part `w` draws, directly or through a part of its own. */
function partsOf(w: Widget, seen = new Set<string>()): Set<string> {
  for (const tag of drawn(w)) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    const part = byTag.get(tag);
    if (!part) throw new Error(`${w.file} draws <${tag}>, which is no widget of this package`);
    partsOf(part, seen);
  }
  return seen;
}

/** What `call` asks the registry to define, in order, as if nothing were defined yet. */
function definedBy(call: () => void): [string, CustomElementConstructor][] {
  const asked: [string, CustomElementConstructor][] = [];
  vi.spyOn(customElements, 'get').mockReturnValue(undefined);
  vi.spyOn(customElements, 'define').mockImplementation((tag, cls) => void asked.push([tag, cls]));
  try {
    call();
  } finally {
    vi.restoreAllMocks();
  }
  return asked;
}

describe('each widget defines the parts its template draws, then itself', () => {
  it.each(WIDGETS.map((w) => [w.tag, w] as const))('<%s>', (_tag, w) => {
    const asked = definedBy(() => w.define());

    expect(asked.at(-1)).toEqual([w.tag, w.cls]);
    const parts = new Map(asked.slice(0, -1));
    expect([...parts.keys()].sort()).toEqual([...partsOf(w)].sort());
    for (const [tag, cls] of parts) expect(cls, `<${tag}>`).toBe(byTag.get(tag)!.cls);
  });

  it('the table draws the filter bar, the column filter, the + Add gallery, the matrix glyph and the icon', () => {
    // The scan above is only as good as what it finds: pin the one widget with many parts.
    expect([...partsOf(byTag.get('dex-tree-table')!)].sort()).toEqual(
      ['dex-add-gallery', 'dex-column-filter', 'dex-filter-bar', 'dex-icon', 'dex-matrix-open'],
    );
  });
});

describe('a widget under a name the app chooses', () => {
  it('takes that name, and its parts keep their default names', () => {
    const asked = new Map(definedBy(() => defineTreeTable('app-table')));

    expect(asked.get('app-table')).toBe(DexTreeTable);
    expect(asked.has('dex-tree-table')).toBe(false);
    expect(asked.get('dex-filter-bar')).toBe(DexFilterBar);
  });
});

// The real registry from here on, so the order matters: what one test defines, the next finds.
describe('in the page registry', () => {
  it('throws when another class holds a part\'s name, and leaves the widget undefined', () => {
    customElements.define('dex-matrix-grid', class TheirGrid extends HTMLElement {});

    expect(() => defineVariableEditor()).toThrow(
      '<dex-matrix-grid> is already defined as TheirGrid; it cannot also be DexMatrixGrid',
    );
    expect(customElements.get('dex-variable-editor')).toBeUndefined();
  });

  it('defines the widget and its parts, which then upgrade', () => {
    defineTreeTable();

    expect(customElements.get('dex-tree-table')).toBe(DexTreeTable);
    expect(document.createElement('dex-filter-bar')).toBeInstanceOf(DexFilterBar);
  });

  it('takes a second call, and a second widget sharing a part, as a no-op', () => {
    expect(() => defineTreeTable()).not.toThrow();
    // The inspector draws the matrix glyph the table defined.
    expect(() => definePropertyInspector()).not.toThrow();
    expect(customElements.get('dex-property-inspector')).toBe(DexPropertyInspector);
    expect(customElements.get('dex-matrix-open')).toBe(DexMatrixOpen);
  });
});
