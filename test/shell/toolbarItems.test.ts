// Copyright 2026 The MathWorks, Inc.
//
// The shell's toolbar, as data (connect/toolbarItems.ts): which buttons, in which groups and on
// which side, after the prototype's row (New, Open, Folder | Save, Save As, Save All | Close, and at
// the end Undo, Redo | Add Child | Cut, Copy, Paste | Delete), with the chord each one shares
// labelled for the platform, and when each can be pressed. connectShell hands the toolbar these
// whenever what they depend on changes; this pins the rule, the element test the hand-over.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toolbarItems, type ToolbarState } from '../../src/widgets/app-shell/connect/toolbarItems.js';

const NOTHING: ToolbarState = { canNewFile: true, canOpenFolder: true, active: null, anyDirty: false, can: () => false, mac: false };
const ids = (state: ToolbarState) => toolbarItems(state).map((i) => i.id);
const enabled = (state: ToolbarState) => toolbarItems(state).filter((i) => !i.disabled).map((i) => i.id);

describe('toolbarItems', () => {
  it("lays out the prototype's row: files at the start, editing at the end, a group to each run", () => {
    const items = toolbarItems(NOTHING);
    expect(items.map((i) => [i.id, i.label, i.icon, i.group, i.align ?? 'start'])).toEqual([
      ['new-file', 'New', 'new_server', 'open', 'start'],
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

  it('draws every icon from a file the package ships, in every state', () => {
    const shipped = new Set(readdirSync(join(process.cwd(), 'icons')).map((f) => f.replace(/\.svg$/, '')));
    const dirty = { ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true };
    for (const state of [NOTHING, dirty]) expect(toolbarItems(state).filter((i) => !shipped.has(i.icon!)).map((i) => i.icon)).toEqual([]);
  });

  it("draws Save as unsaved while the active document holds unsaved edits, as the prototype's did", () => {
    const icon = (state: ToolbarState) => toolbarItems(state).find((i) => i.id === 'save')!.icon;
    expect(icon(NOTHING)).toBe('saved');
    expect(icon({ ...NOTHING, active: { editable: true, dirty: false }, anyDirty: true })).toBe('saved');
    expect(icon({ ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true })).toBe('unsaved');
  });

  it('keeps the unsaved Save in its colours, which a Minimal toolbar would draw as the saved one', () => {
    // The two floppies are one shape in two colours: drawn in one colour, they are the same glyph.
    const colorful = (state: ToolbarState) => toolbarItems(state).filter((i) => i.colorful).map((i) => [i.id, i.icon]);
    expect(colorful(NOTHING)).toEqual([]);
    expect(colorful({ ...NOTHING, active: { editable: true, dirty: false }, anyDirty: true })).toEqual([]);
    expect(colorful({ ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true })).toEqual([['save', 'unsaved']]);
  });

  it('offers Folder only to a host that can show one', () => {
    expect(ids({ ...NOTHING, canOpenFolder: false })).not.toContain('open-folder');
    expect(ids(NOTHING)).toContain('open-folder');
  });

  it('offers New only to a host that can make a file (ShellHost.newFile), and names what it makes', () => {
    expect(ids({ ...NOTHING, canNewFile: false })[0]).toBe('open-file');
    const item = (mac: boolean) => toolbarItems({ ...NOTHING, mac }).find((i) => i.id === 'new-file')!;
    expect(item(false).title).toBe('New Data Dictionary (Ctrl+N)');
    expect(item(true).title).toBe('New Data Dictionary (⌘N)');
  });

  it("names each button's chord in the platform's words", () => {
    const shortcut = (mac: boolean) => Object.fromEntries(toolbarItems({ ...NOTHING, mac }).map((i) => [i.id, i.shortcut]));
    expect(shortcut(false)).toEqual({
      'new-file': 'Ctrl+N',
      'open-file': 'Ctrl+O',
      'open-folder': 'Ctrl+Shift+O',
      save: 'Ctrl+S',
      'save-as': 'Ctrl+Shift+S',
      'save-all': 'Ctrl+Alt+S',
      'close-tab': 'Ctrl+W',
      undo: 'Ctrl+Z',
      // As the table's menu writes it off macOS (editing-trace.json): Shift before Ctrl.
      redo: 'Shift+Ctrl+Z',
      'add-child': '+',
      cut: 'Ctrl+X',
      copy: 'Ctrl+C',
      paste: 'Ctrl+V',
      // As the table's menu writes the key: Del, and ⌫ on macOS, whose key marked delete is Backspace.
      delete: 'Del',
    });
    expect(shortcut(true)).toMatchObject({ 'new-file': '⌘N', 'open-file': '⌘O', 'save-as': '⇧⌘S', 'save-all': '⌥⌘S', redo: '⇧⌘Z', delete: '⌫' });
  });

  it("says in its tooltip what a button leaning on its icon opens, as the prototype's did, with its chord", () => {
    const titles = (mac: boolean) => Object.fromEntries(toolbarItems({ ...NOTHING, mac }).map((i) => [i.id, i.title]));
    expect(titles(false)).toMatchObject({ 'open-file': 'Open File (Ctrl+O)', 'open-folder': 'Open Folder (Ctrl+Shift+O)' });
    expect(titles(true)).toMatchObject({ 'open-file': 'Open File (⌘O)', 'open-folder': 'Open Folder (⇧⌘O)' });
    // The rest say their label, which the toolbar writes with the chord.
    expect(titles(false)).toMatchObject({ save: undefined, delete: undefined, 'add-child': undefined });
  });

  it("names the editing buttons' chords as the table's own menu labels its items", async () => {
    // What the claim at the top of toolbarItems.ts says: a tooltip and the menu item name one chord.
    const { buildContextMenuItems } = await import('../../src/widgets/tree-table/menuItems.js');
    const rows = [
      { ID: 's', parent: null, Name: { label: 'Design Data' } },
      { ID: 'a', parent: 's', Name: { label: 'A' }, _canCopy: true, _canDelete: true, _canAddChild: true },
    ];
    const menu = buildContextMenuItems({
      rows: rows as never,
      selectedRowIds: ['a'],
      anchorRowId: 'a',
      clipboard: { canPaste: true, mode: 'copy', items: [] },
      editable: true,
      hasTextView: false,
      pasteTarget: null,
      addChildChord: true,
    });
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const bar = Object.fromEntries(toolbarItems({ ...NOTHING, mac }).map((i) => [i.id, i.shortcut]));
    const byMenu = Object.fromEntries(menu.map((i) => [i.id, i.shortcut]));
    expect(['undo', 'redo', 'cut', 'copy', 'paste', 'delete'].map((id) => bar[id])).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'delete'].map((id) => byMenu[id]));
    expect(bar['add-child']).toBe(byMenu.addChild);
  });

  it('with nothing open, can only make a file and open one', () => {
    expect(enabled(NOTHING)).toEqual(['new-file', 'open-file', 'open-folder']);
  });

  it('Save needs an active document the page edits, with unsaved edits; Save As, one the page edits; Close, an active tab', () => {
    const clean = { ...NOTHING, active: { editable: true, dirty: false } };
    expect(enabled(clean)).toEqual(['new-file', 'open-file', 'open-folder', 'save-as', 'close-tab']);
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true })).toContain('save');
    // A .mdl, or a project page: nothing to write.
    expect(enabled({ ...NOTHING, active: { editable: false, dirty: false } })).toEqual(['new-file', 'open-file', 'open-folder', 'close-tab']);
  });

  it('Save All needs any file with unsaved edits, the active one or not', () => {
    expect(enabled({ ...NOTHING, anyDirty: true })).toContain('save-all');
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: false }, anyDirty: true })).toEqual(['new-file', 'open-file', 'open-folder', 'save-as', 'save-all', 'close-tab']);
  });

  it("the editing buttons are enabled exactly when the active table's own menu item is", () => {
    const asked: string[] = [];
    const can = (id: string) => (asked.push(id), id === 'paste' || id === 'undo');
    expect(enabled({ ...NOTHING, active: { editable: true, dirty: false }, can })).toEqual(['new-file', 'open-file', 'open-folder', 'save-as', 'close-tab', 'undo', 'paste']);
    expect(asked.sort()).toEqual(['addChild', 'copy', 'cut', 'delete', 'paste', 'redo', 'undo']);
  });
});
