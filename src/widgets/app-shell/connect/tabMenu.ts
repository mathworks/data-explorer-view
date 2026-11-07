// Copyright 2026 The MathWorks, Inc.
//
// A tab's menu: a right-click on a tab, or Shift+F10 or the ContextMenu key on the focused one, asks
// for it (<dex-doc-tabs>'s `dex-tab-menu`), and the shared context menu shows what can be done to
// that tab, whichever is active. A file's tab offers Compare With… (greyed for a file no compare
// reads: a project, one that could not be read); a compare tab Next and Previous Change; every tab
// Close, and Close Others. Each item with a chord is labelled with it (keys.ts), as the Explorer's
// file menu labels its items.
//
// The menu is the tables' and the Explorer's too: it is acted on by its next choice only, and a
// dismissal, or the menu shown again by another part (which says this one closed first), ends it,
// so a table's Copy is never taken for a tab's Close. Opened by a key, it takes the keyboard.

import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { ContextMenuItem } from '../../context-menu/dex-context-menu.js';
import { shortcutOf } from './fileMenu.js';
import type { ShellTab } from './tabs.js';

/** What a tab's menu does, on the tab it was shown for. */
export interface TabMenuActions<T extends ShellTab> {
  /** The open tab of a tab row's id, if it is still open. */
  tabOf(id: string): T | undefined;
  /** Every open tab, pane by pane. */
  tabs(): readonly T[];
  close(tab: T): void;
  /** Close every tab but `tab`, asking once about their unsaved edits. */
  closeOthers(tab: T): void;
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
  const own: ContextMenuItem[] = changes
    ? [
        { id: 'next-change', label: 'Next Change', icon: 'arrowNavigationSouthUI', disabled: !changes.hasChanges, ...shortcutOf('next-change') },
        { id: 'previous-change', label: 'Previous Change', icon: 'arrowNavigationNorthUI', disabled: !changes.hasChanges, ...shortcutOf('previous-change') },
      ]
    : [{ id: 'compare-with', label: 'Compare With…', icon: 'compareUI', disabled: !actions.comparable(tab) }];
  return [
    ...own,
    { id: '', label: '', separator: true },
    { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
    { id: 'close-others', label: 'Close Others', disabled: actions.tabs().length < 2 },
  ];
}

/** Answer the tab rows' `dex-tab-menu`s (heard on the documents' area, where every pane's row is) with `menu`; returns what stops it. */
export function connectTabMenu<T extends ShellTab>(docs: HTMLElement, menu: DexContextMenu, actions: TabMenuActions<T>): () => void {
  let menuFor: T | null = null;
  const onMenu = (e: HTMLElementEventMap['dex-tab-menu']): void => {
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
