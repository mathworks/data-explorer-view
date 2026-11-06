// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-doc-tabs>: the row of tabs above the documents of an app shell, one per open file. It draws
// what the app hands it and asks for everything else: which tabs there are and which one is active
// stay the app's, so every case here checks what is drawn for some `tabs` and `active`, and which
// request a click, a key or a drag sends. Nothing a user does may change the tabs by itself: a tab
// that closed or moved without the app knowing would leave the app's documents and the row
// disagreeing about what is open.
//
// happy-dom lays nothing out, so a crowded row is a strip whose scrollWidth is stubbed past its
// clientWidth, and its drags are plain events carrying a stand-in for DataTransfer (its DragEvent is
// a bare Event that keeps no dataTransfer), as in treeTableDragDrop.test.ts.
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  DexDocTabs,
  defineDocTabs,
  type DocTab,
  type DocTabsEventMap,
} from '../src/widgets/app-shell/dex-doc-tabs.js';
import { highContrastStyles } from '../src/widgets/shared/high-contrast.styles.js';
import { THEME_SETS } from './tools/cssTokens.js';

beforeAll(() => defineDocTabs());
afterEach(() => document.body.replaceChildren());

const A: DocTab = { id: 'a', label: 'a.sldd', icon: 'simulink_database' };
const B: DocTab = { id: 'b', label: 'b.mat', icon: 'wsMat' };
const C: DocTab = { id: 'c', label: 'c.slx' };

async function mount(tabs: DocTab[] = [A, B, C], active = 'a'): Promise<DexDocTabs> {
  const el = document.createElement('dex-doc-tabs');
  el.tabs = tabs;
  el.active = active;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const tabEls = (el: DexDocTabs): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')];
const tabOf = (el: DexDocTabs, id: string): HTMLElement => tabEls(el).find((t) => t.dataset.id === id)!;
const labels = (el: DexDocTabs): string[] => tabEls(el).map((t) => t.querySelector('.label')!.textContent!);
const closeOf = (el: DexDocTabs, id: string): HTMLButtonElement => tabOf(el, id).querySelector<HTMLButtonElement>('button.close')!;
const focused = (el: DexDocTabs): HTMLElement | null => el.shadowRoot!.activeElement as HTMLElement | null;
const strip = (el: DexDocTabs): HTMLElement => el.shadowRoot!.querySelector<HTMLElement>('[role="tablist"]')!;
// The … button, while it is offered: it is drawn always, and hidden while the tabs fit.
const overflowButton = (el: DexDocTabs): HTMLButtonElement | null => el.shadowRoot!.querySelector<HTMLButtonElement>('button.overflow:not([hidden])');
const menuItems = (el: DexDocTabs): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="menuitem"]')];

/** Every detail of `type` the element sends from now on, heard on the document: the events must leave the shadow root. */
function heard<K extends keyof DocTabsEventMap>(type: K): DocTabsEventMap[K]['detail'][] {
  const seen: DocTabsEventMap[K]['detail'][] = [];
  const listener = (e: DocTabsEventMap[K]): void => {
    seen.push(e.detail);
  };
  document.addEventListener(type, listener);
  onTestFinished(() => document.removeEventListener(type, listener));
  return seen;
}

/** The four requests, heard from here to the end of the test. */
function listen() {
  return {
    select: heard('dex-tab-select'),
    close: heard('dex-tab-close'),
    pin: heard('dex-tab-pin'),
    move: heard('dex-tab-move'),
  };
}

function key(target: HTMLElement, k: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

// A crowded row: wider content than the strip has room for. Redrawn, so the element measures again.
async function crowd(el: DexDocTabs): Promise<void> {
  Object.defineProperty(strip(el), 'scrollWidth', { configurable: true, value: 600 });
  Object.defineProperty(strip(el), 'clientWidth', { configurable: true, value: 200 });
  el.tabs = [...el.tabs];
  await el.updateComplete;
  await el.updateComplete;
}

// A stand-in for DataTransfer, holding what was set, in the order set, as its types.
function transfer(data: Record<string, string> = {}) {
  const store = new Map(Object.entries(data));
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    get types(): string[] {
      return [...store.keys()];
    },
    setData: (type: string, value: string): void => void store.set(type, value),
    getData: (type: string): string => store.get(type) ?? '',
    setDragImage: (): void => {},
  };
}

function drag(target: HTMLElement, type: string, dt: ReturnType<typeof transfer>): Event {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  Object.assign(ev, { dataTransfer: dt, clientX: 0, clientY: 0, relatedTarget: null });
  target.dispatchEvent(ev);
  return ev;
}

