// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-explorer> as a drop target: table rows dragged onto an open file's row, or a section's, as
// the prototype's Workspace tree takes them. The Explorer decides nothing of it. On each dragover of
// a drag that carries table rows (application/dex-rows) it asks the app's `dropPredictor` about the
// row under the pointer, with the mode the keys held ask (a move; a copy with Option on macOS and
// Ctrl elsewhere, as a drag inside a table), and draws what it answers: an outline in the accent
// for a drop it takes, in the error colour for one it refuses, the answer's words as the row's
// tooltip, to a screen reader, and as the hint the dragged table's box at the pointer says (the
// browser shows no tooltip in a drag), and the cursor the drop would have; nothing for no answer. A drop
// the predictor still takes sends `dex-explorer-drop` with the row and the mode of the LAST
// dragover (the drop event's keys are unreliable on Chromium/macOS, as the table's comment says).
// Root, a heading, and a drag of anything else (files from the OS) are no drop target.
//
// happy-dom has no drag pipeline: events are dispatched with a stub DataTransfer, as
// treeTableDragDrop.test.ts does.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  defineExplorer,
  type DexExplorer,
  type ExplorerDropDetail,
  type ExplorerDropTarget,
  type ExplorerDropVerdict,
  type ExplorerFile,
} from '../src/widgets/app-shell/dex-explorer.js';

beforeAll(() => defineExplorer());
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const DD: ExplorerFile = {
  id: 'file:///w/dd.sldd',
  label: 'dd.sldd',
  group: 'sldd',
  sections: [
    { id: 'section:design', label: 'Design Data' },
    { id: 'section:config', label: 'Configurations' },
  ],
};
const MAT: ExplorerFile = { id: 'file:///w/v.mat', label: 'v.mat', group: 'mat', sections: [] };

type Predictor = (target: ExplorerDropTarget, mode: 'copy' | 'move') => ExplorerDropVerdict | null;

