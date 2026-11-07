// Copyright 2026 The MathWorks, Inc.
//
// A tab's menu: what a right-click on a tab, or Shift+F10 or the ContextMenu key on it, shows
// (the tab row's `dex-tab-menu`, heard on the documents' area, where every pane's row is): Close and
// Close Others for that tab, whichever is active, and for a host that makes links, Copy Link at that
// tab's selection. A menu a key asked for takes the keyboard. The menu is the tables' and the
// Explorer's too: as the Explorer's file menu (fileMenu.ts), it is acted on by its next choice
// only, and a dismissal, or the menu shown again by another, ends it, so a table's Copy is never
// taken for a tab's Close.

import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { TabMenuDetail } from '../dex-doc-tabs.js';
import { shortcutOf } from './fileMenu.js';
import type { ShellTab } from './tabs.js';

/** What a tab's menu does, on the tab it was shown for. */
export interface TabMenuActions<T extends ShellTab> {
  tabOf(id: string): T | undefined;
  /** Every open tab, pane by pane. */
  tabs(): readonly T[];
  close(tab: T): void;
  /** Close every tab but `tab`, asking once about their unsaved edits. */
  closeOthers(tab: T): void;
  /** Copy Link's item at `tab`, asked at each menu: null without the host's linkFor, else whether it links a file. */
  link(tab: T): { enabled: boolean } | null;
  copyLink(tab: T): void;
}

/** Answer the tab rows' `dex-tab-menu` (heard on `docs`, where every pane's row is) with `menu`; returns what stops it. */
export function connectTabMenu<T extends ShellTab>(docs: HTMLElement, menu: DexContextMenu, actions: TabMenuActions<T>): () => void {
  let menuFor: T | null = null;
  const onMenu = (e: CustomEvent<TabMenuDetail>): void => {
    const tab = actions.tabOf(e.detail.id);
    if (!tab) return;
    const link = actions.link(tab);
    const items: ContextMenuItem[] = [
      { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
      { id: 'close-others', label: 'Close Others', ...(actions.tabs().length < 2 ? { disabled: true } : {}) },
      ...(link
        ? [
            { id: '', label: '', separator: true },
            { id: 'copy-link', label: 'Copy Link', icon: 'copy', ...(link.enabled ? {} : { disabled: true }) },
          ]
        : []),
    ];
    menu.show(e.detail.x, e.detail.y, items, { focusFirst: !!e.detail.keyboard });
    // After show(): a menu it replaced said it closed, which ends the menu before this one.
    menuFor = tab;
  };
  const onAction = (e: CustomEvent<{ actionId: string }>): void => {
    const tab = menuFor && actions.tabOf(menuFor.id) === menuFor ? menuFor : null;
    menuFor = null;
    if (!tab) return;
    const id = e.detail.actionId;
    if (id === 'close-tab') actions.close(tab);
    else if (id === 'close-others') actions.closeOthers(tab);
    else if (id === 'copy-link') actions.copyLink(tab);
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
