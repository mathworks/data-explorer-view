// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A tab's menu (<dex-doc-tabs>'s `dex-tab-menu`): the row draws no menu, it asks the app for one,
// by the mouse (a right-click on the tab or its ×) and by the keyboard (Shift+F10 or the
// ContextMenu key on the focused tab). Asked once, for the right tab: the browser's own menu is
// kept off a tab, and the contextmenu a browser fires after a menu key is no second request, or
// the app would open two menus, the second at the pointer, wherever it was. Everything else in the
// row (its empty end, the … button and its list) keeps the browser's menu.
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { DexDocTabs, defineDocTabs, type DocTab, type TabMenuDetail } from '../src/widgets/app-shell/dex-doc-tabs.js';

beforeAll(() => defineDocTabs());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const A: DocTab = { id: 'a', label: 'a.sldd' };
const B: DocTab = { id: 'b', label: 'b.mat' };

async function mount(): Promise<DexDocTabs> {
  const el = document.createElement('dex-doc-tabs');
  el.tabs = [A, B];
  el.active = 'a';
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const tabOf = (el: DexDocTabs, id: string): HTMLElement => el.shadowRoot!.querySelector<HTMLElement>(`[role="tab"][data-id="${id}"]`)!;

/** Every `dex-tab-menu` detail sent from now on, heard on the document: it must leave the shadow root. */
function menus(): TabMenuDetail[] {
  const seen: TabMenuDetail[] = [];
  // Typed by the event map: no cast, so a detail of another shape would not compile.
  const listener = (e: CustomEvent<TabMenuDetail>): void => {
    seen.push(e.detail);
  };
  document.addEventListener('dex-tab-menu', listener);
  onTestFinished(() => document.removeEventListener('dex-tab-menu', listener));
  return seen;
}

/** A right-click's contextmenu on `target`, at (x, y). */
function contextMenu(target: Element, x = 0, y = 0): MouseEvent {
  const ev = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 2 });
  target.dispatchEvent(ev);
  return ev;
}

function press(target: Element, key: string, init: KeyboardEventInit = {}, type: 'keydown' | 'keyup' = 'keydown'): KeyboardEvent {
  const ev = new KeyboardEvent(type, { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

/** The tab `id`, focused, with its box where a key's menu is placed under. */
function focusedTab(el: DexDocTabs, id: string): HTMLElement {
  const tab = tabOf(el, id);
  vi.spyOn(tab, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 0, 80, 28));
  tab.focus();
  return tab;
}

describe('a tab asks for its menu', () => {
  it('on a right-click, at the pointer, in place of the browser\'s menu', async () => {
    const el = await mount();
    const seen = menus();
    const ev = contextMenu(tabOf(el, 'b'), 140, 12);
    expect(seen).toEqual([{ id: 'b', x: 140, y: 12 }]);
    expect('keyboard' in seen[0]!).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("on a right-click on its ×, for that tab", async () => {
    const el = await mount();
    const seen = menus();
    contextMenu(tabOf(el, 'b').querySelector('button.close')!, 190, 14);
    expect(seen).toEqual([{ id: 'b', x: 190, y: 14 }]);
  });

  it('on Shift+F10, under the focused tab, taking the keyboard, and once', async () => {
    const el = await mount();
    const seen = menus();
    const tab = focusedTab(el, 'b');
    const ev = press(tab, 'F10', { shiftKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).toEqual([{ id: 'b', x: 120, y: 28, keyboard: true }]);
    // The browser's own contextmenu after the key: no second menu, and no browser menu.
    const after = contextMenu(tab, 5, 5);
    expect(after.defaultPrevented).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it('on the ContextMenu key, the same, but not on Shift+ContextMenu', async () => {
    const el = await mount();
    const seen = menus();
    const tab = focusedTab(el, 'a');
    expect(press(tab, 'ContextMenu').defaultPrevented).toBe(true);
    expect(seen).toEqual([{ id: 'a', x: 120, y: 28, keyboard: true }]);
    expect(contextMenu(tab).defaultPrevented).toBe(true);
    expect(seen).toHaveLength(1);
    const shifted = press(tab, 'ContextMenu', { shiftKey: true });
    expect(shifted.defaultPrevented).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it("spends the menu key's keyup too, which is when Windows sends the browser's menu", async () => {
    const el = await mount();
    const seen = menus();
    const tab = focusedTab(el, 'a');
    press(tab, 'ContextMenu');
    expect(press(tab, 'ContextMenu', {}, 'keyup').defaultPrevented).toBe(true);
    expect(contextMenu(tab).defaultPrevented).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it('on a right-click again once the key is past: the next task, not the key\'s', async () => {
    vi.useFakeTimers();
    const el = await mount();
    const seen = menus();
    const tab = focusedTab(el, 'a');
    press(tab, 'F10', { shiftKey: true });
    vi.advanceTimersByTime(0);
    contextMenu(tab, 7, 8);
    expect(seen).toEqual([
      { id: 'a', x: 120, y: 28, keyboard: true },
      { id: 'a', x: 7, y: 8 },
    ]);
  });

  it('not on F10 alone, nor on a menu key with Ctrl, Alt or Cmd', async () => {
    const el = await mount();
    const seen = menus();
    const tab = focusedTab(el, 'a');
    for (const init of [{}, { shiftKey: true, ctrlKey: true }, { shiftKey: true, altKey: true }, { shiftKey: true, metaKey: true }]) {
      expect(press(tab, 'F10', init).defaultPrevented).toBe(false);
    }
    expect(press(tab, 'ContextMenu', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('the rest of the row', () => {
  it("keeps the browser's menu on the row's empty end, the … button and its list", async () => {
    const el = await mount();
    const seen = menus();
    const root = el.shadowRoot!;
    expect(contextMenu(root.querySelector('[role="tablist"]')!).defaultPrevented).toBe(false);
    const overflow = root.querySelector<HTMLButtonElement>('button.overflow')!;
    overflow.hidden = false;
    expect(contextMenu(overflow).defaultPrevented).toBe(false);
    overflow.click();
    await el.updateComplete;
    const item = root.querySelector('[role="menuitem"]')!;
    expect(item).not.toBeNull();
    expect(contextMenu(item).defaultPrevented).toBe(false);
    expect(seen).toEqual([]);
  });
});
