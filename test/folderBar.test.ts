// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-folder-bar>: the Folder view's top row, ↑ beside the workspace folder's path
// ("Users › delite › complex_dataflow"), then ⟳ and ⋯. It draws the segments it is given
// and asks for everything: going up, going to a segment, reading the folder again and showing its
// menu are each a request (`dex-folder-up`, `dex-folder-go`, `dex-folder-refresh`,
// `dex-folder-menu`), since re-rooting is the host's to do and may fail, and the bar never moves on
// its own. So what is pinned here is the drawing (the segments in order, the current one, the
// labels Read Again and Pick Again), which request each press sends, and that a press the app has
// ruled out (↑ with nowhere to go, anything but ⋯ while a re-root is under way) sends none: a
// second re-root started over the first would leave the shell showing whichever answered last.
//
// happy-dom lays nothing out, so a path too long for the bar is a path box whose clientWidth and
// scrollWidth are stubbed: the scroll width the items left showing would take, as doc-tabs'
// crowded row is stubbed in docTabs.test.ts.
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  DexFolderBar,
  defineFolderBar,
  type FolderBarEventMap,
  type FolderSegment,
} from '../src/widgets/app-shell/dex-folder-bar.js';
import { highContrastStyles } from '../src/widgets/shared/high-contrast.styles.js';
import { THEME_SETS } from './tools/cssTokens.js';

beforeAll(() => defineFolderBar());
afterEach(() => document.body.replaceChildren());

const PATH: FolderSegment[] = [
  { label: '/', path: '/' },
  { label: 'Users', path: '/Users' },
  { label: 'delite', path: '/Users/delite' },
  { label: 'complex_dataflow', path: '/Users/delite/complex_dataflow' },
];

// Eight folders deep: more than a side bar has room for.
const DEEP: FolderSegment[] = ['/', 'Users', 'me', 'work', 'projects', 'plant', 'models', 'controllers'].map((label, i, all) => ({
  label,
  path: i === 0 ? '/' : `/${all.slice(1, i + 1).join('/')}`,
}));

type Props = Partial<Pick<DexFolderBar, 'segments' | 'canUp' | 'refresh' | 'busy' | 'mono'>>;

async function bar(props: Props = {}): Promise<DexFolderBar> {
  const el = document.createElement('dex-folder-bar');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const root = (el: DexFolderBar): ShadowRoot => el.shadowRoot!;
const items = (el: DexFolderBar): HTMLLIElement[] => [...root(el).querySelectorAll<HTMLLIElement>('.path > li.place')];
const shown = (el: DexFolderBar): HTMLLIElement[] => items(el).filter((li) => !li.hidden);
const labels = (el: DexFolderBar): string[] => shown(el).map((li) => li.querySelector('.label')!.textContent!);
const segmentButtons = (el: DexFolderBar): HTMLButtonElement[] => [...root(el).querySelectorAll<HTMLButtonElement>('button.segment')];
const current = (el: DexFolderBar): HTMLElement | null => root(el).querySelector<HTMLElement>('[aria-current="location"]');
const separators = (el: DexFolderBar): HTMLElement[] => [...root(el).querySelectorAll<HTMLElement>('.path > li.place .separator')];
const named = (el: DexFolderBar, name: string): HTMLButtonElement | null =>
  root(el).querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const up = (el: DexFolderBar): HTMLButtonElement => named(el, 'Up One Level')!;
const actions = (el: DexFolderBar): HTMLButtonElement => named(el, 'Folder Actions')!;
const moreItem = (el: DexFolderBar): HTMLLIElement => root(el).querySelector<HTMLLIElement>('.path > li.more')!;
const moreButton = (el: DexFolderBar): HTMLButtonElement => moreItem(el).querySelector<HTMLButtonElement>('button')!;
const pathBox = (el: DexFolderBar): HTMLElement => root(el).querySelector<HTMLElement>('.path')!;

/** Every detail of `type` the bar sends from now on, heard on the document: the events must leave the shadow root. */
function heard<K extends keyof FolderBarEventMap>(type: K): FolderBarEventMap[K]['detail'][] {
  const seen: FolderBarEventMap[K]['detail'][] = [];
  const listener = (e: FolderBarEventMap[K]): void => {
    seen.push(e.detail);
  };
  document.addEventListener(type, listener);
  onTestFinished(() => document.removeEventListener(type, listener));
  return seen;
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

// A box `room` px wide, holding each item still drawn at its own width: a segment 50 px, the …
// item 20, and 10 more for the › before either, where one is drawn (the … leading the path has
// none). Measured as the styles stand at each read, so an item drawn otherwise than it was
// measured shows. Redrawn, so the bar measures again.
async function narrow(el: DexFolderBar, room: number): Promise<void> {
  const box = pathBox(el);
  const width = (li: HTMLElement): number => {
    const separator = li.querySelector('.separator');
    const drawn = separator !== null && getComputedStyle(separator).display !== 'none';
    return (li.classList.contains('more') ? 20 : 50) + (drawn ? 10 : 0);
  };
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: room });
  Object.defineProperty(box, 'scrollWidth', {
    configurable: true,
    get: () => [...box.children].filter((li) => !(li as HTMLElement).hidden).reduce((w, li) => w + width(li as HTMLElement), 0),
  });
  el.segments = [...el.segments];
  await el.updateComplete;
}