// WCAG's contrast ratio of two colours written #rgb, #rrggbb or rgb(r, g, b).
function contrast(a: string, b: string): number {
  const luminance = (colour: string): number => {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
    const parts = hex
      ? (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16))
      : colour.match(/\d+/g)!.slice(0, 3).map(Number);
    const [r, g, bl] = parts.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the tabs', () => {
  it('draws one tab per item, in order, with its label and its 14px icon, in a tablist', async () => {
    const el = await mount();
    expect(strip(el)).not.toBeNull();
    expect(labels(el)).toEqual(['a.sldd', 'b.mat', 'c.slx']);
    const icon = tabOf(el, 'a').querySelector('dex-icon')!;
    expect(icon.iconId).toBe('simulink_database');
    expect(icon.size).toBe(14);
    expect(tabOf(el, 'b').querySelector('dex-icon')!.iconId).toBe('wsMat');
    // A tab with no icon draws none, rather than a broken image.
    expect(tabOf(el, 'c').querySelector('dex-icon')).toBeNull();
  });

  it('marks the active tab, and only it, selected, and moves the mark as `active` changes', async () => {
    const el = await mount([A, B, C], 'b');
    expect(tabEls(el).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabOf(el, 'b').classList.contains('active')).toBe(true);
    expect(el.getAttribute('active')).toBe('b');
    el.active = 'c';
    await el.updateComplete;
    expect(tabEls(el).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    expect(tabOf(el, 'b').classList.contains('active')).toBe(false);
  });

  it('draws the tabs a new `tabs` holds, and nothing for one that is not an array', async () => {
    const el = await mount();
    el.tabs = [C, A];
    await el.updateComplete;
    expect(labels(el)).toEqual(['c.slx', 'a.sldd']);
    el.tabs = null as unknown as DocTab[];
    await el.updateComplete;
    expect(tabEls(el)).toEqual([]);
  });

  it("gives each tab the tooltip of its title, or of its label when it has none", async () => {
    const el = await mount([{ ...A, title: '/work/data/a.sldd' }, B]);
    expect(tabOf(el, 'a').title).toBe('/work/data/a.sldd');
    expect(tabOf(el, 'b').title).toBe('b.mat');
  });

  it('draws a preview tab with the preview class, whose label is italic', async () => {
    const el = await mount([{ ...A, preview: true }, B]);
    expect(tabOf(el, 'a').classList.contains('preview')).toBe(true);
    expect(tabOf(el, 'b').classList.contains('preview')).toBe(false);
    expect(getComputedStyle(tabOf(el, 'a').querySelector('.label')!).fontStyle).toBe('italic');
    expect(getComputedStyle(tabOf(el, 'b').querySelector('.label')!).fontStyle).not.toBe('italic');
  });

  it('shows ● where an unsaved tab has its ×, and says "unsaved" to a screen reader', async () => {
    // The × is still there for the pointer (hover and focus bring it back), so the dot replaces it
    // only while nothing is about to close the tab.
    const el = await mount([A, { ...B, dirty: true }]);
    const dirty = tabOf(el, 'b');
    expect(dirty.classList.contains('dirty')).toBe(true);
    expect(dirty.querySelector('.close .dot')!.textContent).toBe('●');
    expect(getComputedStyle(dirty.querySelector('.close .x')!).display).toBe('none');
    expect(dirty.getAttribute('aria-label')).toBe('b.mat, unsaved');
    const clean = tabOf(el, 'a');
    expect(clean.querySelector('.close .dot')).toBeNull();
    expect(clean.getAttribute('aria-label')).toBe('a.sldd');
  });

  it('brings the × back over the dot for the pointer and the keyboard, and not for the focus a click leaves', () => {
    // A click focuses the tab: under :focus the dot stayed hidden after the pointer had gone, and an
    // unsaved tab looked saved. happy-dom matches neither :hover nor :focus in a shadow root, so the
    // selectors are what is pinned.
    const css = [DexDocTabs.styles]
      .flat(Infinity)
      .map((sheet) => (sheet as { cssText: string }).cssText.replace(/\/\*[\s\S]*?\*\//g, ''))
      .join('\n');
    const dirty = css.match(/[^{}]*\.dirty[^{}]*\{[^}]*\}/g)!.join('\n');
    expect(dirty).toContain('.dirty:hover .dot');
    expect(dirty).toContain('.dirty:focus-visible .dot');
    expect(dirty).toContain('.dirty:focus-visible .x');
    expect(dirty).not.toMatch(/:focus(?!-visible)/);
  });

  it('draws the × in a grey that clears 3:1 on the bar and on a hovered tab, as a control must', async () => {
    // It was the disabled grey (#999), at 2.6:1 on the bar: a control that looked unavailable.
    const el = await mount();
    const ink = getComputedStyle(closeOf(el, 'a')).color;
    const bar = getComputedStyle(el.shadowRoot!.querySelector('.bar')!).backgroundColor;
    expect(contrast(ink, bar)).toBeGreaterThanOrEqual(3);
    expect(contrast(ink, '#e8e8e8')).toBeGreaterThanOrEqual(3);
  });

  it('marks the active tab in forced colours too, correcting the shared high-contrast sheet after it', () => {
    // That sheet borders every [tabindex] in ButtonText, which takes the active tab's accent line
    // away, and puts its focus outline outside, where the scrolling strip clips it. happy-dom applies
    // no media query, so the rules themselves are what is pinned.
    const sheets = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\s+/g, ' '));
    const shared = sheets.indexOf(highContrastStyles.cssText.replace(/\s+/g, ' '));
    const own = sheets.findIndex((css) => css.includes('@media (forced-colors: active)') && css.includes('.tab.active'));
    expect(shared).toBeGreaterThanOrEqual(0);
    expect(own).toBeGreaterThan(shared);
    expect(sheets[own]).toContain('.tab.active { border-bottom: 2px solid Highlight !important; }');
    expect(sheets[own]).toContain("[role='tab']:focus-visible, [role='menuitem']:focus-visible { outline-offset: -2px !important; }");
  });

  it('says "preview" to a screen reader, which cannot see the italic', async () => {
    const el = await mount([{ ...A, preview: true }, { ...B, preview: true, dirty: true }]);
    expect(tabOf(el, 'a').getAttribute('aria-label')).toBe('a.sldd, preview');
    expect(tabOf(el, 'b').getAttribute('aria-label')).toBe('b.mat, preview, unsaved');
  });

  it('draws a subtitle before the icon and the label, smaller and muted, and names both to a screen reader', async () => {
    // A tab showing a part of its file (a dictionary's Design Data) is labelled with the part, and
    // the file is its subtitle: as a path reads, the file first. A tab with none draws no subtitle.
    const section: DocTab = { id: 'a', label: 'Design Data', icon: 'designData', subtitle: 'a.sldd', preview: true };
    const el = await mount([section, B]);
    const tab = tabOf(el, 'a');
    const subtitle = tab.querySelector<HTMLElement>('.subtitle')!;
    expect(subtitle.textContent).toBe('a.sldd');
    expect([...tab.children].map((c) => c.className || c.localName)).toEqual(['subtitle', 'dex-icon', 'label', 'close']);
    expect(getComputedStyle(subtitle).fontSize).toBe('11px');
    // Text, not a mark: the secondary ink, readable (4.5:1) on the bar, a hovered tab and the active
    // tab in every theme. The muted ink was 4.3:1 on the dark bar.
    const ink = getComputedStyle(subtitle).color;
    expect(contrast(ink, getComputedStyle(el.shadowRoot!.querySelector('.bar')!).backgroundColor)).toBeGreaterThanOrEqual(4.5);
    const css = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText).join('\n');
    expect(/\.subtitle \{[^}]*color: var\((--dex-[\w-]+), #555\)/.exec(css.replace(/\s+/g, ' '))?.[1]).toBe('--dex-color-text-secondary');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      for (const surface of ['--dex-bg-tabbar', '--dex-bg-hover', '--dex-bg-primary']) {
        expect(contrast(tokens.get('--dex-color-text-secondary')!, tokens.get(surface)!), `${set} ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The italic is the label's, the part a preview shows; the file's name stays upright.
    expect(getComputedStyle(subtitle).fontStyle).not.toBe('italic');
    expect(tab.getAttribute('aria-label')).toBe('a.sldd, Design Data, preview');
    expect(closeOf(el, 'a').getAttribute('aria-label')).toBe('Close a.sldd, Design Data');
    expect(tabOf(el, 'b').querySelector('.subtitle')).toBeNull();
    expect(closeOf(el, 'b').getAttribute('aria-label')).toBe('Close b.mat');
  });
});

describe('what the mouse asks for', () => {
  it('a click asks for the tab, and leaves `active` to the app', async () => {
    const el = await mount();
    const { select, close } = listen();
    tabOf(el, 'b').click();
    expect(select).toEqual([{ id: 'b' }]);
    expect(close).toEqual([]);
    expect(el.active).toBe('a');
  });

  it('× asks to close the tab, and not to select it', async () => {
    const el = await mount();
    const { select, close } = listen();
    closeOf(el, 'b').click();
    expect(close).toEqual([{ id: 'b' }]);
    expect(select).toEqual([]);
    // The app removes it; the element never does.
    expect(labels(el)).toEqual(['a.sldd', 'b.mat', 'c.slx']);
  });

  it('a middle click closes the tab; another button does not', async () => {
    const el = await mount();
    const { select, close } = listen();
    // Pressed, the middle button would start the browser's autoscroll on Windows and Linux.
    const down = new MouseEvent('mousedown', { button: 1, bubbles: true, composed: true, cancelable: true });
    tabOf(el, 'c').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    tabOf(el, 'c').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, composed: true }));
    tabOf(el, 'c').dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true, composed: true }));
    expect(close).toEqual([{ id: 'c' }]);
    expect(select).toEqual([]);
  });

  it('a double-click asks to pin the tab; one on its × does not', async () => {
    const el = await mount([{ ...A, preview: true }, B]);
    const { pin } = listen();
    tabOf(el, 'a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(pin).toEqual([{ id: 'a' }]);
    closeOf(el, 'b').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(pin).toEqual([{ id: 'a' }]);
  });
});

describe('the keyboard', () => {
  it('lets one tab take Tab: the active one', async () => {
    const el = await mount([A, B, C], 'b');
    expect(tabEls(el).map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    // The × is for the pointer; the keyboard closes with Delete.
    expect(closeOf(el, 'b').getAttribute('tabindex')).toBe('-1');
  });

  it('moves the focus along the tabs with the arrows, round the ends, and to either end with Home and End', async () => {
    const el = await mount();
    tabOf(el, 'a').focus();
    key(tabOf(el, 'a'), 'ArrowRight');
    expect(focused(el)).toBe(tabOf(el, 'b'));
    await el.updateComplete;
    // The tab the keyboard is on is the one Tab comes back to.
    expect(tabOf(el, 'b').getAttribute('tabindex')).toBe('0');
    key(tabOf(el, 'b'), 'ArrowRight');
    key(tabOf(el, 'c'), 'ArrowRight');
    expect(focused(el)).toBe(tabOf(el, 'a'));
    key(tabOf(el, 'a'), 'ArrowLeft');
    expect(focused(el)).toBe(tabOf(el, 'c'));
    key(tabOf(el, 'c'), 'Home');
    expect(focused(el)).toBe(tabOf(el, 'a'));
    const end = key(tabOf(el, 'a'), 'End');
    expect(focused(el)).toBe(tabOf(el, 'c'));
    expect(end.defaultPrevented).toBe(true);
    // Moving the focus selects nothing: the app may take a while to show a document.
    expect(el.active).toBe('a');
  });

  it('asks for the focused tab on Enter and on Space, and to close it on Delete or Backspace', async () => {
    // Backspace is the key a Mac laptop marks delete; it has no Delete key without fn.
    const el = await mount();
    const { select, close } = listen();
    tabOf(el, 'b').focus();
    key(tabOf(el, 'b'), 'Enter');
    const space = key(tabOf(el, 'b'), ' ');
    expect(space.defaultPrevented).toBe(true);
    key(tabOf(el, 'b'), 'Delete');
    expect(key(tabOf(el, 'b'), 'Backspace').defaultPrevented).toBe(true);
    expect(select).toEqual([{ id: 'b' }, { id: 'b' }]);
    expect(close).toEqual([{ id: 'b' }, { id: 'b' }]);
    const other = key(tabOf(el, 'b'), 'x');
    expect(other.defaultPrevented).toBe(false);
  });

  it('tells a screen reader that Delete closes a tab, since its × cannot be reached', async () => {
    const el = await mount();
    expect(tabEls(el).map((t) => t.getAttribute('aria-keyshortcuts'))).toEqual(['Delete', 'Delete', 'Delete']);
  });

  it('gives the focus to the tab now in its place once the app closes the focused tab', async () => {
    // Delete, Delete, Delete closes one tab after another, as long as the focus stays in the row.
    const el = await mount();
    tabOf(el, 'b').focus();
    el.tabs = [A, C];
    await el.updateComplete;
    expect(focused(el)).toBe(tabOf(el, 'c'));
    el.tabs = [A];
    await el.updateComplete;
    expect(focused(el)).toBe(tabOf(el, 'a'));
  });

  it('does the same for a tab closed by its ×, which a click left the focus on', async () => {
    const el = await mount();
    closeOf(el, 'b').focus();
    el.tabs = [A, C];
    await el.updateComplete;
    expect(focused(el)).toBe(tabOf(el, 'c'));
  });

  it('leaves Enter and Space on a focused × to the ×, which closes the tab rather than showing it', async () => {
    const el = await mount();
    const { select } = listen();
    closeOf(el, 'b').focus();
    for (const k of ['Enter', ' ']) expect(key(closeOf(el, 'b'), k).defaultPrevented).toBe(false);
    expect(select).toEqual([]);
  });

  it('leaves the focus alone when a tab closes while the focus is elsewhere', async () => {
    const el = await mount();
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    el.tabs = [A, C];
    await el.updateComplete;
    expect(document.activeElement).toBe(outside);
  });
});

describe('scrolling', () => {
  it('scrolls the tab `active` names into view as it changes, and only then', async () => {
    const el = await mount();
    const scrolled: string[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.dataset.id ?? '');
    });
    try {
      el.active = 'c';
      await el.updateComplete;
      expect(scrolled).toEqual(['c']);
      // A redraw that keeps the active tab leaves the strip where the user scrolled it.
      el.tabs = [...el.tabs];
      await el.updateComplete;
      expect(scrolled).toEqual(['c']);
    } finally {
      scroll.mockRestore();
    }
  });

  it('scrolls a tab made active before it is drawn into view once it is', async () => {
    // The app opens a file: it may name the new tab active before handing over the tabs holding it.
    const el = await mount([A, B]);
    const scrolled: string[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.dataset.id ?? '');
    });
    try {
      el.active = 'c';
      await el.updateComplete;
      expect(scrolled).toEqual([]);
      el.tabs = [A, B, C];
      await el.updateComplete;
      expect(scrolled).toEqual(['c']);
    } finally {
      scroll.mockRestore();
    }
  });

  it('offers the … button before it scrolls the active tab into view, in the one update, so the button never covers it', async () => {
    // The row overflowed as a tab was added: scrolled first, the new tab ended under the button the
    // measure then turned on, and setting that state inside updated() made Lit draw again (and warn).
    const el = await mount([A]);
    Object.defineProperty(strip(el), 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(strip(el), 'clientWidth', { configurable: true, value: 200 });
    const buttonThere: boolean[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      buttonThere.push(overflowButton(el) !== null);
    });
    try {
      el.tabs = [A, B, C];
      el.active = 'c';
      // Lit's updateComplete is false when an update set a property inside updated(), drawing again.
      expect(await el.updateComplete).toBe(true);
      expect(buttonThere).toEqual([true]);
    } finally {
      scroll.mockRestore();
    }
  });

  it('scrolls the active tab into view again when it is drawn otherwise, a subtitle or a longer label widening it', async () => {
    const el = await mount([A, B, C], 'c');
    const scrolled: string[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.dataset.id ?? '');
    });
    try {
      el.tabs = [A, B, { ...C, label: 'Model Workspace', subtitle: 'c.slx' }];
      await el.updateComplete;
      expect(scrolled).toEqual(['c']);
      // Another tab drawn otherwise, or the active one marked unsaved, leaves the strip as it is.
      el.tabs = [{ ...A, label: 'Design Data', subtitle: 'a.sldd' }, B, { ...C, label: 'Model Workspace', subtitle: 'c.slx', dirty: true }];
      await el.updateComplete;
      expect(scrolled).toEqual(['c']);
    } finally {
      scroll.mockRestore();
    }
  });

  it("sizes each tab's icon itself, so a tab is as wide before its icon has drawn as after, and the scroll lands right", async () => {
    // <dex-icon> takes its size from its own first draw, which comes after the row's: measured and
    // scrolled before, a tab grew by its icon afterwards, and its end went back under the … button.
    const el = await mount();
    const icons = [...el.shadowRoot!.querySelectorAll('dex-icon')];
    expect(icons.length).toBe(2);
    for (const icon of icons) expect(getComputedStyle(icon).width).toBe('14px');
    const css = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')).join('\n');
    expect(css).toContain('dex-icon { flex-shrink: 0; width: 14px; height: 14px; }');
  });

  it('scrolls the active tab into view again whenever the row is resized, the … button coming or there already', async () => {
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
    const scrolled: string[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.dataset.id ?? '');
    });
    try {
      const el = await mount([A, B, C], 'c');
      scrolled.length = 0;
      Object.defineProperty(strip(el), 'scrollWidth', { configurable: true, value: 600 });
      Object.defineProperty(strip(el), 'clientWidth', { configurable: true, value: 200 });
      observers[0]!();
      expect(overflowButton(el)).not.toBeNull();
      expect(scrolled).toEqual(['c']);
      // Narrowed again, the button there already (a window made smaller, a sidebar's sash dragged):
      // the active tab is kept in view all the same, clear of the button.
      Object.defineProperty(strip(el), 'clientWidth', { configurable: true, value: 120 });
      observers[0]!();
      expect(overflowButton(el)).not.toBeNull();
      expect(scrolled).toEqual(['c', 'c']);
    } finally {
      scroll.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('hides the × of a tab scrolled partly out past the row\'s start, so no × is left there alone', async () => {
    // Scrolled so that only a tab's end shows at the left edge, its × stood there with no label.
    const el = await mount();
    await crowd(el);
    const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 28, height: 28, x: left, y: 0, toJSON() {} }) as DOMRect;
    let scrolledBy = 0;
    vi.spyOn(strip(el), 'getBoundingClientRect').mockImplementation(() => rect(0, 200));
    tabEls(el).forEach((tab, i) => vi.spyOn(tab, 'getBoundingClientRect').mockImplementation(() => rect(i * 120 - scrolledBy, 120)));
    scrolledBy = 100;
    strip(el).dispatchEvent(new Event('scroll'));
    expect(tabEls(el).map((t) => t.hasAttribute('data-clipped'))).toEqual([true, false, false]);
    scrolledBy = 0;
    strip(el).dispatchEvent(new Event('scroll'));
    expect(tabEls(el).map((t) => t.hasAttribute('data-clipped'))).toEqual([false, false, false]);
    // A redraw keeps the mark it measured: Lit does not own the attribute.
    scrolledBy = 130;
    strip(el).dispatchEvent(new Event('scroll'));
    el.tabs = [...el.tabs];
    await el.updateComplete;
    expect(tabEls(el).map((t) => t.hasAttribute('data-clipped'))).toEqual([true, true, false]);
    const css = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\s+/g, ' ')).join('\n');
    // The × alone: an unsaved tab's ● still says it is unsaved at the edge.
    expect(css).toContain('.tab[data-clipped] .x { visibility: hidden; }');
    expect(css).not.toContain('.tab[data-clipped] .close');
  });

  it('never draws a tab wider than the row, its label giving way to an ellipsis instead', async () => {
    // A section's tab (the file, its icon, the section) could be wider than a narrow window's row.
    // happy-dom lays nothing out, so the rules are what is pinned.
    const css = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')).join('\n');
    expect(/\.tab \{[^}]*\}/.exec(css)?.[0]).toContain('max-width: 100%;');
    expect(/\.close \{[^}]*\}/.exec(css)?.[0]).toContain('flex-shrink: 0;');
    for (const part of ['label', 'subtitle']) {
      const rule = new RegExp(`\\.${part} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
      expect(rule, part).toContain('overflow: hidden;');
      expect(rule, part).toContain('text-overflow: ellipsis;');
    }
  });

  it('turns a vertical wheel into a sideways scroll of a crowded row, and leaves an uncrowded one to the page', async () => {
    const el = await mount();
    const roomy = new WheelEvent('wheel', { deltaY: 40, bubbles: true, composed: true, cancelable: true });
    strip(el).dispatchEvent(roomy);
    expect(roomy.defaultPrevented).toBe(false);
    await crowd(el);
    const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, composed: true, cancelable: true });
    strip(el).dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(strip(el).scrollLeft).toBe(40);
  });
});

