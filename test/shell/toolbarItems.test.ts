// Copyright 2026 The MathWorks, Inc.
//
// The shell's toolbar, as data (connect/toolbarItems.ts): which buttons, in which groups and on
// which side, after the prototype's row (Open, Folder | Save, Save As, Save All | Close, and at
// the end Undo, Redo | Add Child | Cut, Copy, Paste | Delete), with the chord each one shares
// labelled for the platform, and when each can be pressed. connectShell hands the toolbar these
// whenever what they depend on changes; this pins the rule, the element test the hand-over.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toolbarItems, type ToolbarState } from '../../src/widgets/app-shell/connect/toolbarItems.js';

const NOTHING: ToolbarState = { canOpenFolder: true, active: null, anyDirty: false, can: () => false, mac: false };
const ids = (state: ToolbarState) => toolbarItems(state).map((i) => i.id);
const enabled = (state: ToolbarState) => toolbarItems(state).filter((i) => !i.disabled).map((i) => i.id);

describe('toolbarItems', () => {
  it("lays out the prototype's row: files at the start, editing at the end, a group to each run", () => {
    const items = toolbarItems(NOTHING);
    expect(items.map((i) => [i.id, i.label, i.icon, i.group, i.align ?? 'start'])).toEqual([
      ['open-file', 'Open', 'openFolder', 'open', 'start'],
      ['open-folder', 'Folder', 'folder', 'open', 'start'],
      ['save', 'Save', 'saved', 'save', 'start'],
      ['save-as', 'Save As', 'saveAs', 'save', 'start'],
      ['save-all', 'Save All', 'save_all', 'save', 'start'],
      ['close-tab', 'Close', 'close', 'close', 'start'],
      ['undo', 'Undo', 'undo', 'history', 'end'],
      ['redo', 'Redo', 'redo', 'history', 'end'],
      ['add-child', 'Add Child', 'addBlockChild', 'add', 'end'],
      // The scissors glyph, not the menu's `cut` tile: that one is drawn in light greys with a
      // dotted line, and beside Copy's solid tile an enabled Cut read as a disabled one.
      ['cut', 'Cut', 'scissorToolUI', 'clipboard', 'end'],
      ['copy', 'Copy', 'copy', 'clipboard', 'end'],
      ['paste', 'Paste', 'paste', 'clipboard', 'end'],
      ['delete', 'Delete', 'delete', 'delete', 'end'],
    ]);
  });

  it('draws every icon from a file the package ships', () => {
    const shipped = new Set(readdirSync(join(process.cwd(), 'icons')).map((f) => f.replace(/\.svg$/, '')));
    expect(toolbarItems(NOTHING).filter((i) => !shipped.has(i.icon!)).map((i) => i.icon)).toEqual([]);
  });

  it('offers Folder only to a host that can show one', () => {
    expect(ids({ ...NOTHING, canOpenFolder: false })).not.toContain('open-folder');
    expect(ids(NOTHING)).toContain('open-folder');
  });

  it("names each button's chord in the platform's words", () => {
    const shortcut = (mac: boolean) => Object.fromEntries(toolbarItems({ ...NOTHING, mac }).map((i) => [i.id, i.shortcut]));
    expect(shortcut(false)).toEqual({
      'open-file': 'Ctrl+O',
      'open-folder': 'Ctrl+Shift+O',
      save: 'Ctrl+S',
      'save-as': 'Ctrl+Shift+S',
      'save-all': 'Ctrl+Alt+S',
      'close-tab': 'Ctrl+W',
      undo: 'Ctrl+Z',
      redo: 'Ctrl+Shift+Z',
      'add-child': undefined,
      cut: 'Ctrl+X',
      copy: 'Ctrl+C',
      paste: 'Ctrl+V',
      delete: 'Delete',
    });
    expect(shortcut(true)).toMatchObject({ 'open-file': '⌘O', 'save-as': '⇧⌘S', 'save-all': '⌥⌘S', redo: '⇧⌘Z' });
  });

  it('with nothing open, can only open', () => {
    expect(enabled(NOTHING)).toEqual(['open-file', 'open-folder']);
  });

  it('Save needs an active document the page edits, with unsaved edits; Save As, one the page edits; Close, an active tab', () => {
    const clean = { ...NOTHING, active: { editable: true, dirty: false } };
    expect(enabled(clean)).toEqual(['open-file', 'open-folder', 'save-as', 'close-tab']);
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true })).toContain('save');
    // A .mdl, or a project page: nothing to write.
    expect(enabled({ ...NOTHING, active: { editable: false, dirty: false } })).toEqual(['open-file', 'open-folder', 'close-tab']);
  });

  it('Save All needs any file with unsaved edits, the active one or not', () => {
    expect(enabled({ ...NOTHING, anyDirty: true })).toContain('save-all');
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: false }, anyDirty: true })).toEqual(['open-file', 'open-folder', 'save-as', 'save-all', 'close-tab']);
  });

  it("the editing buttons are enabled exactly when the active table's own menu item is", () => {
    const asked: string[] = [];
    const can = (id: string) => (asked.push(id), id === 'paste' || id === 'undo');
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: false }, can })).toEqual(['open-file', 'open-folder', 'save-as', 'close-tab', 'undo', 'paste']);
    expect(asked.sort()).toEqual(['addChild', 'copy', 'cut', 'delete', 'paste', 'redo', 'undo']);
  });
});
