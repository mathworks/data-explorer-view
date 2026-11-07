// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Starting a compare from the menus a user reaches for, not only the palette: a tab's own menu (a
// right-click on it, Shift+F10 or the ContextMenu key on a focused one: `dex-tab-menu`) and the
// Explorer's menu of an open file. A file's tab offers Compare With… (greyed for a file no compare
// reads), a compare tab Next and Previous Change; both close themselves and the others. The
// Explorer's Compare With… is about its row's file, whichever tab is active. The shared context menu
// is the tables' too: each menu acts on its next choice only.
import { describe, expect, it } from 'vitest';
import type { ContextMenuItem, ContextMenuShowOptions } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { ShellLinkRequest } from '../../src/widgets/app-shell/connect/types.js';
import { compareWith, PAIR, paletteRows, placeholder, selectPath, twoFiles } from './compareHarness.js';
import { at, choose, explorer, palette, settled, tabNamed, tabNames, until } from './harness.js';

const menu = () => document.querySelector('dex-context-menu')!;
/** Every showing of the shared menu from now on: its items (a separator as '—') and its options. */
function recordMenu(): { labels: string[]; items: ContextMenuItem[]; options: ContextMenuShowOptions }[] {
  const seen: { labels: string[]; items: ContextMenuItem[]; options: ContextMenuShowOptions }[] = [];
  const show = menu().show.bind(menu());
  menu().show = (x, y, items, options = {}) => {
    seen.push({ labels: items.map((i) => (i.separator ? '—' : i.label)), items, options });
    show(x, y, items, options);
  };
  return seen;
}
/** The tab of the file at `path` (or a compare tab by its label). */
const tabEl = (path: string): HTMLElement =>
  [...document.querySelectorAll('dex-doc-tabs')[0]!.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.getAttribute('title') === path || t.textContent?.includes(path),
  )!;
const rightClick = (el: HTMLElement): void =>
  void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 30, clientY: 12 }));

describe("a tab's menu", () => {
  it("offers Compare With… on a file's tab, and closes it or the others", async () => {
    await twoFiles();
    const shown = recordMenu();
    rightClick(tabEl(at('a/params.sldd')));
    await until(() => shown.length === 1);
    expect(shown[0]!.labels).toEqual(['Compare With…', '—', 'Close', 'Close Others']);
    expect(shown[0]!.items.find((i) => i.id === 'close-others')!.disabled).toBeFalsy();
    expect(shown[0]!.items.find((i) => i.id === 'compare-with')!.disabled).toBeFalsy();
    choose('compare-with');
    await until(() => palette().open);
    expect(placeholder()).toBe('Compare params.sldd with…');
    expect(paletteRows()[0]!.category).toBe(at('b/params.sldd'));
    palette().close();
  });

  it('opens from the keyboard with the keyboard on its first item', async () => {
    await twoFiles();
    const shown = recordMenu();
    const tab = tabEl(at('a/params.sldd'));
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
    await until(() => shown.length === 1);
    expect(shown[0]!.labels).toEqual(['Compare With…', '—', 'Close', 'Close Others']);
    expect(shown[0]!.options.focusFirst).toBe(true);
    menu().close();
  });

  it('offers Next and Previous Change on a compare tab, and closes it', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const shown = recordMenu();
    rightClick(tabEl(PAIR));
    await until(() => shown.length === 1);
    expect(shown[0]!.labels).toEqual(['Next Change', 'Previous Change', '—', 'Close', 'Close Others']);
    expect(shown[0]!.items.find((i) => i.id === 'next-change')!.disabled).toBeFalsy();
    choose('close-tab');
    await until(() => !tabNamed(PAIR));
    expect(tabNames()).toEqual(['params.sldd', 'params.sldd']);
  });

  // A compare tab is no file: its link is to the open files, both compared ones among them, at none.
  it("copies a link to the open files from a compare tab's menu, the compare no file of them", async () => {
    const page = await twoFiles();
    const asked: ShellLinkRequest[] = [];
    page.host.linkFor = (request) => (asked.push(request), { url: 'https://example.org/#files', left: [] });
    await compareWith(page, at('b/params.sldd'));
    const shown = recordMenu();
    rightClick(tabEl(PAIR));
    await until(() => shown.length === 1);
    expect(shown[0]!.labels).toEqual(['Next Change', 'Previous Change', '—', 'Close', 'Close Others', '—', 'Copy Link']);
    asked.length = 0;
    choose('copy-link');
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual(['https://example.org/#files']);
    expect(asked.at(-1)).toEqual({
      files: [
        { path: at('b/params.sldd'), name: 'params.sldd' },
        { path: at('a/params.sldd'), name: 'params.sldd' },
      ],
    });
  });

  it('closes the other tabs, a compare among them', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    await selectPath(at('a/params.sldd'));
    const shown = recordMenu();
    rightClick(tabEl(at('a/params.sldd')));
    await until(() => shown.length === 1);
    choose('close-others');
    await until(() => tabNames().length === 1);
    expect(tabNames()).toEqual(['params.sldd']);
    expect(tabEl(at('a/params.sldd'))).toBeTruthy();
  });

  it('acts on its next choice only', async () => {
    await twoFiles();
    const shown = recordMenu();
    rightClick(tabEl(at('a/params.sldd')));
    await until(() => shown.length === 1);
    menu().close();
    choose('close-tab');
    await settled();
    expect(tabNames()).toHaveLength(2);
  });
});

describe("the Explorer's file menu", () => {
  it("offers Compare With… for its row's file, whichever tab is active", async () => {
    await twoFiles();
    const shown = recordMenu();
    // a is the active tab; the menu is b's row's.
    const bId = [...document.querySelectorAll('dex-doc-tabs')[0]!.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((t) => t.getAttribute('title') === at('b/params.sldd'))!
      .getAttribute('data-id')!;
    explorer().dispatchEvent(new CustomEvent('dex-explorer-menu', { detail: { fileId: bId, x: 10, y: 20 }, bubbles: true, composed: true }));
    await until(() => shown.length === 1);
    expect(shown[0]!.labels).toEqual(['Save', 'Save As…', 'Compare With…', '—', 'Close']);
    choose('compare-with');
    await until(() => palette().open);
    expect(placeholder()).toBe('Compare params.sldd with…');
    // b's question lists a.
    expect(paletteRows()[0]!.category).toBe(at('a/params.sldd'));
    palette().close();
  });
});
