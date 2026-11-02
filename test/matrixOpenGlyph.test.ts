// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The glyph after a matrix value, in the table's Value cell and the inspector's
// Value row. It opens nothing: it says `dex-matrix-open`, and connectTable or
// connectInspector shows the editor and asks for the cells. What it owns is the
// control a keyboard user reaches, the event, and that a click on it is not also
// a click on the cell it sits in.
import { describe, it, expect, afterEach } from 'vitest';
import { DexMatrixOpen, defineMatrixOpen, type MatrixOpenDetail } from '../src/widgets/tree-table/index.js';
import type { MatrixDescriptor } from '../src/widgets/variable-editor/index.js';

defineMatrixOpen();

let glyph: DexMatrixOpen | null = null;

afterEach(() => {
  glyph?.remove();
  glyph = null;
});

// A DESCRIPTOR, not a payload: the glyph is rendered once per matrix-valued row
// in the table, so what it holds is what every such row costs. It needs the
// name, the shape and the class for its label and tooltip, and nothing else.
function descriptor(over: Partial<MatrixDescriptor> = {}): MatrixDescriptor {
  return { name: 'A', className: 'double', dims: [2, 2], nodeId: 'n1', ...over };
}

async function makeGlyph(over: Partial<MatrixDescriptor> = {}, rowId?: string): Promise<DexMatrixOpen> {
  glyph = new DexMatrixOpen();
  glyph.matrix = descriptor(over);
  if (rowId !== undefined) {
    glyph.rowId = rowId;
  }
  document.body.appendChild(glyph);
  await glyph.updateComplete;
  return glyph;
}

function control(el: DexMatrixOpen): HTMLAnchorElement {
  return el.shadowRoot!.querySelector<HTMLAnchorElement>('a')!;
}

function events(el: DexMatrixOpen): MatrixOpenDetail[] {
  const seen: MatrixOpenDetail[] = [];
  el.addEventListener('dex-matrix-open', (e) => seen.push(e.detail));
  return seen;
}

function key(el: DexMatrixOpen, k: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  control(el).dispatchEvent(ev);
  return ev;
}

describe('the glyph is an affordance, not an opener', () => {
  it('renders nothing without a payload, so a non-matrix row costs no DOM', async () => {
    glyph = new DexMatrixOpen();
    document.body.appendChild(glyph);
    await glyph.updateComplete;
    expect(glyph.shadowRoot!.querySelector('a')).toBeNull();
  });

  it('renders the wsTable icon inside a focusable control', async () => {
    const el = await makeGlyph({ dims: [3, 4], className: 'single' });
    const a = control(el);
    expect(a.tabIndex).toBe(0);
    expect(a.getAttribute('role')).toBe('button');
    expect(a.getAttribute('aria-label')).toBe('Open A in the Variable Editor');
    // The tooltip says what the value is before the user opens it.
    expect(a.getAttribute('title')).toBe('3x4 single — open in the Variable Editor');
    expect(el.shadowRoot!.querySelector('dex-icon')!.iconId).toBe('wsTable');
  });

  it('dispatches the descriptor, itself as the anchor, and the row id', async () => {
    const el = await makeGlyph({ name: 'Mat', nodeId: 'node-42' }, 'row-7');
    const seen = events(el);
    control(el).click();
    expect(seen.length).toBe(1);
    expect(seen[0].matrix.name).toBe('Mat');
    // The node id travels with it, because the event is what starts the fetch:
    // connectTable / connectInspector turn this into a `requestMatrix` for exactly this node.
    expect(seen[0].matrix.nodeId).toBe('node-42');
    expect('cells' in seen[0].matrix).toBe(false);
    expect(seen[0].anchorEl).toBe(el);
    expect(seen[0].rowId).toBe('row-7');
  });

  it('takes its row id from the row-id attribute too', async () => {
    glyph = new DexMatrixOpen();
    glyph.matrix = descriptor();
    glyph.setAttribute('row-id', 'row-3');
    document.body.appendChild(glyph);
    await glyph.updateComplete;
    const seen = events(glyph);
    control(glyph).click();
    expect(seen[0].rowId).toBe('row-3');
  });

  it('omits rowId when there is none — the PI has no rows', async () => {
    const el = await makeGlyph();
    const seen = events(el);
    control(el).click();
    expect(seen[0].rowId).toBeUndefined();
    expect('rowId' in seen[0]).toBe(false);
  });

  it('bubbles and crosses the shadow boundary, so one listener per webview suffices', async () => {
    const el = await makeGlyph();
    const seen: MatrixOpenDetail[] = [];
    const hear = (e: CustomEvent<MatrixOpenDetail>) => seen.push(e.detail);
    document.addEventListener('dex-matrix-open', hear);
    control(el).click();
    document.removeEventListener('dex-matrix-open', hear);
    expect(seen.length).toBe(1);
    expect(seen[0].anchorEl).toBe(el);
  });

  it('swallows the click so the table does not also select or start an edit', async () => {
    // The glyph sits inside a Value cell whose dblclick/Enter start editing and
    // whose click selects the row. Both must stay unaware of this click.
    const el = await makeGlyph();
    let reachedParent = false;
    const parent = () => { reachedParent = true; };
    document.body.addEventListener('click', parent);
    const ev = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
    control(el).dispatchEvent(ev);
    document.body.removeEventListener('click', parent);
    expect(ev.defaultPrevented).toBe(true);
    expect(reachedParent).toBe(false);
  });

  it('opens on Enter and on Space, and ignores other keys', async () => {
    const el = await makeGlyph();
    const seen = events(el);
    for (const k of ['Enter', ' ']) {
      // Swallowed like the click: Enter in a Value cell would otherwise start an edit.
      expect(key(el, k).defaultPrevented).toBe(true);
    }
    expect(seen.length).toBe(2);
    expect(key(el, 'ArrowDown').defaultPrevented).toBe(false);
    expect(seen.length).toBe(2);
  });

  it('says nothing once its descriptor is taken away', async () => {
    // A repaint can clear `matrix` while a click is on its way: the stale control
    // must open nothing, and the cell beneath it keeps the click.
    const el = await makeGlyph();
    const a = control(el);
    const seen = events(el);
    el.matrix = null;
    const ev = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(seen).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('a')).toBeNull();
  });

  it('forwards focus() to its inner control, so the shell can hand focus back', async () => {
    // close() calls anchorEl.focus(). Without this override that focuses the
    // host, which is not focusable, and focus would land on <body>.
    const el = await makeGlyph();
    el.focus();
    expect(el.shadowRoot!.activeElement).toBe(control(el));
  });
});
