// Copyright 2026 The MathWorks, Inc.
//
// A file's menu in the Explorer: a right-click on an open file's row shows the shared context menu
// with Save, Save As and Close for that file, whichever tab is active, each labelled with the chord
// that does the same to the active tab (keys.ts, as the toolbar's tooltips name them). The menu is
// the tables' too: it is acted on by its next choice only, and a dismissal, or the menu shown again
// by a table (which says the Explorer's closed first), ends it, so a table's Copy is never taken for
// a file's Close. A connected MATLAB's commands for the file come after the file's own, a
// separator between, for a host with a MATLAB.

import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexExplorer } from '../dex-explorer.js';
import { chordOf, onMac } from './keys.js';
import { isMatlabAction, type MatlabAction } from './matlab.js';
import type { ShellTab } from './tabs.js';
import type { ShellCommand } from './types.js';

/** The menu's label of the chord of `command`, read at each menu as the platform says it. */
const shortcutOf = (command: ShellCommand): { shortcut?: string } => {
  const chord = chordOf(command);
  return chord ? { shortcut: chordLabel(parseChord(chord), onMac()) } : {};
};

/** What the menu's items do, on the tab they were shown for. */
export interface FileMenuActions<T extends ShellTab> {
  /** The open tab of an Explorer file id, if it is still open. */
  tabOf(fileId: string): T | undefined;
  save(tab: T, as: boolean): void;
  close(tab: T): void;
  /** The MATLAB items after the file's own, a separator before them; none without a MATLAB. */
  matlabItems?(tab: T): ContextMenuItem[];
  /** Carry out a MATLAB item chosen on `tab`'s file. */
  runMatlab?(tab: T, id: MatlabAction): void;
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
      { id: 'save', label: 'Save', icon: 'saved', disabled: !(editable && tab.dirty), ...shortcutOf('save') },
      { id: 'save-as', label: 'Save As…', icon: 'saveAs', disabled: !editable, ...shortcutOf('save-as') },
      { id: '', label: '', separator: true },
      { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
      ...(actions.matlabItems?.(tab) ?? []),
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
    else if (isMatlabAction(id)) actions.runMatlab?.(tab, id);
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
