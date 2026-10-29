// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// THE WIDGETS DRAW UNDER A STRICT CONTENT-SECURITY-POLICY.
//
// A page whose policy leaves 'unsafe-inline' out of style-src refuses every style ATTRIBUTE a
// script writes: `setAttribute('style', …)`, which is what a Lit binding `style="width: ${w}px"`
// commits, and what Lit's styleMap commits the first time. The tree table and the matrix grid had
// nineteen such bindings — indents, the virtual scroll's spacer and offset, column widths, the
// popovers' positions — so an app had to allow 'unsafe-inline' or get a collapsed table. They now
// set those properties through element.style (shared/styleProps.ts), which no policy refuses.
//
// happy-dom has no CSP, and it stores element.style by writing the attribute itself. So a write of
// the style attribute made while no element.style API is running is one a strict page would
// refuse, and that is what is counted. The values those properties take are pinned where they
// always were (treeTableVirtualScroll, treeTableHeader, treeTableDragDrop, treeTableExpand,
// matrixGridWindow); the real policy is applied in a real browser by the 3.5a gate's strict page.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { defineMatrixGrid, type DexMatrixGrid } from '../src/widgets/variable-editor/dex-matrix-grid.js';
import { defineContextMenu, type DexContextMenu } from '../src/widgets/context-menu/dex-context-menu.js';
import { defineVariableEditor, type DexVariableEditor } from '../src/widgets/variable-editor/dex-variable-editor.js';
import { stripComments, widgetSources } from './tools/cssTokens.js';

defineTreeTable();
defineMatrixGrid();
defineContextMenu();
defineVariableEditor();

// Style attribute writes that did not come through element.style: what a strict policy refuses.
const refused: string[] = [];
let inCssom = 0;
const restore: (() => void)[] = [];

// Runs `fn` counted as a CSSOM call, so the style attribute happy-dom writes under it is not counted.
const throughCssom =
  (fn: (...args: unknown[]) => unknown) =>
  function (this: unknown, ...args: unknown[]) {
    inCssom++;
    try {
      return fn.apply(this, args);
    } finally {
      inCssom--;
    }
  };

beforeAll(() => {
  // Every way into element.style, up the prototype chain: setProperty, removeProperty, cssText,
  // and each property's setter (`el.style.top = …`).
  for (let proto = CSSStyleDeclaration.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, key)!;
      if (key === 'constructor' || !d.configurable) continue;
      if (d.set) Object.defineProperty(proto, key, { ...d, set: throughCssom(d.set) });
      else if (typeof d.value === 'function') Object.defineProperty(proto, key, { ...d, value: throughCssom(d.value) });
      else continue;
      restore.push(() => Object.defineProperty(proto, key, d));
    }
  }
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    if (String(name).toLowerCase() === 'style' && inCssom === 0) refused.push(`<${this.localName}> style="${value}"`);
    return setAttribute.call(this, name, value);
  };
  restore.push(() => {
    Element.prototype.setAttribute = setAttribute;
  });
});

afterAll(() => {
  for (const undo of restore.reverse()) undo();
});

beforeEach(() => {
  refused.length = 0;
  document.body.innerHTML = '';
  localStorage.clear();
});

const row = (id: string, parent: string | null, extra: Partial<TreeTableRow> = {}): TreeTableRow => ({
  ID: id,
  parent,
  Name: { label: id, editable: true },
  Value: '',
  DataType: '',
  Description: '',
  Status: '',
  ...extra,
});

async function table(): Promise<DexTreeTable> {
  const el = new DexTreeTable();
  document.body.appendChild(el);
  el.rows = [row('a', null), row('a.b', 'a'), row('a.b.c', 'a.b')];
  (el as any)._expandedIds = new Set(['a', 'a.b']);
  await el.updateComplete;
  return el;
}

