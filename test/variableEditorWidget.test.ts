// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The floating shell around the grid. Two things here are easy to get subtly
// wrong and both are user-visible: dismissal (a popover that outlives the rows
// it describes shows stale data) and focus return (a keyboard user who opens the
// editor and closes it must land back on the glyph, not at the top of the tree).
//
// happy-dom has no layout engine, so every element's getBoundingClientRect() is
// all zeros. Positioning tests therefore stub the rects they care about, which
// is enough to pin the ARITHMETIC — the only part this file owns.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DexVariableEditor,
  defineVariableEditor,
  type DexMatrixGrid,
  type MatrixCellsAnswer,
  type MatrixDescriptor,
  type MatrixPayload,
} from '../src/widgets/variable-editor/index.js';
import type { MatrixCellsMessage, MatrixPage } from '../src/model/index.js';

defineVariableEditor();

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let editor: DexVariableEditor | null = null;
let anchor: HTMLElement | null = null;

afterEach(() => {
  editor?.close();
  editor?.remove();
  anchor?.remove();
  editor = null;
  anchor = null;
  vi.restoreAllMocks();
});

// What a ROW carries: everything needed to title the panel and to ask for the
// rest. The cells are fetched when a panel opens — see connectTable / connectInspector.
function descriptor(over: Partial<MatrixDescriptor> = {}): MatrixDescriptor {
  return { name: 'A', className: 'double', dims: [2, 2], nodeId: 'n1', ...over };
}

function payload(over: Partial<MatrixPayload> = {}): MatrixPayload {
  return { ...descriptor(), cells: ['1', '2', '3', '4'], ...over };
}

// The answer to `requestMatrix`, as the app hands it to deliver().
function cells(matrix: MatrixPayload): MatrixCellsAnswer {
  return { nodeId: matrix.nodeId, matrix };
}

// A focusable stand-in for the glyph, so focus-return is observable.
function makeAnchor(rect?: Partial<DOMRect>): HTMLElement {
  anchor = document.createElement('button');
  anchor.textContent = 'open';
  document.body.appendChild(anchor);
  if (rect) {
    const full = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect };
    anchor.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
  }
  return anchor;
}

