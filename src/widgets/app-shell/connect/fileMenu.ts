// Copyright 2026 The MathWorks, Inc.
//
// A file's menu in the Explorer: a right-click on an open file's row shows the shared context menu
// with Save, Save As and Close for that file, whichever tab is active. The menu is the tables' too:
// it is acted on by its next choice only, and a dismissal, or the menu shown again by a table (which
// says the Explorer's closed first), ends it, so a table's Copy is never taken for a file's Close.

import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexExplorer } from '../dex-explorer.js';
import type { ShellTab } from './tabs.js';

/** What the menu's items do, on the tab they were shown for. */
export interface FileMenuActions<T extends ShellTab> {
  /** The open tab of an Explorer file id, if it is still open. */
  tabOf(fileId: string): T | undefined;
  save(tab: T, as: boolean): void;
  close(tab: T): void;
}

/** Answer `explorer`'s file menus with `menu`; returns what stops it. */
export function connectFileMenu<T extends ShellTab>(explorer: DexExplorer, menu: DexContextMenu, actions: FileMenuActions<T>): () => void {
  let menuFor: T | null = null;
  const onMenu = (e: CustomEvent<{ fileId: string; x: number; y: number }>): void => {
    const tab = actions.tabOf(e.detail.fileId);
    if (!tab) return;
    const editable = !!tab.doc?.editable;
    // As the toolbar's buttons: Save for a file with edits to write, Save As for one the page edits.
    menu.show(e.detail.x, e.detail.y, [
      { id: 'save', label: 'Save', icon: 'saved', disabled: !(editable && tab.dirty) },
      { id: 'save-as', label: 'Save As…', icon: 'saveAs', disabled: !editable },
      { id: '', label: '', separator: true },
      { id: 'close-tab', label: 'Close', icon: 'close' },
    ]);
    // After show(): a menu it replaced said it closed, which ends the menu before this one.
    menuFor = tab;
  };
  const onAction = (e: CustomEvent<{ actionId: string }>): void => {
    const tab = menuFor && actions.tabOf(menuFor.id) === menuFor ? menuFor : null;
    menuFor = null;
    if (!tab) return;
    const id = e.detail.actionId;
    if (id === 'save' || id === 'save-as') actions.save(tab, id === 'save-as');
    else if (id === 'close-tab') actions.close(tab);
  };
  const onClosed = (): void => {
    menuFor = null;
  };
  explorer.addEventListener('dex-explorer-menu', onMenu);
  menu.addEventListener('dex-action', onAction);
  menu.addEventListener('dex-menu-closed', onClosed);
  return () => {
    explorer.removeEventListener('dex-explorer-menu', onMenu);
    menu.removeEventListener('dex-action', onAction);
    menu.removeEventListener('dex-menu-closed', onClosed);
  };
}
