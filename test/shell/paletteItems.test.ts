// Copyright 2026 The MathWorks, Inc.
//
// The command palette's list (connect/paletteItems.ts): every toolbar action, enabled exactly as
// its button is, under a name that says what it does out of the toolbar's context ("Open File…"
// for the toolbar's "Open"); a command to show each of the shell's views (connect/views.ts); and
// Settings and About. Each carries the chord that does the same, in the platform's words, and its
// id is the ShellCommand the shell carries out.
import { describe, expect, it } from 'vitest';
import { paletteCommands } from '../../src/widgets/app-shell/connect/paletteItems.js';
import { SHELL_VIEWS } from '../../src/widgets/app-shell/connect/views.js';
import type { ToolbarState } from '../../src/widgets/app-shell/connect/toolbarItems.js';

const NOTHING: ToolbarState = { canOpenFolder: true, active: null, anyDirty: false, can: () => false, mac: false };

describe('paletteCommands', () => {
  it('lists the toolbar actions, the views, Settings and About, in that order, each in its group', () => {
    expect(paletteCommands(NOTHING).map((c) => [c.id, c.label, c.category])).toEqual([
      ['open-file', 'Open File…', 'File'],
      ['open-folder', 'Open Folder…', 'File'],
      ['save', 'Save', 'File'],
      ['save-as', 'Save As…', 'File'],
      ['save-all', 'Save All', 'File'],
      ['close-tab', 'Close Tab', 'File'],
      ['undo', 'Undo', 'Edit'],
      ['redo', 'Redo', 'Edit'],
      ['add-child', 'Add Child', 'Edit'],
      ['cut', 'Cut', 'Edit'],
      ['copy', 'Copy', 'Edit'],
      ['paste', 'Paste', 'Edit'],
      ['delete', 'Delete', 'Edit'],
      ['show-explorer', 'Show Explorer', 'View'],
      ['show-gallery', 'Show Gallery', 'View'],
      ['show-search', 'Show Search', 'View'],
      ['show-properties', 'Show Properties', 'View'],
      ['show-raw', 'Show Raw', 'View'],
      ['show-terminal', 'Show Terminal', 'View'],
      ['show-log', 'Show Log', 'View'],
      ['settings', 'Settings', 'Preferences'],
      ['about', 'About', 'Help'],
    ]);
  });

  it('greys the actions the toolbar greys, and no view, Settings or About', () => {
    const disabled = (state: ToolbarState) => paletteCommands(state).filter((c) => c.disabled).map((c) => c.id);
    expect(disabled(NOTHING)).toEqual(['save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut', 'copy', 'paste', 'delete']);
    const editing: ToolbarState = { ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true, can: (id) => id === 'undo' };
    expect(disabled(editing)).toEqual(['redo', 'add-child', 'cut', 'copy', 'paste', 'delete']);
  });

  it("names each command's chord for the platform, the views' and Settings' included", () => {
    const shortcut = (mac: boolean) => Object.fromEntries(paletteCommands({ ...NOTHING, mac }).map((c) => [c.id, c.shortcut]));
    expect(shortcut(false)).toMatchObject({ 'open-file': 'Ctrl+O', 'show-search': 'Ctrl+Shift+F', 'show-terminal': 'Ctrl+`', settings: 'Ctrl+,', about: undefined });
    expect(shortcut(true)).toMatchObject({ save: '⌘S', 'show-log': '⇧⌘D', settings: '⌘,' });
  });

  it('offers no Folder to a host without one', () => {
    expect(paletteCommands({ ...NOTHING, canOpenFolder: false }).map((c) => c.id)).not.toContain('open-folder');
  });

  it("has one command for each of the shell's views", () => {
    expect(SHELL_VIEWS.map((v) => v.command)).toEqual(SHELL_VIEWS.map((v) => `show-${v.view}`));
  });
});