// The box resized to `room` px, as a ResizeObserver hears it: stubbed by observing(), which hands
// back the callbacks the bars made.
function observing(): (() => void)[] {
  const observers: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  onTestFinished(() => vi.unstubAllGlobals());
  return observers;
}

function resized(el: DexFolderBar, observers: (() => void)[], room: number): void {
  Object.defineProperty(pathBox(el), 'clientWidth', { configurable: true, value: room });
  for (const callback of observers) callback();
}

const rect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;

describe('the path', () => {
  it('draws the segments in order, a › between each two, hidden from a screen reader', async () => {
    const el = await bar({ segments: PATH });
    expect(labels(el)).toEqual(['/', 'Users', 'delite', 'complex_dataflow']);
    expect(separators(el).map((s) => s.textContent)).toEqual(['›', '›', '›']);
    for (const s of separators(el)) expect(s.getAttribute('aria-hidden')).toBe('true');
    // Between, and only between: none before the first segment.
    expect(items(el).map((li) => li.querySelector('.separator') !== null)).toEqual([false, true, true, true]);
  });

  it('marks the last segment as the current folder, and draws it as no button', async () => {
    // The folder shown is where the user is: pressing it would re-root to where they are already.
    const el = await bar({ segments: PATH });
    expect(current(el)!.textContent!.trim()).toBe('complex_dataflow');
    expect(current(el)!.localName).not.toBe('button');
    expect(root(el).querySelectorAll('[aria-current]').length).toBe(1);
    expect(segmentButtons(el).map((b) => b.querySelector('.label')!.textContent)).toEqual(['/', 'Users', 'delite']);
    for (const b of segmentButtons(el)) expect(b.type).toBe('button');
  });

  it("gives each segment its folder's path as a tooltip, the current one too", async () => {
    const el = await bar({ segments: PATH });
    expect(segmentButtons(el).map((b) => b.title)).toEqual(['/', '/Users', '/Users/delite']);
    expect(current(el)!.title).toBe('/Users/delite/complex_dataflow');
  });

  it('is a navigation landmark called Folder Path, the segments a list in it', async () => {
    const el = await bar({ segments: PATH });
    const nav = root(el).querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Folder Path');
    expect(nav.querySelectorAll('ol.path > li.place').length).toBe(4);
  });

  it('draws a label as text, never as markup', async () => {
    // A label is a folder's name off the disk, so it must not be able to put nodes into the bar.
    const el = await bar({ segments: [{ label: '<img src=x onerror=alert(1)>', path: '/x' }] });
    expect(root(el).querySelectorAll('.path img').length).toBe(0);
    expect(labels(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it('draws one folder alone as the current one, and none as an empty box with the buttons still', async () => {
    const el = await bar({ segments: [PATH[0]!] });
    expect(labels(el)).toEqual(['/']);
    expect(separators(el)).toEqual([]);
    expect(current(el)!.textContent!.trim()).toBe('/');
    el.segments = [];
    await el.updateComplete;
    expect(items(el)).toEqual([]);
    expect(pathBox(el)).not.toBeNull();
    for (const name of ['Up One Level', 'Read Again', 'Folder Actions']) expect(named(el, name), name).not.toBeNull();
  });

  it('draws the new path when the segments are replaced', async () => {
    const el = await bar({ segments: PATH });
    el.segments = PATH.slice(0, 2);
    await el.updateComplete;
    expect(labels(el)).toEqual(['/', 'Users']);
    expect(current(el)!.textContent!.trim()).toBe('Users');
  });
});

describe('a press on a segment', () => {
  it("asks to go to that segment's folder, by its path", async () => {
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-go');
    segmentButtons(el)[0]!.click();
    segmentButtons(el)[2]!.click();
    expect(seen).toEqual([{ path: '/' }, { path: '/Users/delite' }]);
  });

  it('sends nothing from the current folder', async () => {
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-go');
    current(el)!.click();
    expect(seen).toEqual([]);
  });

  it('sends an event that bubbles out of the shadow root', async () => {
    const el = await bar({ segments: PATH });
    let event: CustomEvent | null = null;
    el.addEventListener('dex-folder-go', (e) => (event = e));
    segmentButtons(el)[1]!.click();
    expect(event!.bubbles).toBe(true);
    expect(event!.composed).toBe(true);
    expect(event!.detail).toEqual({ path: '/Users' });
  });

  it('puts the keyboard on the current folder once the bar shows where it went', async () => {
    // The segment pressed becomes the current folder, which is no button: its button goes, and the
    // focus would fall to the page's body. It goes to where the user now is instead.
    const el = await bar({ segments: PATH });
    segmentButtons(el)[1]!.focus();
    segmentButtons(el)[1]!.click();
    el.segments = PATH.slice(0, 2);
    await el.updateComplete;
    expect(root(el).activeElement).toBe(current(el));
    expect(current(el)!.tabIndex).toBe(-1);
  });

  it('leaves the keyboard where it is when the path changes with it elsewhere', async () => {
    const el = await bar({ segments: PATH, canUp: true });
    up(el).focus();
    el.segments = PATH.slice(0, 3);
    await el.updateComplete;
    expect(root(el).activeElement).toBe(up(el));
  });
});

describe('↑', () => {
  it('is a button named Up One Level, its icon at 16px, its chord in its tooltip', async () => {
    const el = await bar();
    const icon = up(el).querySelector('dex-icon')!;
    expect(icon.iconId).toBe('arrowNavigationNorthUI');
    expect(icon.size).toBe(16);
    expect(up(el).type).toBe('button');
    expect(up(el).title).toMatch(/^Up One Level \((⌥↑|Alt\+Up)\)$/);
  });

  it('is disabled until the app says there is a parent, and sends nothing then', async () => {
    // aria-disabled, as the toolbar's: a disabled <button> leaves the tab order, and the keyboard
    // would lose ↑ exactly at the top of the folders it may go to.
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-up');
    expect(up(el).getAttribute('aria-disabled')).toBe('true');
    expect(up(el).disabled).toBe(false);
    up(el).click();
    expect(seen).toEqual([]);
    el.canUp = true;
    await el.updateComplete;
    expect(up(el).getAttribute('aria-disabled')).toBe('false');
    up(el).click();
    expect(seen).toEqual([null]);
  });

  it('sends nothing once the app has turned it off, before it is drawn so', async () => {
    // A script's click() in the same task as the change lands before the redraw.
    const el = await bar({ segments: PATH, canUp: true });
    const seen = heard('dex-folder-up');
    el.canUp = false;
    up(el).click();
    expect(seen).toEqual([]);
  });

  it('takes can-up as an attribute', async () => {
    document.body.innerHTML = '<dex-folder-bar can-up></dex-folder-bar>';
    const el = document.querySelector('dex-folder-bar')!;
    await el.updateComplete;
    expect(el.canUp).toBe(true);
    expect(up(el).getAttribute('aria-disabled')).toBe('false');
  });
});

describe('Alt+↑', () => {
  it('goes up from anywhere in the bar, and is spent there', async () => {
    const el = await bar({ segments: PATH, canUp: true });
    const seen = heard('dex-folder-up');
    const pressed = key(segmentButtons(el)[1]!, 'ArrowUp', { altKey: true });
    expect(seen).toEqual([null]);
    // Spent, so the shell's own Alt+↑ (Up in the location bar, heard on the window) leaves it alone.
    expect(pressed.defaultPrevented).toBe(true);
    key(actions(el), 'ArrowUp', { altKey: true });
    expect(seen).toEqual([null, null]);
  });

  it('is spent and sends nothing where ↑ goes nowhere, or while the bar is busy', async () => {
    // Left unspent it would move the location bar instead: not what a press in the folder's bar means.
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-up');
    expect(key(up(el), 'ArrowUp', { altKey: true }).defaultPrevented).toBe(true);
    el.canUp = true;
    el.busy = true;
    await el.updateComplete;
    expect(key(up(el), 'ArrowUp', { altKey: true }).defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
  });

  it("goes up once for a held key: a re-root is a deliberate act, and its repeats are not", async () => {
    const el = await bar({ segments: PATH, canUp: true });
    const seen = heard('dex-folder-up');
    key(up(el), 'ArrowUp', { altKey: true });
    expect(key(up(el), 'ArrowUp', { altKey: true, repeat: true }).defaultPrevented).toBe(true);
    expect(seen).toEqual([null]);
  });

  it('leaves every other key alone: ↑ alone, and ↑ with another modifier, are not its chord', async () => {
    const el = await bar({ segments: PATH, canUp: true });
    const seen = heard('dex-folder-up');
    expect(key(up(el), 'ArrowUp').defaultPrevented).toBe(false);
    expect(key(up(el), 'ArrowUp', { altKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(key(up(el), 'ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('⟳', () => {
  it('is Read Again by default, and asks to read the folder again', async () => {
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-refresh');
    const button = named(el, 'Read Again')!;
    expect(button.title).toBe('Read Again');
    expect(button.querySelector('dex-icon')!.iconId).toBe('refresh');
    button.click();
    expect(seen).toEqual([null]);
  });

  it("is Pick Again for a folder the host can only ask for again, and sends the same request", async () => {
    // A browser's folder picked through a file input is a snapshot: reading it again is asking the
    // user to pick it again, which is the app's to do.
    const el = await bar({ segments: PATH, refresh: 'pick' });
    const seen = heard('dex-folder-refresh');
    expect(named(el, 'Read Again')).toBeNull();
    named(el, 'Pick Again')!.click();
    expect(seen).toEqual([null]);
  });

  it("is not drawn for 'none'", async () => {
    const el = await bar({ segments: PATH, refresh: 'none' });
    expect(named(el, 'Read Again')).toBeNull();
    expect(named(el, 'Pick Again')).toBeNull();
    expect(root(el).querySelectorAll('dex-icon[icon-id="refresh"], button.refresh').length).toBe(0);
  });

  it('takes refresh as an attribute', async () => {
    document.body.innerHTML = '<dex-folder-bar refresh="pick"></dex-folder-bar>';
    const el = document.querySelector('dex-folder-bar')!;
    await el.updateComplete;
    expect(el.refresh).toBe('pick');
    expect(named(el, 'Pick Again')).not.toBeNull();
  });
});

describe('⋯', () => {
  it("is Folder Actions, a menu's button, and asks for the menu at its own box", async () => {
    const el = await bar({ segments: PATH });
    const seen = heard('dex-folder-menu');
    const button = actions(el);
    expect(button.title).toBe('Folder Actions');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.querySelector('dex-icon')!.iconId).toBe('meatballMenuUI');
    button.getBoundingClientRect = () => rect(200, 4, 24, 24);
    button.click();
    // No segments: the menu is the folder's actions, not the folders a long path hid.
    expect(seen).toEqual([{ anchor: { x: 200, y: 4, width: 24, height: 24 } }]);
  });
});

describe('busy', () => {
  it('disables ↑, the segments and ⟳, and says so, leaving ⋯ to be used', async () => {
    // Open Folder… in ⋯ may still be wanted while a read is slow; a second re-root may not.
    const el = await bar({ segments: PATH, canUp: true, busy: true });
    const go = heard('dex-folder-go');
    const ups = heard('dex-folder-up');
    const refresh = heard('dex-folder-refresh');
    const menu = heard('dex-folder-menu');
    expect(root(el).querySelector('nav')!.getAttribute('aria-busy')).toBe('true');
    for (const b of [up(el), named(el, 'Read Again')!, ...segmentButtons(el)]) {
      expect(b.getAttribute('aria-disabled'), b.title).toBe('true');
      expect(getComputedStyle(b.firstElementChild!).opacity, b.title).toBe('0.35');
    }
    expect(actions(el).getAttribute('aria-disabled')).toBe('false');
    up(el).click();
    segmentButtons(el)[0]!.click();
    named(el, 'Read Again')!.click();
    actions(el).click();
    expect([go, ups, refresh]).toEqual([[], [], []]);
    expect(menu.length).toBe(1);
  });

  it('gives them back when it is over', async () => {
    const el = await bar({ segments: PATH, canUp: true, busy: true });
    el.busy = false;
    await el.updateComplete;
    expect(root(el).querySelector('nav')!.getAttribute('aria-busy')).toBe('false');
    for (const b of [up(el), named(el, 'Read Again')!, ...segmentButtons(el)]) expect(b.getAttribute('aria-disabled'), b.title).toBe('false');
    const seen = heard('dex-folder-go');
    segmentButtons(el)[0]!.click();
    expect(seen).toEqual([{ path: '/' }]);
  });

  it('takes busy as an attribute', async () => {
    document.body.innerHTML = '<dex-folder-bar busy></dex-folder-bar>';
    const el = document.querySelector('dex-folder-bar')!;
    await el.updateComplete;
    expect(el.busy).toBe(true);
  });
});

describe('a path too long for the bar', () => {
  it('draws every segment, and no …, while the path fits', async () => {
    const el = await bar({ segments: DEEP });
    await narrow(el, 1000);
    expect(labels(el)).toEqual(DEEP.map((s) => s.label));
    expect(moreItem(el).hidden).toBe(true);
  });

  it('folds the folders after the first into a … button, keeping as many of the last as fit', async () => {
    // 200 px: the first (50), the … and its › (30) and the last two with theirs (120); the five
    // between are folded.
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    expect(labels(el)).toEqual(['/', 'models', 'controllers']);
    expect(moreItem(el).hidden).toBe(false);
    // In the path's order: the first, the …, then the rest.
    const order = [...pathBox(el).children].filter((li) => !(li as HTMLElement).hidden).map((li) => li.querySelector('.label, button')!.textContent!.trim());
    expect(order).toEqual(['/', '…', 'models', 'controllers']);
    expect(moreButton(el).title).toBe('Users › me › work › projects › plant');
    expect(moreButton(el).getAttribute('aria-label')).toBe('More Folders');
    expect(moreButton(el).getAttribute('aria-haspopup')).toBe('menu');
    expect(current(el)!.textContent!.trim()).toBe('controllers');
  });

  it('asks for the menu of the folders it folded, at its own box', async () => {
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    const seen = heard('dex-folder-menu');
    moreButton(el).getBoundingClientRect = () => rect(40, 4, 20, 20);
    moreButton(el).click();
    expect(seen).toEqual([{ anchor: { x: 40, y: 4, width: 20, height: 20 }, segments: DEEP.slice(1, 6) }]);
  });

  it('folds the first one too where the last two do not fit beside it, and then clips the current one', async () => {
    // 90 px: the … leading (20) and the last (60) fit; the first beside them, with the …'s ›, would not.
    const el = await bar({ segments: DEEP });
    await narrow(el, 90);
    expect(labels(el)).toEqual(['controllers']);
    // The … comes first then, with no › before it.
    expect(getComputedStyle(moreItem(el).querySelector('.separator')!).display).toBe('none');
    expect(pathBox(el).classList.contains('squeezed')).toBe(false);
    const seen = heard('dex-folder-menu');
    moreButton(el).click();
    expect(seen[0]!.segments).toEqual(DEEP.slice(0, 7));
    // 60 px: not even that; the current folder's label gives way, ending in an ellipsis.
    await narrow(el, 60);
    expect(labels(el)).toEqual(['controllers']);
    expect(pathBox(el).classList.contains('squeezed')).toBe(true);
    const label = getComputedStyle(current(el)!.querySelector('.label')!);
    expect(label.textOverflow).toBe('ellipsis');
    expect(label.overflow).toBe('hidden');
  });

  it('unfolds again when the bar is widened, and folds as it is narrowed', async () => {
    const observers = observing();
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    expect(labels(el)).toEqual(['/', 'models', 'controllers']);
    expect(observers.length).toBe(1);
    resized(el, observers, 1000);
    expect(labels(el)).toEqual(DEEP.map((s) => s.label));
    expect(moreItem(el).hidden).toBe(true);
    resized(el, observers, 260);
    expect(labels(el)).toEqual(['/', 'plant', 'models', 'controllers']);
  });

  it('measures each fit from the whole path, not from how the last one drew the …', async () => {
    // Folded at 60 px, the … leads the path with no › before it. Widened to 135 px, one short of
    // the first folder (50), the … with its › (30) and the last (60): the first stays folded. Measured
    // with the last fit's …, which had no ›, the first seemed to fit, the › came back with it, and
    // the current folder was clipped beside it; each redraw then flipped between the two.
    const observers = observing();
    const el = await bar({ segments: DEEP });
    await narrow(el, 60);
    expect(labels(el)).toEqual(['controllers']);
    expect(pathBox(el).classList.contains('squeezed')).toBe(true);
    resized(el, observers, 135);
    expect(labels(el)).toEqual(['controllers']);
    expect(pathBox(el).classList.contains('squeezed')).toBe(false);
    expect(moreItem(el).classList.contains('first')).toBe(true);
    // And a redraw at that width draws the same.
    el.segments = [...el.segments];
    await el.updateComplete;
    expect(labels(el)).toEqual(['controllers']);
    expect(pathBox(el).classList.contains('squeezed')).toBe(false);
    // Wide enough for the first again: the … has its › back.
    resized(el, observers, 140);
    expect(labels(el)).toEqual(['/', 'controllers']);
    expect(moreItem(el).classList.contains('first')).toBe(false);
    expect(pathBox(el).classList.contains('squeezed')).toBe(false);
  });

  it('measures again when forced colours come or go, and when a web font has loaded', async () => {
    // Either redraws every label at another width with no resize of the box: forced colours border
    // each segment, and a font that loads late sets the labels in other glyphs.
    const queries: { query: string; listeners: Map<string, () => void> }[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      const listeners = new Map<string, () => void>();
      queries.push({ query, listeners });
      return {
        matches: false,
        media: query,
        addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
        removeEventListener: (type: string, listener: () => void) => listeners.get(type) === listener && listeners.delete(type),
      };
    });
    onTestFinished(() => vi.unstubAllGlobals());
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    onTestFinished(() => void delete (document as { fonts?: unknown }).fonts);
    const removed = vi.spyOn(fonts, 'removeEventListener');
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    expect(labels(el)).toEqual(['/', 'models', 'controllers']);
    const forced = queries.find((q) => q.query === '(forced-colors: active)')!;
    expect(forced.listeners.has('change')).toBe(true);
    Object.defineProperty(pathBox(el), 'clientWidth', { configurable: true, value: 1000 });
    forced.listeners.get('change')!();
    expect(labels(el)).toEqual(DEEP.map((s) => s.label));
    Object.defineProperty(pathBox(el), 'clientWidth', { configurable: true, value: 200 });
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(labels(el)).toEqual(['/', 'models', 'controllers']);
    // Taken out of the page, it listens to neither.
    el.remove();
    expect(forced.listeners.has('change')).toBe(false);
    expect(removed).toHaveBeenCalledWith('loadingdone', expect.any(Function));
  });

  it('gives the keyboard to the … when a resize folds the segment it was on', async () => {
    // A folded segment is not drawn, and the focus on it would fall to the page's body.
    const observers = observing();
    const el = await bar({ segments: DEEP });
    await narrow(el, 1000);
    const plant = segmentButtons(el).find((b) => b.textContent === 'plant')!;
    plant.focus();
    resized(el, observers, 200);
    expect(labels(el)).not.toContain('plant');
    expect(root(el).activeElement).toBe(moreButton(el));
    // A segment still drawn keeps it.
    resized(el, observers, 1000);
    const models = segmentButtons(el).find((b) => b.textContent === 'models')!;
    models.focus();
    resized(el, observers, 200);
    expect(root(el).activeElement).toBe(models);
  });

  it('gives the keyboard to the current folder when a resize unfolds the … it was on', async () => {
    const observers = observing();
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    moreButton(el).focus();
    resized(el, observers, 1000);
    expect(moreItem(el).hidden).toBe(true);
    expect(root(el).activeElement).toBe(current(el));
  });

  it('measures a new path afresh: a shorter one is drawn whole', async () => {
    const el = await bar({ segments: DEEP });
    await narrow(el, 200);
    el.segments = DEEP.slice(0, 3);
    await el.updateComplete;
    expect(labels(el)).toEqual(['/', 'Users', 'me']);
    expect(moreItem(el).hidden).toBe(true);
  });

  it('disables the … with the segments while busy', async () => {
    const el = await bar({ segments: DEEP, busy: true });
    await narrow(el, 200);
    const seen = heard('dex-folder-menu');
    expect(moreButton(el).getAttribute('aria-disabled')).toBe('true');
    // Greyed as the segments are: the … is drawn by an element, which the greying rule reaches.
    expect(getComputedStyle(moreButton(el).firstElementChild!).opacity).toBe('0.35');
    moreButton(el).click();
    expect(seen).toEqual([]);
  });

  it('keeps ↑, ⟳ and ⋯ whole and lets the path give way: the box may be narrower than its content', async () => {
    // happy-dom lays nothing out; the rules that make it so are what is pinned.
    const el = await bar({ segments: PATH });
    expect(parseFloat(getComputedStyle(pathBox(el)).minWidth)).toBe(0);
    for (const b of [up(el), named(el, 'Read Again')!, actions(el)]) expect(getComputedStyle(b).flexShrink, b.title).toBe('0');
  });
});

describe('the keyboard', () => {
  it('reaches every button with Tab, a disabled one included, and the current folder only from a press', async () => {
    const el = await bar({ segments: PATH, busy: true });
    for (const b of root(el).querySelectorAll<HTMLButtonElement>('button')) expect(b.tabIndex, b.title).toBe(0);
    expect(current(el)!.tabIndex).toBe(-1);
  });
});

describe('mono', () => {
  it('draws ↑, ⟳ and ⋯ in one colour with `mono`, and in their own colours by default', async () => {
    const icons = (el: DexFolderBar) => [...root(el).querySelectorAll('dex-icon')].map((i) => i.mono);
    const el = await bar({ segments: PATH });
    expect(el.mono).toBe(false);
    expect(icons(el)).toEqual([false, false, false]);
    el.mono = true;
    await el.updateComplete;
    expect(el.hasAttribute('mono')).toBe(true);
    expect(icons(el)).toEqual([true, true, true]);
    document.body.insertAdjacentHTML('beforeend', '<dex-folder-bar mono></dex-folder-bar>');
    const marked = document.body.lastElementChild as DexFolderBar;
    await marked.updateComplete;
    expect(icons(marked)).toEqual([true, true, true]);
  });
});

// WCAG's contrast ratio of two colours written #rgb or #rrggbb.
function contrast(a: string, b: string): number {
  const luminance = (colour: string): number => {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)![1]!;
    const parts = (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16));
    const [r, g, bl] = parts.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the look', () => {
  // The rules as text (happy-dom matches no :hover and no media query), comments taken out: a
  // declaration a comment quotes is no rule.
  const sheets = (): string[] =>
    [DexFolderBar.styles].flat(Infinity).map((s) => (s as { cssText: string }).cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' '));
  const rule = (selector: string): string => {
    for (const [, selectors, body] of sheets().join('\n').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectors!.split(',').some((one) => one.trim() === selector)) return body!;
    }
    throw new Error(`no rule for ${selector}`);
  };

  it("is the location bar's row: 32 px on the secondary background, its buttons filled a step darker", async () => {
    const el = await bar({ segments: PATH, canUp: true });
    expect(getComputedStyle(el).height).toBe('32px');
    expect(rule(':host')).toContain('background: var(--dex-bg-secondary, #f8f8f8)');
    expect(rule('.go')).toContain('background: var(--dex-bg-hover, #e8e8e8)');
    expect(rule('.go:hover:not([aria-disabled=\'true\'])')).toContain('background: var(--dex-bg-active, #e0e0e0)');
    for (const b of [up(el), named(el, 'Read Again')!, actions(el)]) {
      expect(b.classList.contains('go'), b.title).toBe(true);
      expect(getComputedStyle(b).width, b.title).toBe('24px');
    }
  });

  it('greys what a disabled button draws, not the button, so its focus ring stays whole', async () => {
    expect(rule("button[aria-disabled='true'] > *")).toContain('opacity: 0.35');
  });

  it('sets the path in the text colour on the box, readable in every theme', () => {
    // The segments are text (4.5:1); the buttons' glyphs, drawn in the same ink with `mono`, are
    // controls on their grey fill (3:1).
    expect(rule(':host')).toContain('color: var(--dex-color-text, #333)');
    expect(rule('.path')).toContain('background: var(--dex-bg-primary, #fff)');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      expect(contrast(tokens.get('--dex-color-text')!, tokens.get('--dex-bg-primary')!), set).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.get('--dex-color-text')!, tokens.get('--dex-bg-hover')!), set).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens.get('--dex-color-text')!, tokens.get('--dex-bg-active')!), set).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws a disabled button greyed in forced colours too, and the current folder as no button, after the shared sheet', () => {
    // The shared sheet greys a disabled <button>, which these are not (theirs is aria-disabled), and
    // borders every [tabindex], the current folder's span among them, as if it were a button.
    const all = sheets();
    const shared = all.indexOf(highContrastStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' '));
    const own = all.findIndex((css, i) => i !== shared && css.includes('@media (forced-colors: active)'));
    expect(shared).toBeGreaterThanOrEqual(0);
    expect(own).toBeGreaterThan(shared);
    expect(all[own]).toContain("button[aria-disabled='true'] { border-color: GrayText !important; color: GrayText !important; }");
    expect(all[own]).toContain('.current { border: none !important; }');
    // A segment's outline drawn inside it: the path box clips what spills out of it.
    expect(all[own]).toContain('.segment:focus-visible, .fold:focus-visible, .current:focus-visible { outline-offset: -2px !important; }');
  });

  it('draws a focused segment its ring inside, where the box does not clip it', () => {
    expect(rule('.segment:focus-visible')).toContain('box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4))');
  });
});

describe('defineFolderBar', () => {
  it('registers the bar and the <dex-icon> it draws', () => {
    expect(customElements.get('dex-folder-bar')).toBe(DexFolderBar);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
