// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A tab's menu (connect/tabMenu.ts): the tab row asks for it (`dex-tab-menu`), and the shell shows
// Close and Close Others for that tab, whichever is active, and Copy Link at that tab's selection,
// for a host that makes links. Close Others asks once about the others' unsaved edits. The shared
// context menu is the tables' and the Explorer's too: it acts on its next choice only, so a choice
// made after another menu took its place closes nothing.
import { describe, expect, it, vi } from 'vitest';
import type { ContextMenuItem, ContextMenuShowOptions } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { ShellHost, ShellLink, ShellLinkRequest } from '../../src/widgets/app-shell/connect/types.js';
import type { DexDocTabs } from '../../src/widgets/app-shell/dex-doc-tabs.js';
import { activeTab, at, choose, dirtyTabs, docTabs, edit, open, selectRow, selectTab, settled, startPage, tabNames, until, type Page } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'shared_gain.slx': 'shared_gain.slx' };
/** The id of `name`'s tab, in whichever pane's row it is. */
const tabIdOf = (name: string) =>
  [...document.querySelectorAll<DexDocTabs>('dex-doc-tabs')].flatMap((row) => row.tabs).find((t) => (t.subtitle ?? t.label) === name)!.id;
/** The labels of `name`'s tabs, pane by pane. */
const rows = () => [...document.querySelectorAll<DexDocTabs>('dex-doc-tabs')].map((row) => row.tabs.map((t) => t.subtitle ?? t.label));
const activeName = () => activeTab()?.querySelector('.subtitle, .label')?.textContent;
const LINK: ShellLink = { url: 'https://dex.example/?files=a', left: [] };

const menuEl = () => document.querySelector('dex-context-menu')!;

/** The tab row's request for `name`'s tab's menu, and what the shared menu was shown with for it. */
function askMenu(name: string, detail: { x?: number; y?: number; keyboard?: true } = {}) {
  const menu = menuEl();
  const shown: { x: number; y: number; items: ContextMenuItem[]; options?: ContextMenuShowOptions }[] = [];
  const show = menu.show.bind(menu);
  const spy = vi.spyOn(menu, 'show').mockImplementation((x, y, items, options) => (shown.push({ x, y, items, ...(options ? { options } : {}) }), show(x, y, items, options)));
  docTabs().dispatchEvent(new CustomEvent('dex-tab-menu', { detail: { id: tabIdOf(name), x: detail.x ?? 30, y: detail.y ?? 40, ...detail }, bubbles: true, composed: true }));
  spy.mockRestore();
  return shown[0];
}
const read = (items: ContextMenuItem[]) => items.map((i) => (i.separator ? '—' : i.label));

async function twoTabs(host: Partial<ShellHost> = {}): Promise<Page> {
  const page = startPage(FILES, { host });
  await open(page, 'params.sldd', 'ParamMat.mat');
  return page;
}

describe("a tab's menu", () => {
  it('shows Close, Close Others and, for a host that makes links, Copy Link, where it was asked for', async () => {
    await twoTabs({ linkFor: () => LINK });
    const shown = askMenu('params.sldd', { x: 12, y: 34 })!;
    expect([shown.x, shown.y]).toEqual([12, 34]);
    expect(read(shown.items)).toEqual(['Close', 'Close Others', '—', 'Copy Link']);
    expect(shown.items.find((i) => i.id === 'close-tab')!.shortcut).toBeTruthy();
    // Asked by a key, the menu takes the keyboard.
    expect(askMenu('params.sldd', { keyboard: true })!.options).toEqual({ focusFirst: true });
    expect(askMenu('params.sldd')!.options).toEqual({ focusFirst: false });
    menuEl().close();
  });

  it('shows no Copy Link for a host that makes no links', async () => {
    await twoTabs();
    expect(read(askMenu('params.sldd')!.items)).toEqual(['Close', 'Close Others']);
    menuEl().close();
  });

  it('closes its own tab, though another is active', async () => {
    await twoTabs();
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    askMenu('params.sldd');
    choose('close-tab');
    await until(() => tabNames().join() === 'ParamMat.mat');
  });

  it('closes the other tabs, asking once about their unsaved edits, and makes its own tab the active one', async () => {
    const page = await twoTabs();
    await selectTab('params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    // Cancelled: every tab stays, the menu's tab active.
    page.main.closeAnswers.push('cancel');
    askMenu('ParamMat.mat');
    choose('close-others');
    await until(() => page.main.closeAsked.length === 1);
    expect(page.main.closeAsked).toEqual([['params.sldd']]);
    await settled();
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    expect(activeName()).toBe('ParamMat.mat');
    // Discarded: only the menu's tab is left.
    page.main.closeAnswers.push('discard');
    askMenu('ParamMat.mat');
    choose('close-others');
    await until(() => tabNames().join() === 'ParamMat.mat');
    expect(page.main.closeAsked).toHaveLength(2);
    // With one tab there is no other to close.
    expect(askMenu('ParamMat.mat')!.items.find((i) => i.id === 'close-others')).toMatchObject({ disabled: true });
    menuEl().close();
  });

  it("closes the other tabs of its own pane only, as an editor group's Close Others does", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat', 'shared_gain.slx');
    // shared_gain.slx into a pane of its own, on the right.
    page.command('split-right');
    await until(() => rows().length === 2);
    expect(rows()).toEqual([['params.sldd', 'ParamMat.mat'], ['shared_gain.slx']]);
    // Alone in its pane, it has no other to close.
    expect(askMenu('shared_gain.slx')!.items.find((i) => i.id === 'close-others')).toMatchObject({ disabled: true });
    menuEl().close();
    askMenu('params.sldd');
    choose('close-others');
    await until(() => !tabNames().includes('ParamMat.mat'));
    expect(rows()).toEqual([['params.sldd'], ['shared_gain.slx']]);
    await until(() => activeName() === 'params.sldd');
  });

  it("copies a link at its own tab's selection, though another tab is active", async () => {
    const asked: ShellLinkRequest[] = [];
    const page = await twoTabs({ linkFor: (request) => (asked.push(request), LINK) });
    await selectTab('params.sldd');
    await selectRow('params.sldd', 'Kp');
    await selectTab('ParamMat.mat');
    askMenu('params.sldd');
    choose('copy-link');
    await until(() => page.main.copied.length === 1);
    expect(asked.at(-1)!.at).toEqual({ path: at('params.sldd'), entry: 'Kp', section: 'Design Data' });
  });

  it('closes nothing on a choice made after another menu took its place', async () => {
    await twoTabs();
    askMenu('params.sldd');
    menuEl().show(0, 0, [{ id: 'close-tab', label: 'Something else' }]);
    choose('close-tab');
    await settled();
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    menuEl().close();
  });
});