describe('the overflow menu', () => {
  it('offers the … button only once the tabs do not fit', async () => {
    const el = await mount();
    expect(overflowButton(el)).toBeNull();
    await crowd(el);
    const button = overflowButton(el)!;
    expect(button.textContent!.trim()).toBe('…');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('lists every tab, marks the active one, and asks for the one clicked', async () => {
    const el = await mount([A, { ...B, dirty: true }, C], 'b');
    const { select } = listen();
    await crowd(el);
    overflowButton(el)!.click();
    await el.updateComplete;
    expect(overflowButton(el)!.getAttribute('aria-expanded')).toBe('true');
    expect(menuItems(el).map((i) => i.querySelector('.label')!.textContent)).toEqual(['a.sldd', 'b.mat', 'c.slx']);
    expect(menuItems(el).map((i) => i.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(menuItems(el)[1]!.getAttribute('aria-label')).toBe('b.mat, unsaved');
    menuItems(el)[2]!.click();
    await el.updateComplete;
    expect(select).toEqual([{ id: 'c' }]);
    expect(menuItems(el)).toEqual([]);
    expect(focused(el)).toBe(overflowButton(el));
  });

  it("lists a tab's subtitle before its label, as the tab draws it", async () => {
    const el = await mount([{ ...A, label: 'Design Data', subtitle: 'a.sldd' }, B]);
    await crowd(el);
    overflowButton(el)!.click();
    await el.updateComplete;
    expect(menuItems(el).map((i) => [...i.querySelectorAll('.subtitle, .label')].map((s) => s.textContent))).toEqual([['a.sldd', 'Design Data'], ['b.mat']]);
    expect(menuItems(el)[0]!.getAttribute('aria-label')).toBe('a.sldd, Design Data');
  });

  it('opens on the active tab, moves with the arrows, and asks for the one Enter is pressed on', async () => {
    const el = await mount([A, B, C], 'b');
    const { select } = listen();
    await crowd(el);
    overflowButton(el)!.click();
    await el.updateComplete;
    expect(focused(el)).toBe(menuItems(el)[1]);
    key(menuItems(el)[1]!, 'ArrowDown');
    expect(focused(el)).toBe(menuItems(el)[2]);
    key(menuItems(el)[2]!, 'ArrowDown');
    expect(focused(el)).toBe(menuItems(el)[0]);
    key(menuItems(el)[0]!, 'ArrowUp');
    expect(focused(el)).toBe(menuItems(el)[2]);
    key(menuItems(el)[2]!, 'Enter');
    await el.updateComplete;
    expect(select).toEqual([{ id: 'c' }]);
    expect(menuItems(el)).toEqual([]);
  });

  it('closes on Escape, giving the focus back to its button, and on a press outside it, asking for nothing', async () => {
    const el = await mount();
    const { select } = listen();
    await crowd(el);
    overflowButton(el)!.click();
    await el.updateComplete;
    key(menuItems(el)[0]!, 'Escape');
    await el.updateComplete;
    expect(menuItems(el)).toEqual([]);
    expect(focused(el)).toBe(overflowButton(el));
    overflowButton(el)!.click();
    await el.updateComplete;
    expect(menuItems(el).length).toBe(3);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(menuItems(el)).toEqual([]);
    expect(select).toEqual([]);
  });

  it('closes when its button is pressed again', async () => {
    const el = await mount();
    await crowd(el);
    overflowButton(el)!.click();
    await el.updateComplete;
    overflowButton(el)!.click();
    await el.updateComplete;
    expect(menuItems(el)).toEqual([]);
    expect(overflowButton(el)!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('drag to reorder', () => {
  it("writes the dragged tab's id as a tab move, and draws it as dragged", async () => {
    const el = await mount();
    const dt = transfer();
    drag(tabOf(el, 'a'), 'dragstart', dt);
    expect(dt.getData('application/x-dex-tab')).toBe('a');
    expect(dt.effectAllowed).toBe('move');
    await el.updateComplete;
    expect(tabOf(el, 'a').classList.contains('dragging')).toBe(true);
    drag(tabOf(el, 'a'), 'dragend', dt);
    await el.updateComplete;
    expect(tabOf(el, 'a').classList.contains('dragging')).toBe(false);
  });

  it("asks to move tab A to tab C's place when A is dropped on C, and C to A's when C is dropped on A", async () => {
    const el = await mount();
    const { move, select } = listen();
    const dt = transfer();
    drag(tabOf(el, 'a'), 'dragstart', dt);
    const over = drag(tabOf(el, 'c'), 'dragover', dt);
    // Not prevented, a dragover says "no drop here", and the drop never comes.
    expect(over.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
    await el.updateComplete;
    // A goes after C: the mark is on C's far side.
    expect(tabOf(el, 'c').classList.contains('drop-after')).toBe(true);
    const drop = drag(tabOf(el, 'c'), 'drop', dt);
    expect(drop.defaultPrevented).toBe(true);
    drag(tabOf(el, 'a'), 'dragend', dt);
    expect(move).toEqual([{ id: 'a', index: 2 }]);

    const back = transfer();
    drag(tabOf(el, 'c'), 'dragstart', back);
    drag(tabOf(el, 'a'), 'dragover', back);
    await el.updateComplete;
    expect(tabOf(el, 'a').classList.contains('drop-before')).toBe(true);
    drag(tabOf(el, 'a'), 'drop', back);
    expect(move).toEqual([
      { id: 'a', index: 2 },
      { id: 'c', index: 0 },
    ]);
    expect(select).toEqual([]);
    // The app moves them; the element never does.
    expect(labels(el)).toEqual(['a.sldd', 'b.mat', 'c.slx']);
  });

  it('ignores a drag that carries files, even with a tab beside them, and leaves it to the app', async () => {
    // A file dragged in from the desktop is the app's to open: a tab bar that took the drop would
    // swallow it.
    const el = await mount();
    const { move } = listen();
    const fromDesktop = transfer({ Files: '' });
    expect(drag(tabOf(el, 'c'), 'dragover', fromDesktop).defaultPrevented).toBe(false);
    expect(drag(tabOf(el, 'c'), 'drop', fromDesktop).defaultPrevented).toBe(false);
    // The row's own tab drag, should it come to carry files as well.
    const both = transfer({ Files: '' });
    drag(tabOf(el, 'a'), 'dragstart', both);
    expect(both.types).toEqual(['Files', 'application/x-dex-tab']);
    expect(drag(tabOf(el, 'c'), 'dragover', both).defaultPrevented).toBe(false);
    expect(drag(tabOf(el, 'c'), 'drop', both).defaultPrevented).toBe(false);
    drag(tabOf(el, 'a'), 'dragend', both);
    await el.updateComplete;
    expect(tabOf(el, 'c').classList.contains('drop-after')).toBe(false);
    expect(move).toEqual([]);
  });

  it('ignores a drag carrying no tab, and a drop of a tab on itself', async () => {
    const el = await mount();
    const { move } = listen();
    const text = transfer({ 'text/plain': 'a' });
    expect(drag(tabOf(el, 'c'), 'dragover', text).defaultPrevented).toBe(false);
    drag(tabOf(el, 'c'), 'drop', text);
    const self = transfer();
    drag(tabOf(el, 'b'), 'dragstart', self);
    expect(drag(tabOf(el, 'b'), 'dragover', self).defaultPrevented).toBe(false);
    drag(tabOf(el, 'b'), 'drop', self);
    drag(tabOf(el, 'b'), 'dragend', self);
    expect(move).toEqual([]);
  });

  it("ignores a tab dragged from another row or window, even one naming a tab this row holds", async () => {
    // Its id is the other row's: moving a tab of this row by it would move the wrong document.
    const el = await mount();
    const { move } = listen();
    for (const id of ['a', 'elsewhere']) {
      const other = transfer({ 'application/x-dex-tab': id });
      expect(drag(tabOf(el, 'c'), 'dragover', other).defaultPrevented).toBe(false);
      expect(drag(tabOf(el, 'c'), 'drop', other).defaultPrevented).toBe(false);
    }
    expect(move).toEqual([]);
  });

  it('takes its mark off a tab the drag leaves', async () => {
    const el = await mount();
    const dt = transfer();
    drag(tabOf(el, 'a'), 'dragstart', dt);
    drag(tabOf(el, 'c'), 'dragover', dt);
    await el.updateComplete;
    drag(tabOf(el, 'c'), 'dragleave', dt);
    await el.updateComplete;
    expect(tabOf(el, 'c').classList.contains('drop-after')).toBe(false);
  });
});

describe("drop on the row's empty end", () => {
  it('moves its own tab to the end of the row, and asks nothing for the last tab', async () => {
    const el = await mount();
    const { move } = listen();
    const dt = transfer();
    drag(tabOf(el, 'a'), 'dragstart', dt);
    // Over the strip itself, past the last tab: the mark is after the last tab.
    expect(drag(strip(el), 'dragover', dt).defaultPrevented).toBe(true);
    await el.updateComplete;
    expect(tabOf(el, 'c').classList.contains('drop-after')).toBe(true);
    expect(drag(strip(el), 'drop', dt).defaultPrevented).toBe(true);
    drag(tabOf(el, 'a'), 'dragend', dt);
    expect(move).toEqual([{ id: 'a', index: 2 }]);
    // The last tab is at the end already.
    const last = transfer();
    drag(tabOf(el, 'c'), 'dragstart', last);
    expect(drag(strip(el), 'dragover', last).defaultPrevented).toBe(false);
    drag(tabOf(el, 'c'), 'dragend', last);
    expect(move).toHaveLength(1);
  });

  it('leaves a dragover on a tab to the tab, and takes its mark off as the drag leaves the row', async () => {
    const el = await mount();
    const dt = transfer();
    drag(tabOf(el, 'a'), 'dragstart', dt);
    drag(tabOf(el, 'b'), 'dragover', dt);
    await el.updateComplete;
    expect(tabOf(el, 'b').classList.contains('drop-after')).toBe(true);
    expect(tabOf(el, 'c').classList.contains('drop-after')).toBe(false);
    drag(strip(el), 'dragover', dt);
    drag(strip(el), 'dragleave', dt);
    await el.updateComplete;
    expect(tabEls(el).some((t) => t.className.includes('drop-'))).toBe(false);
    drag(tabOf(el, 'a'), 'dragend', dt);
  });
});

describe('rows of one group', () => {
  // Two panes side by side, each with its row: a tab dragged from one row onto the other moves to
  // the other pane. The rows say so by their group; a row of no group, or another, takes only its
  // own tabs, as before.
  const D: DocTab = { id: 'd', label: 'd.sldd' };
  const E: DocTab = { id: 'e', label: 'e.mat' };

  async function rows(left = 'docs', right = 'docs'): Promise<[DexDocTabs, DexDocTabs]> {
    const one = await mount([A, B, C], 'a');
    const two = await mount([D, E], 'd');
    one.group = left;
    two.group = right;
    await Promise.all([one.updateComplete, two.updateComplete]);
    return [one, two];
  }

  /** `el`'s tab `id` laid out from x 100 to 180. */
  function placed(el: DexDocTabs, id: string): HTMLElement {
    const tab = tabOf(el, id);
    tab.getBoundingClientRect = () => ({ left: 100, right: 180, width: 80, top: 0, bottom: 28, height: 28, x: 100, y: 0, toJSON: () => ({}) });
    return tab;
  }

  function dragAt(target: HTMLElement, type: string, dt: ReturnType<typeof transfer>, clientX: number): Event {
    const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
    Object.assign(ev, { dataTransfer: dt, clientX, clientY: 10, relatedTarget: null });
    target.dispatchEvent(ev);
    return ev;
  }

  it('reflects its group', async () => {
    const [one] = await rows();
    expect(one.getAttribute('group')).toBe('docs');
  });

  it("asks the row a tab is dropped on to take it: before or after the tab under the pointer, by its half, or at the row's end", async () => {
    const [one, two] = await rows();
    const moves: [string, unknown][] = [];
    for (const [name, el] of [['one', one], ['two', two]] as const) el.addEventListener('dex-tab-move', (e) => moves.push([name, e.detail]));
    const before = transfer();
    drag(tabOf(one, 'b'), 'dragstart', before);
    expect(dragAt(placed(two, 'e'), 'dragover', before, 120).defaultPrevented).toBe(true);
    await two.updateComplete;
    expect(tabOf(two, 'e').classList.contains('drop-before')).toBe(true);
    dragAt(tabOf(two, 'e'), 'drop', before, 120);
    drag(tabOf(one, 'b'), 'dragend', before);
    const after = transfer();
    drag(tabOf(one, 'b'), 'dragstart', after);
    dragAt(placed(two, 'd'), 'dragover', after, 170);
    await two.updateComplete;
    expect(tabOf(two, 'd').classList.contains('drop-after')).toBe(true);
    dragAt(tabOf(two, 'd'), 'drop', after, 170);
    drag(tabOf(one, 'b'), 'dragend', after);
    const end = transfer();
    drag(tabOf(one, 'c'), 'dragstart', end);
    expect(drag(strip(two), 'dragover', end).defaultPrevented).toBe(true);
    drag(strip(two), 'drop', end);
    drag(tabOf(one, 'c'), 'dragend', end);
    // Each an index into the row it was dropped on, which does not hold the tab.
    expect(moves).toEqual([
      ['two', { id: 'b', index: 1 }],
      ['two', { id: 'b', index: 1 }],
      ['two', { id: 'c', index: 2 }],
    ]);
    // The rows draw what they are given: neither moved anything itself.
    expect(labels(one)).toEqual(['a.sldd', 'b.mat', 'c.slx']);
    expect(labels(two)).toEqual(['d.sldd', 'e.mat']);
  });

  it('leaves the keyboard off its neighbours when the tab it was on went to a row of its group', async () => {
    // The tab was moved, not closed: the keyboard is the app's to give to the row the tab went to.
    // On a neighbour, it would put the user back in the pane the tab left.
    const [one, two] = await rows();
    tabOf(one, 'b').focus();
    expect(focused(one)).toBe(tabOf(one, 'b'));
    // The app moves b: each row is given its tabs before either draws them.
    one.tabs = [A, C];
    two.tabs = [D, E, B];
    await Promise.all([one.updateComplete, two.updateComplete]);
    await one.updateComplete;
    expect(focused(one)).toBeNull();
    // Closed (in no row of the group), the tab's neighbour takes the keyboard, as in any row.
    tabOf(one, 'c').focus();
    one.tabs = [A];
    await one.updateComplete;
    await one.updateComplete;
    expect(focused(one)).toBe(tabOf(one, 'a'));
  });

  it('takes no tab from a row of another group, or of none', async () => {
    for (const [left, right] of [['docs', 'other'], ['', ''], ['docs', '']]) {
      const [one, two] = await rows(left, right);
      const moves: unknown[] = [];
      two.addEventListener('dex-tab-move', (e) => moves.push(e.detail));
      const dt = transfer();
      drag(tabOf(one, 'a'), 'dragstart', dt);
      expect(drag(tabOf(two, 'd'), 'dragover', dt).defaultPrevented, `${left}/${right}`).toBe(false);
      expect(drag(strip(two), 'dragover', dt).defaultPrevented).toBe(false);
      drag(tabOf(two, 'd'), 'drop', dt);
      drag(tabOf(one, 'a'), 'dragend', dt);
      expect(moves).toEqual([]);
      document.body.replaceChildren();
    }
  });

  it("takes nothing once the drag is over, nor a drop naming another tab than the one dragged", async () => {
    const [one, two] = await rows();
    const moves: unknown[] = [];
    two.addEventListener('dex-tab-move', (e) => moves.push(e.detail));
    const dt = transfer();
    drag(tabOf(one, 'a'), 'dragstart', dt);
    drag(tabOf(one, 'a'), 'dragend', dt);
    expect(drag(tabOf(two, 'd'), 'dragover', dt).defaultPrevented).toBe(false);
    const forged = transfer();
    drag(tabOf(one, 'a'), 'dragstart', forged);
    forged.setData('application/x-dex-tab', 'b');
    drag(tabOf(two, 'd'), 'dragover', forged);
    drag(tabOf(two, 'd'), 'drop', forged);
    drag(tabOf(one, 'a'), 'dragend', forged);
    expect(moves).toEqual([]);
  });
});

describe('a row not focused', () => {
  it("draws its active tab's mark in the muted ink, which still clears 3:1, and in the accent again once focused", async () => {
    // Two panes: the row of the one the user is not in. Its active tab is the one that pane shows,
    // but the toolbar acts on the other pane's: the accent marks that one alone.
    // happy-dom matches no :host() selector in getComputedStyle, so the rule itself is what is pinned.
    const el = await mount();
    el.unfocused = true;
    await el.updateComplete;
    expect(el.hasAttribute('unfocused')).toBe(true);
    const css = [DexDocTabs.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\s+/g, ' ')).join('\n');
    expect(/:host\(\[unfocused\]\) \.tab\.active \{[^}]*border-bottom-color: var\((--dex-[\w-]+), #666\)/.exec(css)?.[1]).toBe('--dex-color-text-muted');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      for (const surface of ['--dex-bg-tabbar', '--dex-bg-primary']) {
        expect(contrast(tokens.get('--dex-color-text-muted')!, tokens.get(surface)!), `${set} ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
    el.unfocused = false;
    await el.updateComplete;
    expect(el.hasAttribute('unfocused')).toBe(false);
  });
});

describe('focusActive', () => {
  it('puts the keyboard on the active tab, once it is drawn', async () => {
    const el = await mount([A, B], 'a');
    el.active = 'b';
    el.focusActive();
    await el.updateComplete;
    expect(focused(el)).toBe(tabOf(el, 'b'));
    expect(tabOf(el, 'b').tabIndex).toBe(0);
  });
});

describe('taken out of the page', () => {
  it('closes its menu and takes its listener off the document', async () => {
    // The menu listens on the whole document while it is open; a row removed with it open would
    // leave that listener holding the row for as long as the page lives.
    const el = await mount();
    await crowd(el);
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    try {
      overflowButton(el)!.click();
      await el.updateComplete;
      const listener = added.mock.calls.find(([type, , capture]) => type === 'mousedown' && capture === true)?.[1];
      expect(listener).toBeDefined();
      el.remove();
      expect(removed).toHaveBeenCalledWith('mousedown', listener, true);
      document.body.append(el);
      await el.updateComplete;
      expect(menuItems(el)).toEqual([]);
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });

  it('stops watching its width, and watches it again once back', async () => {
    const observers: { target: Element[]; disconnected: boolean; measure: () => void }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private record: (typeof observers)[number];
        constructor(callback: () => void) {
          this.record = { target: [], disconnected: false, measure: callback };
          observers.push(this.record);
        }
        observe(target: Element): void {
          this.record.target.push(target);
        }
        unobserve(): void {}
        disconnect(): void {
          this.record.disconnected = true;
        }
      },
    );
    try {
      const el = await mount();
      const bar = el.shadowRoot!.querySelector('.bar')!;
      // The bar's width is the room the row has. The strip's changes as the … button comes and goes.
      expect(observers.map((o) => o.target)).toEqual([[bar]]);
      // A resize measures the row again.
      Object.defineProperty(strip(el), 'scrollWidth', { configurable: true, value: 600 });
      Object.defineProperty(strip(el), 'clientWidth', { configurable: true, value: 200 });
      observers[0]!.measure();
      await el.updateComplete;
      expect(overflowButton(el)).not.toBeNull();
      el.remove();
      expect(observers[0]!.disconnected).toBe(true);
      document.body.append(el);
      expect(observers.map((o) => o.target)).toEqual([[bar], [bar]]);
      expect(observers[1]!.disconnected).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('defineDocTabs', () => {
  it('registers the row and the <dex-icon> its tabs draw', () => {
    expect(customElements.get('dex-doc-tabs')).toBeDefined();
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