async function mount(): Promise<DexVariableEditor> {
  editor = new DexVariableEditor();
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

// Open and let the cells arrive, which is what the user sees happen. The two
// steps are separable and the fetching block below drives them apart.
async function open(matrix = payload(), rect?: Partial<DOMRect>): Promise<DexVariableEditor> {
  const el = await mount();
  el.show(makeAnchor(rect), matrix);
  await frame();
  await el.deliver(cells(matrix));
  await el.updateComplete;
  return el;
}

function grid(el: DexVariableEditor): DexMatrixGrid {
  return el.shadowRoot!.querySelector('dex-matrix-grid') as DexMatrixGrid;
}

function title(el: DexVariableEditor): string {
  return el.shadowRoot!.querySelector('.title')!.textContent!.trim();
}

function docKey(k: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

describe('opening and closing', () => {
  it('is closed and renders nothing before show()', async () => {
    const el = await mount();
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
  });

  it('marks itself open and hands the payload to the grid', async () => {
    const el = await open(payload({ dims: [2, 3], cells: ['1', '2', '3', '4', '5', '6'] }));
    expect(el.hasAttribute('open')).toBe(true);
    expect(grid(el).matrix!.cells).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('titles itself name — dims class, the way MATLAB describes a variable', async () => {
    const el = await open(payload({ name: 'ParamMat.Value', className: 'double', dims: [2, 3], cells: ['1', '2', '3', '4', '5', '6'] }));
    expect(title(el)).toBe('ParamMat.Value — 2x3 double');
    // The dialog is named by the same words, for a screen reader.
    expect(el.shadowRoot!.querySelector('.panel')!.getAttribute('aria-label')).toBe('ParamMat.Value — 2x3 double');
  });

  it('titles an N-D variable with every extent', async () => {
    const el = await open(payload({ name: 'Nd', dims: [2, 2, 2], cells: ['1', '2', '3', '4', '5', '6', '7', '8'] }));
    expect(title(el)).toBe('Nd — 2x2x2 double');
  });

  it('closes on Escape and returns focus to the anchor', async () => {
    const el = await open();
    docKey('Escape');
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('closes on Escape and on nothing else, so the grid keeps its own keys', async () => {
    // The keydown listener is on the DOCUMENT, so it sees every key the user
    // presses inside the grid too. Closing on anything but Escape would shut the
    // editor on the first ArrowRight and make a matrix impossible to walk.
    const el = await open();
    const closedBy: string[] = [];
    for (const k of ['ArrowRight', 'ArrowDown', 'Home', 'End', 'PageDown', 'Enter', 'Tab', 'a', 'Esc']) {
      docKey(k);
      await el.updateComplete;
      if (!el.hasAttribute('open')) closedBy.push(k);
    }
    expect(closedBy).toEqual([]);
  });

  it('leaves no document listeners behind when it is closed before its first frame', async () => {
    // show() defers its listeners by a frame so the click that opened the editor
    // cannot immediately dismiss it. If the app closes the editor inside that
    // frame — connectTable does, on every repaint — the deferred work has to be
    // abandoned: close() has already run its removeEventListener calls, so
    // listeners added after them stay on the document for the life of the page,
    // and the next stray keystroke or click runs a dismissal for a dead popover.
    const el = await mount();
    el.show(makeAnchor(), payload());
    el.close();
    await frame();
    await el.updateComplete;
    const spy = vi.spyOn(el, 'close');
    docKey('Escape');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    window.dispatchEvent(new Event('scroll'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes on the close button and returns focus to the anchor', async () => {
    const el = await open();
    el.shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('closes on an outside mousedown but NOT on one inside itself', async () => {
    const el = await open();
    el.shadowRoot!.querySelector('.panel')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    expect(el.hasAttribute('open')).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('closes when close() is called directly, e.g. because new rows arrived', async () => {
    const el = await open();
    el.close();
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot!.querySelector('.panel')).toBeNull();
  });

  it('does not steal focus back on a close it did not cause', async () => {
    // A repaint closes the editor while the user is somewhere else entirely.
    // Yanking focus to a glyph that may no longer exist would be worse than
    // leaving it where it is, so focus returns only when focus is still inside.
    const el = await open();
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    el.close();
    await el.updateComplete;
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('unhooks its document listeners on close', async () => {
    // A leaked keydown listener would close the NEXT editor instantly.
    const el = await open();
    el.close();
    await el.updateComplete;
    const spy = vi.spyOn(el, 'close');
    docKey('Escape');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    window.dispatchEvent(new Event('scroll'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('reopening on a second anchor swaps the payload and the focus-return target', async () => {
    const el = await open(payload({ name: 'First' }));
    const second = document.createElement('button');
    document.body.appendChild(second);
    const next = payload({ name: 'Second', dims: [1, 2], nodeId: 'n2', cells: ['9', '8'] });
    el.show(second, next);
    await frame();
    await el.deliver(cells(next));
    await el.updateComplete;
    expect(title(el)).toBe('Second — 1x2 double');
    expect(grid(el).matrix!.cells).toEqual(['9', '8']);
    docKey('Escape');
    await el.updateComplete;
    expect(document.activeElement).toBe(second);
    second.remove();
  });
});

describe('the cells are fetched when the panel opens, not carried by the row', () => {
  // The reason the whole split exists: a 1000x1000 entry is 4 MB of cell strings
  // and ~240 ms to produce. Stamped onto a row that is merely VISIBLE, that cost
  // is paid per row — and paid again on every re-sort, re-filter and repaint, for
  // a panel the user may never open. So a row carries the descriptor, show()
  // opens on the descriptor alone, and deliver() fills the panel in when the app
  // has the cells. Everything here is about the window in between.
  async function showOnly(d: MatrixDescriptor = descriptor()): Promise<DexVariableEditor> {
    const el = await mount();
    el.show(makeAnchor(), d);
    await frame();
    await el.updateComplete;
    return el;
  }

  it('takes the host’s own envelope, mirrored not re-invented', () => {
    // The wire's `matrixCells` and a source's MatrixPage are what an app has in
    // hand; deliver() takes either as it is. A compile error here is the only thing
    // that catches one of them renaming a field: at runtime a `cells` that arrived
    // under another name is just a panel that says it could not read a matrix it
    // read perfectly well.
    const fromHost: MatrixCellsMessage = {
      type: 'matrixCells',
      nodeId: 'n1',
      matrix: { name: 'A', className: 'double', dims: [1, 2], nodeId: 'n1', cells: ['1', '2'] },
    };
    const asComponent: MatrixCellsAnswer = fromHost;
    expect(asComponent.matrix!.cells).toEqual(['1', '2']);
    const refused: MatrixCellsAnswer = { type: 'matrixCells', nodeId: 'n1', message: 'nope' } as MatrixCellsMessage;
    expect(refused.message).toBe('nope');
    const page: MatrixCellsAnswer = { nodeId: 'n1', message: 'nope' } satisfies MatrixPage;
    expect(page.message).toBe('nope');
  });

  it('opens titled and waiting, with no grid and no empty table', async () => {
    // The title comes from the descriptor, so the panel names the right variable
    // before any cells exist. What must NOT appear is a grid: an empty bordered
    // table reads as a matrix that is genuinely empty, which is a wrong answer
    // rather than a pending one — and on the 1000x1000 entry this feature was
    // built for, building one from a cell-less descriptor lays out a million blank
    // boxes. (The dims here are small on purpose: a regression should fail this
    // assertion, not exhaust the heap and take the readable failure with it.)
    const el = await showOnly(descriptor({ name: 'Kp', dims: [8, 5] }));
    expect(el.hasAttribute('open')).toBe(true);
    expect(title(el)).toBe('Kp — 8x5 double');
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
    const status = el.shadowRoot!.querySelector('.status')!;
    expect(status).not.toBeNull();
    // Announced, because for a big matrix the wait is long enough to notice.
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent!.trim()).toBe('Loading…');
  });

  it('shows the grid once the cells arrive, and drops the waiting line', async () => {
    const el = await showOnly();
    await el.deliver(cells(payload()));
    await el.updateComplete;
    expect(grid(el).matrix!.cells).toEqual(['1', '2', '3', '4']);
    expect(el.shadowRoot!.querySelector('.status')).toBeNull();
  });

  it('ignores an answer about a different node, which is what a late one is', async () => {
    // Open A, change your mind, open B: A's answer can still be in flight. Taking
    // it would put A's numbers under B's title — a confidently wrong table, the
    // one outcome worse than a slow one.
    const el = await showOnly(descriptor({ name: 'B', nodeId: 'n2' }));
    await el.deliver(cells(payload({ name: 'A', nodeId: 'n1' })));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
    expect(title(el)).toBe('B — 2x2 double');
    expect(el.shadowRoot!.querySelector('.status')!.textContent!.trim()).toBe('Loading…');
  });

  it('says why when the host could not read it, rather than waiting forever', async () => {
    // matrixCellsMessage's other branch. The glyph answers to the same gate as the
    // payload but cannot run it (see matrixPayload.ts), so a descriptor CAN exist
    // for a matrix whose cells will not lay out. The panel has to say so.
    const el = await showOnly();
    await el.deliver({ nodeId: 'n1', message: 'This value is gone.' });
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
    expect(el.shadowRoot!.querySelector('.status')!.textContent!.trim()).toBe('This value is gone.');
  });

  it('says it could not read the value when the answer has neither cells nor a reason', async () => {
    // A malformed answer must still not read as a wait that never ends.
    const el = await showOnly();
    await el.deliver({ nodeId: 'n1' });
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
    expect(el.shadowRoot!.querySelector('.status')!.textContent!.trim())
      .toBe('This value could not be read as a table.');
  });

  it('does not reopen itself when an answer arrives after it was closed', async () => {
    // A repaint closes the editor whenever new rows arrive, which can easily land
    // between the request and the answer. A panel that popped back up on its own,
    // over data that has since been replaced, would be a ghost.
    const el = await showOnly();
    el.close();
    await el.updateComplete;
    await el.deliver(cells(payload()));
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
  });

  it('neither repositions nor takes focus when it is closed while its answer renders', async () => {
    // deliver() waits for the grid to render before it measures and focuses. A
    // close inside that wait (the user pressed Escape, a repaint came) leaves no
    // panel to place and no grid to focus.
    const el = await showOnly();
    const reposition = vi.spyOn(el, 'reposition');
    const delivered = el.deliver(cells(payload()));
    el.close();
    await delivered;
    expect(reposition).not.toHaveBeenCalled();
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('goes back to waiting when it is reopened on another matrix', async () => {
    // One editor instance serves every opening. Without the reset, the second
    // opening would show the FIRST matrix's cells under the second one's title for
    // as long as the fetch takes.
    const el = await open(payload({ name: 'First' }));
    expect(grid(el).matrix!.cells).toEqual(['1', '2', '3', '4']);
    el.show(makeAnchor(), descriptor({ name: 'Second', nodeId: 'n2' }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dex-matrix-grid')).toBeNull();
    expect(title(el)).toBe('Second — 2x2 double');
    expect(el.shadowRoot!.querySelector('.status')!.textContent!.trim()).toBe('Loading…');
  });

  it('repositions after the cells arrive, because the panel just grew', async () => {
    // show() clamps a one-line "loading" box into the viewport. The grid that
    // replaces it is up to 640x320, so a panel that fitted while waiting can hang
    // off the bottom of the window once filled unless the arithmetic is re-run.
    const el = await showOnly();
    const spy = vi.spyOn(el, 'reposition');
    await el.deliver(cells(payload()));
    expect(spy).toHaveBeenCalled();
  });

  it('survives an answer that arrives before the opening frame', async () => {
    // The app can answer synchronously-fast; nothing orders its reply after the
    // frame show() queues. Both halves have to be able to run first.
    const el = await mount();
    el.show(makeAnchor(), descriptor());
    await el.deliver(cells(payload()));
    await frame();
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(true);
    expect(grid(el).matrix!.cells).toEqual(['1', '2', '3', '4']);
  });

  it('never throws on a malformed answer, whatever the host sent', async () => {
    const el = await showOnly();
    for (const bad of [undefined, null, {}, { nodeId: '' }, { matrix: payload() }, { nodeId: 'n1' }, { nodeId: 'n1', matrix: null }]) {
      await expect(el.deliver(bad as any)).resolves.toBeUndefined();
    }
    expect(el.hasAttribute('open')).toBe(true);
  });

  it('takes no answer before it has been shown', async () => {
    const el = await mount();
    await el.deliver(cells(payload()));
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot!.querySelector('.panel')).toBeNull();
  });
});

describe('focus goes into the grid so the arrow keys work immediately', () => {
  it('focuses the first cell when the cells arrive', async () => {
    // Deliberately on DELIVERY, not on show(): at show() time there is no grid to
    // focus, and a keyboard user who pressed Enter on the glyph must still end up
    // on cell (1,1) without a second keystroke.
    const el = await open();
    expect(grid(el).shadowRoot!.activeElement!.textContent!.trim()).toBe('1');
  });

  it('leaves Escape working from inside the grid', async () => {
    // The grid deliberately does not handle Escape; this is the other half of
    // that contract, asserted from the shell's side.
    const el = await open();
    grid(el).shadowRoot!.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }),
    );
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });
});

describe('positioning is below-left of the anchor, clamped into the viewport', () => {
  const viewport = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  };

  // The panel's own size has to be stubbed too — happy-dom reports 0x0.
  function stubPanel(el: DexVariableEditor, width: number, height: number): void {
    const panel = el.shadowRoot!.querySelector('.panel') as HTMLElement;
    const r = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
    panel.getBoundingClientRect = () => ({ ...r, toJSON: () => r }) as DOMRect;
  }

  async function shownAt(rect: Partial<DOMRect>, width: number, height: number): Promise<DexVariableEditor> {
    const el = await mount();
    el.show(makeAnchor(rect), payload());
    await el.updateComplete;
    stubPanel(el, width, height);
    el.reposition();
    return el;
  }

  it('sits 4px below the anchor, left edges aligned', async () => {
    viewport(1000, 800);
    const el = await shownAt({ left: 100, right: 116, top: 200, bottom: 216, width: 16, height: 16 }, 200, 150);
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('220px');
  });

  it('pulls left when the panel would run off the right edge', async () => {
    viewport(400, 800);
    const el = await shownAt({ left: 350, right: 366, top: 100, bottom: 116, width: 16, height: 16 }, 200, 150);
    expect(el.style.left).toBe('192px');   // 400 - 200 - 8
    expect(el.style.top).toBe('120px');
  });

  it('flips above the anchor when there is no room below', async () => {
    viewport(1000, 300);
    const el = await shownAt({ left: 10, right: 26, top: 250, bottom: 266, width: 16, height: 16 }, 200, 150);
    expect(el.style.top).toBe('96px');     // 250 - 150 - 4
    expect(el.style.left).toBe('10px');
  });

  it('never positions off the top-left, even with no room anywhere', async () => {
    viewport(120, 100);
    const el = await shownAt({ left: 4, right: 20, top: 4, bottom: 20, width: 16, height: 16 }, 400, 300);
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('places itself on the opening frame, once the panel has been laid out', async () => {
    viewport(1000, 800);
    const el = await mount();
    el.show(makeAnchor({ left: 30, right: 46, top: 40, bottom: 56, width: 16, height: 16 }), payload());
    expect(el.style.left).toBe('');
    await frame();
    expect(el.style.left).toBe('30px');
    expect(el.style.top).toBe('60px');
  });

  it('is a no-op when there is nothing on screen to position', async () => {
    // reposition() is public and there is no guarantee the panel exists when it is
    // called: a frame queued by show() can land after a close, and the panel only
    // exists while open. Measuring a panel or an anchor that is not there throws
    // inside whichever handler made the call — for the queued frame, that is an
    // unhandled error with no stack the user could act on.
    const el = await mount();
    expect(() => el.reposition()).not.toThrow();
    expect(el.style.left).toBe('');
    // Same again once it has been open and closed, which is the path that happens.
    el.show(makeAnchor(), payload());
    el.close();
    await el.updateComplete;
    expect(() => el.reposition()).not.toThrow();
    expect(el.style.left).toBe('');
  });

  it('closes on a scroll anywhere, rather than floating away from its anchor', async () => {
    const el = await open();
    window.dispatchEvent(new Event('scroll'));
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    // A scroll inside some nested scroller reaches it too: it listens in the capture phase.
    el.show(anchor!, payload());
    await frame();
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    scroller.dispatchEvent(new Event('scroll'));
    await el.updateComplete;
    expect(el.hasAttribute('open')).toBe(false);
    scroller.remove();
  });
});
