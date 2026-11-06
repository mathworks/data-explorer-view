// Copyright 2026 The MathWorks, Inc.
//
// The shell's toolbar, as the data <dex-toolbar> draws: the prototype's row (New, Open, Folder |
// Save, Save As, Save All | Close at the start; Undo, Redo | Add Child | Cut, Copy, Paste | Delete at
// the end), each button with the chord that does the same and whether it can be pressed now. Pure:
// connectShell says what is open and what the active table can do, and hands the toolbar the items
// again whenever that changes.
//
// The editing buttons are the active table's editing menu: each is enabled exactly when the menu's
// own item is (TableHandle.can), so a button and the right-click menu never disagree, and pressing
// one runs that item (TableHandle.run). Their chords are the table's (the menu's labels), the rest
// the shell's own (keys.ts), so a tooltip names the chord that works.

import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import type { ToolbarItem } from '../dex-toolbar.js';
import { chordOf } from './keys.js';
import type { ShellCommand } from './types.js';

/** An editing menu item a toolbar button stands for, as TableHandle.can and run name it. */
export type TableActionId = 'undo' | 'redo' | 'addChild' | 'cut' | 'copy' | 'paste' | 'delete';

/** What the toolbar's buttons depend on. */
export interface ToolbarState {
  /** The host can make a new file (ShellHost.newFile): the New button is there. Absent: false. */
  canNewFile?: boolean;
  /** The host can show a folder (ShellHost.pickFolder): the Folder button is there. */
  canOpenFolder: boolean;
  /**
   * The active tab's document: whether the page edits it (Doc.editable) and whether it holds
   * unsaved edits. Null with no tab active; a tab whose document is not read yet, or a project
   * page, is one the page does not edit.
   */
  active: { editable: boolean; dirty: boolean } | null;
  /** Any open file holds unsaved edits. */
  anyDirty: boolean;
  /** Whether the active table's editing menu offers `id` now; false with no table. */
  can(id: TableActionId): boolean;
  /** The page runs on macOS: the chords are labelled ⌘S rather than Ctrl+S. */
  mac: boolean;
}

/** The chords of the buttons that are the table's editing menu, as its menu labels them. */
const TABLE_CHORDS: Partial<Record<ShellCommand, string>> = {
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  // The shell's tables answer it (connectTable's addChildChord).
  'add-child': '+',
  cut: 'Mod+X',
  copy: 'Mod+C',
  paste: 'Mod+V',
  delete: 'Delete',
};

/** Each editing button's item of the table's menu. */
const TABLE_ACTIONS: Partial<Record<ShellCommand, TableActionId>> = {
  undo: 'undo',
  redo: 'redo',
  'add-child': 'addChild',
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  delete: 'delete',
};

/** The editing menu item a toolbar button (or the command it sends) runs, or none for a command of the shell's. */
export function tableActionOf(command: ShellCommand): TableActionId | undefined {
  return TABLE_ACTIONS[command];
}

/** The toolbar's buttons for `state`, in the order they are drawn. */
export function toolbarItems(state: ToolbarState): ToolbarItem[] {
  const item = (id: ShellCommand, label: string, icon: string, group: string, disabled: boolean, align?: 'end'): ToolbarItem => {
    const chord = TABLE_CHORDS[id] ?? chordOf(id);
    return {
      id,
      label,
      icon,
      group,
      ...(chord ? { shortcut: chordLabel(parseChord(chord), state.mac) } : {}),
      disabled,
      ...(align ? { align } : {}),
    };
  };
  const { active } = state;
  const table = (id: ShellCommand, label: string, icon: string, group: string): ToolbarItem =>
    item(id, label, icon, group, !state.can(TABLE_ACTIONS[id]!), 'end');
  // The floppy turns blue while the active file holds edits it does not, as the prototype's did.
  // Blue and grey are all that tells the two apart, so on a Minimal toolbar, whose glyphs are one
  // colour, the unsaved one keeps its colours: the one icon in colour on the row.
  const save = item('save', 'Save', active?.dirty ? 'unsaved' : 'saved', 'save', !(active?.editable && active.dirty));
  return [
    // A new data dictionary, the one kind of file New makes, as the prototype's tooltip said.
    ...(state.canNewFile ? [newFile(item('new-file', 'New', 'new_server', 'open', false))] : []),
    item('open-file', 'Open', 'openFolder', 'open', false),
    ...(state.canOpenFolder ? [item('open-folder', 'Folder', 'folder', 'open', false)] : []),
    active?.dirty ? { ...save, colorful: true } : save,
    item('save-as', 'Save As', 'saveAs', 'save', !active?.editable),
    item('save-all', 'Save All', 'save_all', 'save', !state.anyDirty),
    item('close-tab', 'Close', 'close', 'close', active === null),
    table('undo', 'Undo', 'undo', 'history'),
    table('redo', 'Redo', 'redo', 'history'),
    table('add-child', 'Add Child', 'addBlockChild', 'add'),
    // The scissors alone: the `cut` tile the table's menu draws is light greys and a dotted line,
    // which beside Copy's solid tile made an enabled Cut look disabled.
    table('cut', 'Cut', 'scissorToolUI', 'clipboard'),
    table('copy', 'Copy', 'copy', 'clipboard'),
    table('paste', 'Paste', 'paste', 'clipboard'),
    table('delete', 'Delete', 'delete', 'delete'),
  ];
}

/** The New button, whose tooltip names what it makes. */
function newFile(item: ToolbarItem): ToolbarItem {
  return { ...item, title: `New Data Dictionary${item.shortcut ? ` (${item.shortcut})` : ''}` };
}

/** A tab, as the toolbar's state reads it: its document's edits, and its table's menu. */
interface StateTab {
  dirty?: boolean;
  doc?: { editable: boolean };
  handle?: { can(id: string): boolean };
}

/**
 * The toolbar's state over `active` among `tabs`, for a host that shows folders or not, on macOS or
 * not, and that makes new files or not.
 */
export function toolbarStateOf(active: StateTab | undefined, tabs: readonly StateTab[], canOpenFolder: boolean, mac: boolean, canNewFile = false): ToolbarState {
  return {
    canNewFile,
    canOpenFolder,
    active: active ? { editable: !!active.doc?.editable, dirty: !!active.dirty } : null,
    anyDirty: tabs.some((t) => t.dirty),
    can: (id) => !!active?.handle?.can(id),
    mac,
  };
}