describe('the widgets write no style attribute', () => {
  it('counts one, so the checks below can fail', () => {
    const div = document.createElement('div');
    div.setAttribute('style', 'width: 1px');
    div.style.setProperty('height', '2px');
    expect(refused).toEqual(['<div> style="width: 1px"']);
  });

  it('the tree table: indents, column widths, the min width, the virtual spacer and offset', async () => {
    const el = await table();
    const sr = el.shadowRoot!;
    expect((sr.querySelector('tr[data-row-id="a.b.c"] .indent') as HTMLElement).style.width).toBe('32px');
    expect(sr.querySelectorAll('col').length).toBeGreaterThan(0);
    expect((sr.querySelector('.virtual-spacer') as HTMLElement).style.height).not.toBe('');
    expect((sr.querySelector('.rows-table') as HTMLElement).style.top).not.toBe('');
    expect((sr.querySelector('.table-container') as HTMLElement).style.getPropertyValue('--dex-table-min-width')).not.toBe('');
    expect(refused).toEqual([]);
  });

  it('the tree table: a Name editor, an empty search, the column menu, a column filter, a drag', async () => {
    const el = await table();
    const sr = el.shadowRoot!;
    expect(el.beginRename('a.b')).toBe(true);
    await el.updateComplete;
    (el as any)._setFilterText('nothing-matches-this');
    await el.updateComplete;
    expect(sr.querySelector('.no-match-state')).not.toBeNull();
    (sr.querySelector('.columns-button') as HTMLElement).click();
    await el.updateComplete;
    expect((sr.querySelector('.column-menu') as HTMLElement).style.top).not.toBe('');
    (el as any)._setFilterText('');
    await el.updateComplete;
    sr.querySelector('th')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect((sr.querySelector('dex-column-filter') as HTMLElement).style.left).not.toBe('');
    Object.assign(el as any, { _dragLabel: 'a', _dropTooltipX: 100, _dropTooltipY: 200 });
    await el.updateComplete;
    expect((sr.querySelector('.drop-tooltip') as HTMLElement).style.left).toBe('114px');
    expect(refused).toEqual([]);
  });

  it('the matrix grid: its width, rows, cells and the padding either side of the window', async () => {
    const grid = document.createElement('dex-matrix-grid') as DexMatrixGrid;
    document.body.append(grid);
    const cells = Array.from({ length: 40 * 40 }, (_, i) => String(i));
    grid.matrix = { name: 'A', className: 'double', dims: [40, 40], nodeId: 'n', cells };
    await grid.updateComplete;
    const sr = grid.shadowRoot!;
    expect(sr.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0);
    expect((sr.querySelector('[role="grid"]') as HTMLElement).style.width).not.toBe('');
    expect((sr.querySelector('.pad-bottom') as HTMLElement).style.height).not.toBe('');
    const box = sr.querySelector('.scroll') as HTMLElement;
    box.scrollTop = 400;
    box.dispatchEvent(new Event('scroll'));
    await grid.updateComplete;
    expect(refused).toEqual([]);
  });

  it('the context menu and the variable editor, which place themselves', async () => {
    const menu = document.createElement('dex-context-menu') as DexContextMenu;
    document.body.append(menu);
    menu.show(10, 20, [{ id: 'copy', label: 'Copy' }]);
    await menu.updateComplete;
    const editor = document.createElement('dex-variable-editor') as DexVariableEditor;
    document.body.append(editor);
    await editor.updateComplete;
    // The menu places itself a frame after it opens, once it can measure itself.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(menu.style.left).toBe('10px');
    expect(refused).toEqual([]);
  });

  it('no widget template binds a style attribute', () => {
    // The tripwire for a binding added later, in a template no test above draws. `table-style` is
    // an attribute of the table's own, not a style.
    const bindings = widgetSources().flatMap(([file, src]) =>
      stripComments(src)
        .split('\n')
        .flatMap((line, i) => (/(?<![\w-])style\s*=/.test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])),
    );
    expect(bindings).toEqual([]);
  });
});

describe('styleProps', () => {
  it('is refused in an attribute, where it would not be the only writer', async () => {
    const { html, render } = await import('lit');
    const { styleProps } = await import('../src/widgets/shared/styleProps.js');
    const host = document.createElement('div');
    expect(() => render(html`<div style=${styleProps({ width: '1px' })}></div>`, host)).toThrow(/goes on an element/);
  });

  it('writes a value only when it changes, and removes one no longer given', async () => {
    const { html, render } = await import('lit');
    const { styleProps } = await import('../src/widgets/shared/styleProps.js');
    const host = document.createElement('div');
    const draw = (props: Record<string, string | undefined>) => render(html`<p ${styleProps(props)}></p>`, host);
    draw({ width: '1px', '--dex-x': '2px' });
    const p = host.querySelector('p')!;
    expect(p.style.width).toBe('1px');
    expect(p.style.getPropertyValue('--dex-x')).toBe('2px');
    // Written by someone else in between (the table's scroll handler moves its rows this way): a
    // repaint with an unchanged value leaves it, as an attribute binding did.
    p.style.width = '5px';
    draw({ width: '1px', '--dex-x': '2px' });
    expect(p.style.width).toBe('5px');
    draw({ width: '3px' });
    expect(p.style.width).toBe('3px');
    expect(p.style.getPropertyValue('--dex-x')).toBe('');
    expect(refused).toEqual([]);
  });
});

// The source the table reads is the source shipped: the bindings counted above are in dist too.
describe('the built widgets', () => {
  it('carry no style binding either', () => {
    const dist = ['widgets/tree-table/dex-tree-table.js', 'widgets/variable-editor/dex-matrix-grid.js'].map((f) =>
      readFileSync(join(process.cwd(), 'dist', f), 'utf8'),
    );
    for (const js of dist) expect(stripComments(js)).not.toMatch(/(?<![\w-])style="/);
  });
});
