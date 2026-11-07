// Copyright 2026 The MathWorks, Inc.
//
// A tab's menu: what a right-click on a tab, or Shift+F10 or the ContextMenu key on it, shows
// (the tab row's `dex-tab-menu`, heard on the documents' area, where every pane's row is): for that
// tab, whichever is active, Compare With… on a file's tab (greyed for a file no compare reads: a
// project, one that could not be read) or Next and Previous Change on a compare tab; Close and Close
// Others (the others of its own pane, as an editor group's Close Others closes); and for a host that
// makes links, Copy Link at that tab's selection. A menu a key asked for takes the keyboard. Each
// item with a chord is labelled with it (keys.ts). The menu is the tables' and the Explorer's too:
// as the Explorer's file menu (fileMenu.ts), it is acted on by its next choice only, and a
// dismissal, or the menu shown again by another, ends it, so a table's Copy is never taken for a
// tab's Close.

import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { TabMenuDetail } from '../dex-doc-tabs.js';
import { shortcutOf } from './fileMenu.js';
import type { ShellTab } from './tabs.js';

/** What a tab's menu does, on the tab it was shown for. */
export interface TabMenuActions<T extends ShellTab> {
  tabOf(id: string): T | undefined;
  /** The tabs Close Others would close for `tab`: the others of its own pane. */
  others(tab: T): readonly T[];
  close(tab: T): void;
  /** Close the others of `tab`'s pane, asking once about their unsaved edits, and make `tab` the active one. */
  closeOthers(tab: T): void;
  /** Copy Link's item at `tab`, asked at each menu: null without the host's linkFor, else whether it links a file. */
  link(tab: T): { enabled: boolean } | null;
  copyLink(tab: T): void;
  /** Whether `tab` is a file a compare reads: its Compare With… is enabled. */
  comparable(tab: T): boolean;
  /** Ask which file to compare `tab`'s with (Compare With…). */
  compareWith(tab: T): void;
  /** For a compare tab, whether it has a difference to go to; null for a file's tab, which has no such items. */
  changes(tab: T): { hasChanges: boolean } | null;
  /** Go to the next (1) or previous (-1) difference of the compare tab `tab`. */
  step(tab: T, by: 1 | -1): void;
}

/** The items of `tab`'s menu. */
function itemsOf<T extends ShellTab>(tab: T, actions: TabMenuActions<T>): ContextMenuItem[] {
  const changes = actions.changes(tab);
  // A compare tab's own steps, or a file's Compare With….
  const own: ContextMenuItem[] = changes
    ? [
        { id: 'next-change', label: 'Next Change', icon: 'arrowNavigationSouthUI', disabled: !changes.hasChanges, ...shortcutOf('next-change') },
        { id: 'previous-change', label: 'Previous Change', icon: 'arrowNavigationNorthUI', disabled: !changes.hasChanges, ...shortcutOf('previous-change') },
      ]
    : [{ id: 'compare-with', label: 'Compare With…', icon: 'compareUI', ...(actions.comparable(tab) ? {} : { disabled: true }) }];
  const link = actions.link(tab);
  return [
    ...own,
    { id: '', label: '', separator: true },
    { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
    { id: 'close-others', label: 'Close Others', ...(actions.others(tab).length === 0 ? { disabled: true } : {}) },
    ...(link
      ? [
          { id: '', label: '', separator: true },
          { id: 'copy-link', label: 'Copy Link', icon: 'copy', ...(link.enabled ? {} : { disabled: true }) },
        ]
      : []),
  ];
}

/** Answer the tab rows' `dex-tab-menu` (heard on `docs`, where every pane's row is) with `menu`; returns what stops it. */
export function connectTabMenu<T extends ShellTab>(docs: HTMLElement, menu: DexContextMenu, actions: TabMenuActions<T>): () => void {
  let menuFor: T | null = null;
  const onMenu = (e: CustomEvent<TabMenuDetail>): void => {
    const tab = actions.tabOf(e.detail.id);
    if (!tab) return;
    menu.show(e.detail.x, e.detail.y, itemsOf(tab, actions), { focusFirst: !!e.detail.keyboard });
    // After show(): a menu it replaced said it closed, which ends the menu before this one.
    menuFor = tab;
  };
  const onAction = (e: CustomEvent<{ actionId: string }>): void => {
    const tab = menuFor && actions.tabOf(menuFor.id) === menuFor ? menuFor : null;
    menuFor = null;
    if (!tab) return;
    switch (e.detail.actionId) {
      case 'compare-with':
        return actions.compareWith(tab);
      case 'next-change':
      case 'previous-change':
        return actions.step(tab, e.detail.actionId === 'next-change' ? 1 : -1);
      case 'close-tab':
        return actions.close(tab);
      case 'close-others':
        return actions.closeOthers(tab);
      case 'copy-link':
        return actions.copyLink(tab);
    }
  };
  const onClosed = (): void => {
    menuFor = null;
  };
  docs.addEventListener('dex-tab-menu', onMenu);
  menu.addEventListener('dex-action', onAction);
  menu.addEventListener('dex-menu-closed', onClosed);
  return () => {
    docs.removeEventListener('dex-tab-menu', onMenu);
    menu.removeEventListener('dex-action', onAction);
    menu.removeEventListener('dex-menu-closed', onClosed);
  };
}