async function explorer(predict: Predictor | null): Promise<DexExplorer> {
  const el = document.createElement('dex-explorer');
  el.files = [DD, MAT];
  el.dropPredictor = predict;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const rows = (el: DexExplorer): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
const rowOf = (el: DexExplorer, label: string): HTMLElement => rows(el).find((r) => r.querySelector('.label')?.textContent === label)!;
const announced = (el: DexExplorer): string => el.shadowRoot!.querySelector('[role="status"]')?.textContent?.trim() ?? '';
const cue = (row: HTMLElement): string => (row.classList.contains('drop-allowed') ? 'allowed' : row.classList.contains('drop-refused') ? 'refused' : '');

function stubTransfer(types: string[]) {
  return { dropEffect: 'none', effectAllowed: 'copyMove', types, getData: () => '', setData: () => {} };
}

type Keys = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
function fire(target: EventTarget, type: string, keys: Keys = {}, types = ['application/dex-rows']) {
  const dataTransfer = stubTransfer(types);
  const ev = new Event(type, { bubbles: true, cancelable: true, composed: true }) as any;
  Object.assign(ev, { dataTransfer, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, clientX: 10, clientY: 10, relatedTarget: null }, keys);
  target.dispatchEvent(ev);
  return { ev: ev as DragEvent, dataTransfer };
}

async function over(el: DexExplorer, label: string, keys: Keys = {}) {
  const fired = fire(rowOf(el, label), 'dragover', keys);
  await el.updateComplete;
  return fired;
}

const onMac = (mac: boolean) => vi.spyOn(navigator, 'platform', 'get').mockReturnValue(mac ? 'MacIntel' : 'Win32');

const ALLOW: ExplorerDropVerdict = { canDrop: true, tooltip: 'Move Simulink Parameter to Design Data in dd.sldd' };
const REFUSE: ExplorerDropVerdict = { canDrop: false, tooltip: 'Simulink Parameter cannot be in Configurations' };

describe('a row drag over a file or a section', () => {
  it("asks the predictor about the file's row, and outlines a drop it takes, saying what it does", async () => {
    const asked: [ExplorerDropTarget, string][] = [];
    const el = await explorer((target, mode) => (asked.push([target, mode]), ALLOW));
    const { ev, dataTransfer } = await over(el, 'dd.sldd');
    expect(asked).toEqual([[{ fileId: DD.id }, 'move']]);
    expect(ev.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('move');
    const row = rowOf(el, 'dd.sldd');
    expect(cue(row)).toBe('allowed');
    expect(row.title).toBe(ALLOW.tooltip);
    expect(announced(el)).toBe(ALLOW.tooltip);
  });

  it("asks about a section's row with its section, once its file is open", async () => {
    const asked: ExplorerDropTarget[] = [];
    const el = await explorer((target) => (asked.push(target), ALLOW));
    el.selected = { fileId: DD.id, sectionId: 'section:config' };
    await el.updateComplete;
    await over(el, 'Configurations');
    expect(asked).toEqual([{ fileId: DD.id, sectionId: 'section:config' }]);
  });

  it.each([
    [false, { ctrlKey: true }, 'copy'],
    [false, { altKey: true }, 'move'],
    [true, { altKey: true }, 'copy'],
    [true, { ctrlKey: true }, 'move'],
    [true, { metaKey: true }, 'move'],
  ])('mac %s, keys %o: asks for a %s, as a drag in a table does', async (mac, keys, mode) => {
    onMac(mac);
    const modes: string[] = [];
    const el = await explorer((_t, m) => (modes.push(m), ALLOW));
    const { dataTransfer } = await over(el, 'v.mat', keys);
    expect(modes).toEqual([mode]);
    expect(dataTransfer.dropEffect).toBe(mode);
  });

  it("takes the effect the predictor says a drop has, over the keys': rows that can only be copied", async () => {
    const el = await explorer(() => ({ canDrop: true, effect: 'copy', tooltip: 'Copy x to v.mat' }));
    const { dataTransfer } = await over(el, 'v.mat');
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('outlines a drop it refuses in the error colour, says why, and takes no drop', async () => {
    const el = await explorer(() => REFUSE);
    const { ev, dataTransfer } = await over(el, 'v.mat');
    expect(ev.defaultPrevented).toBe(false);
    expect(dataTransfer.dropEffect).toBe('none');
    expect(cue(rowOf(el, 'v.mat'))).toBe('refused');
    expect(rowOf(el, 'v.mat').title).toBe(REFUSE.tooltip);
    expect(announced(el)).toBe(REFUSE.tooltip);
  });

  it('draws nothing, and takes no drop, where the predictor has no answer (a no-op, a file that takes none)', async () => {
    const el = await explorer(() => null);
    const { ev, dataTransfer } = await over(el, 'v.mat');
    expect(ev.defaultPrevented).toBe(false);
    expect(dataTransfer.dropEffect).toBe('none');
    expect(rows(el).map(cue)).toEqual(['', '', '']);
    expect(announced(el)).toBe('');
  });

  it("marks the row with the words for the dragged table's box to say, the browser showing no tooltip in a drag", async () => {
    let verdict = ALLOW;
    const el = await explorer(() => verdict);
    await over(el, 'v.mat');
    const row = rowOf(el, 'v.mat');
    expect(row.dataset.dropHint).toBe(ALLOW.tooltip);
    expect(row.hasAttribute('data-drop-refused')).toBe(false);
    verdict = REFUSE;
    await over(el, 'v.mat');
    expect(row.dataset.dropHint).toBe(REFUSE.tooltip);
    expect(row.hasAttribute('data-drop-refused')).toBe(true);
    fire(row, 'dragleave');
    await el.updateComplete;
    expect(row.hasAttribute('data-drop-hint')).toBe(false);
    expect(row.hasAttribute('data-drop-refused')).toBe(false);
    expect(rows(el).some((r) => r.hasAttribute('data-drop-hint'))).toBe(false);
  });

  it('keeps the title a file row has of its own (its path) under the cue, and gives it back after', async () => {
    const el = document.createElement('dex-explorer');
    el.files = [{ ...MAT, title: '/w/v.mat' }];
    el.dropPredictor = () => REFUSE;
    document.body.append(el);
    await el.updateComplete;
    await over(el, 'v.mat');
    expect(rowOf(el, 'v.mat').title).toBe(REFUSE.tooltip);
    fire(rowOf(el, 'v.mat'), 'dragleave');
    await el.updateComplete;
    expect(rowOf(el, 'v.mat').title).toBe('/w/v.mat');
  });
});

describe('what is no drop target', () => {
  it('Root, a drag of anything but table rows, and an explorer with no predictor', async () => {
    const predict = vi.fn<Predictor>(() => ALLOW);
    const el = await explorer(predict);
    expect(fire(rowOf(el, 'Root'), 'dragover').ev.defaultPrevented).toBe(false);
    expect(fire(rowOf(el, 'v.mat'), 'dragover', {}, ['Files']).ev.defaultPrevented).toBe(false);
    expect(predict).not.toHaveBeenCalled();
    const bare = await explorer(null);
    expect(fire(rowOf(bare, 'v.mat'), 'dragover').ev.defaultPrevented).toBe(false);
    await bare.updateComplete;
    expect(rows(bare).map(cue)).toEqual(['', '', '']);
  });
});

describe('the cue moves with the pointer, and goes', () => {
  it('to the next row the drag is over, off a row it leaves, and when the drag ends anywhere', async () => {
    const el = await explorer((target) => (target.fileId === MAT.id ? REFUSE : ALLOW));
    await over(el, 'dd.sldd');
    await over(el, 'v.mat');
    expect(rows(el).map(cue)).toEqual(['', '', 'refused']);
    fire(rowOf(el, 'v.mat'), 'dragleave');
    await el.updateComplete;
    expect(rows(el).map(cue)).toEqual(['', '', '']);
    expect(announced(el)).toBe('');
    await over(el, 'dd.sldd');
    // The drag ended elsewhere: the source's dragend reaches the window.
    fire(document.body, 'dragend');
    await el.updateComplete;
    expect(rows(el).map(cue)).toEqual(['', '', '']);
  });

  it("stays while the pointer moves between a row's own parts", async () => {
    const el = await explorer(() => ALLOW);
    await over(el, 'dd.sldd');
    const row = rowOf(el, 'dd.sldd');
    const leave = new Event('dragleave', { bubbles: true, composed: true }) as any;
    leave.relatedTarget = row.querySelector('.label');
    leave.dataTransfer = stubTransfer(['application/dex-rows']);
    row.dispatchEvent(leave);
    await el.updateComplete;
    expect(cue(row)).toBe('allowed');
  });
});

describe('the drop', () => {
  it("sends dex-explorer-drop for the row, in the mode of the last dragover, and clears the cue", async () => {
    const el = await explorer(() => ALLOW);
    const drops: ExplorerDropDetail[] = [];
    el.addEventListener('dex-explorer-drop', (e) => drops.push(e.detail));
    el.selected = { fileId: DD.id, sectionId: 'section:design' };
    await el.updateComplete;
    await over(el, 'Design Data', { ctrlKey: true });
    // Chromium on macOS says the key is up by the time of the drop.
    const { ev } = fire(rowOf(el, 'Design Data'), 'drop');
    await el.updateComplete;
    expect(ev.defaultPrevented).toBe(true);
    expect(drops).toEqual([{ fileId: DD.id, sectionId: 'section:design', mode: 'copy' }]);
    expect(rows(el).map(cue).filter(Boolean)).toEqual([]);
    expect(announced(el)).toBe('');
  });

  it("carries the predictor's effect, and a file's drop names no section", async () => {
    const el = await explorer(() => ({ canDrop: true, effect: 'copy', tooltip: 'Copy x to v.mat' }));
    const drops: ExplorerDropDetail[] = [];
    el.addEventListener('dex-explorer-drop', (e) => drops.push(e.detail));
    await over(el, 'v.mat');
    fire(rowOf(el, 'v.mat'), 'drop');
    expect(drops).toEqual([{ fileId: MAT.id, mode: 'copy' }]);
  });

  it('sends nothing for a drop the predictor refuses, or has no answer for, by the time it lands', async () => {
    let verdict: ExplorerDropVerdict | null = ALLOW;
    const el = await explorer(() => verdict);
    const drops: unknown[] = [];
    el.addEventListener('dex-explorer-drop', (e) => drops.push(e.detail));
    await over(el, 'v.mat');
    verdict = REFUSE;
    fire(rowOf(el, 'v.mat'), 'drop');
    verdict = null;
    await over(el, 'v.mat');
    fire(rowOf(el, 'v.mat'), 'drop');
    expect(drops).toEqual([]);
  });

  it('bubbles out of the shadow root, composed, so the app hears it on the page', async () => {
    const el = await explorer(() => ALLOW);
    const heard: unknown[] = [];
    document.addEventListener('dex-explorer-drop', (e) => heard.push(e.detail), { once: true });
    await over(el, 'v.mat');
    fire(rowOf(el, 'v.mat'), 'drop');
    expect(heard).toHaveLength(1);
  });
});

describe('the cue, drawn', () => {
  it("outlines in the table's drop colours, and draws a forced-colours outline of its own", async () => {
    const el = await explorer(null);
    const css = (el.constructor as typeof DexExplorer).styles
      ? [(el.constructor as any).styles].flat(Infinity).map((s: any) => s.cssText).join('\n').replace(/\s+/g, ' ')
      : '';
    expect(css).toContain('.row.drop-allowed { box-shadow: inset 0 0 0 2px var(--dex-color-accent, #0078d4);');
    expect(css).toContain('.row.drop-refused { box-shadow: inset 0 0 0 2px var(--dex-color-error, #d32f2f);');
    expect(css).toMatch(/@media \(forced-colors: active\) \{.*\.row\.drop-allowed \{ outline: 2px solid Highlight;/);
  });
});
