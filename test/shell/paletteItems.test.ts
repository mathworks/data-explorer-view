// Copyright 2026 The MathWorks, Inc.
//
// The command palette's list (connect/paletteItems.ts): every toolbar action, enabled exactly as
// its button is, under a name that says what it does out of the toolbar's context ("Open File…"
// for the toolbar's "Open", "New Data Dictionary…" for its "New"); a command to show each of the
// shell's views (connect/views.ts), and one to show Root's relationship graph; the panes' (Split
// Right, Move to Other Pane, and a pane's focus), each enabled as it would act now; and Settings
// and About. In the prototype's order and groups: File, then Edit as an Edit menu has it (the
// clipboard before Delete and Add Child), then View (Graph after Search, the Log before the
// Terminal, the panes' last), then Other. Each carries the chord that does the same, in the
// platform's words, and its id is the ShellCommand the shell carries out.
import { describe, expect, it } from 'vitest';
import { paletteCommands, withMatlabCommands, type CompareCommands, type FolderCommands, type PaneCommands } from '../../src/widgets/app-shell/connect/paletteItems.js';
import { SHELL_VIEWS } from '../../src/widgets/app-shell/connect/views.js';
import type { ToolbarState } from '../../src/widgets/app-shell/connect/toolbarItems.js';

const NOTHING: ToolbarState = { canNewFile: true, canOpenFolder: true, active: null, anyDirty: false, can: () => false, mac: false };

describe('paletteCommands', () => {
  it("lists the toolbar actions, the views, the graph, the panes', a compare's, Settings and About, in the prototype's order and groups", () => {
    expect(paletteCommands(NOTHING).map((c) => [c.id, c.label, c.category])).toEqual([
      ['new-file', 'New Data Dictionary…', 'File'],
      ['open-file', 'Open File…', 'File'],
      ['open-folder', 'Open Folder…', 'File'],
      ['save', 'Save', 'File'],
      ['save-as', 'Save As…', 'File'],
      ['save-all', 'Save All', 'File'],
      ['close-tab', 'Close Tab', 'File'],
      ['compare-with', 'Compare With…', 'File'],
      ['undo', 'Undo', 'Edit'],
      ['redo', 'Redo', 'Edit'],
      ['cut', 'Cut', 'Edit'],
      ['copy', 'Copy', 'Edit'],
      ['paste', 'Paste', 'Edit'],
      ['delete', 'Delete', 'Edit'],
      ['add-child', 'Add Child', 'Edit'],
      ['show-explorer', 'Show Explorer', 'View'],
      ['show-folder', 'Show Folder', 'View'],
      ['folder-up', 'Folder: Up One Level', 'View'],
      ['folder-refresh', 'Folder: Read Again', 'View'],
      ['show-gallery', 'Show Gallery', 'View'],
      ['show-search', 'Show Search', 'View'],
      ['show-graph', 'Show Graph', 'View'],
      ['show-properties', 'Show Properties', 'View'],
      ['show-raw', 'Show Raw View', 'View'],
      ['show-log', 'Show Log', 'View'],
      ['show-terminal', 'Show Terminal', 'View'],
      ['split-right', 'Split Right', 'View'],
      ['move-to-other-pane', 'Move to Other Pane', 'View'],
      ['focus-pane-1', 'Focus First Pane', 'View'],
      ['focus-pane-2', 'Focus Second Pane', 'View'],
      ['next-change', 'Next Change', 'View'],
      ['previous-change', 'Previous Change', 'View'],
      ['settings', 'Settings', 'Other'],
      ['about', 'About', 'Other'],
    ]);
  });

  it('lists every view the shell has, whatever its order, and each once', () => {
    const ids = paletteCommands(NOTHING).map((c) => c.id);
    for (const v of SHELL_VIEWS) expect(ids.filter((id) => id === v.command), v.view).toHaveLength(1);
  });

  it('greys the actions the toolbar greys, and no view, Settings or About', () => {
    const disabled = (state: ToolbarState) => paletteCommands(state).filter((c) => c.disabled).map((c) => c.id);
    const PANES = ['split-right', 'move-to-other-pane', 'focus-pane-1', 'focus-pane-2'];
    // With no folder shown, the Folder view's own two do nothing either; and with no file to compare
    // and no compare, a compare's three.
    const FOLDER = ['folder-up', 'folder-refresh'];
    const CHANGES = ['next-change', 'previous-change'];
    expect(disabled(NOTHING)).toEqual(['save', 'save-as', 'save-all', 'close-tab', 'compare-with', 'undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'add-child', ...FOLDER, ...PANES, ...CHANGES]);
    const editing: ToolbarState = { ...NOTHING, active: { editable: true, dirty: true }, anyDirty: true, can: (id) => id === 'undo' };
    expect(disabled(editing)).toEqual(['compare-with', 'redo', 'cut', 'copy', 'paste', 'delete', 'add-child', ...FOLDER, ...PANES, ...CHANGES]);
  });

  it("enables the Folder view's commands as each would act now, and names Read Again for what ⟳ does", () => {
    const folder = (f: FolderCommands) =>
      paletteCommands(NOTHING, undefined, f)
        .filter((c) => c.id.startsWith('folder-'))
        .map((c) => [c.id, c.label, !!c.disabled]);
    expect(folder({ shown: true, canUp: true, refresh: 'read' })).toEqual([
      ['folder-up', 'Folder: Up One Level', false],
      ['folder-refresh', 'Folder: Read Again', false],
    ]);
    // A browser's picked folder: nothing above it, and only picked again.
    expect(folder({ shown: true, canUp: false, refresh: 'pick' })).toEqual([
      ['folder-up', 'Folder: Up One Level', true],
      ['folder-refresh', 'Folder: Pick Again', false],
    ]);
  });

  it("enables each of the panes' commands as it would act now", () => {
    const disabled = (panes: PaneCommands) =>
      paletteCommands(NOTHING, panes)
        .filter((c) => c.disabled && /pane|split/.test(c.id))
        .map((c) => c.id);
    // One pane of two tabs: the active tab can make the other pane.
    expect(disabled({ splitRight: true, moveToOther: true, panes: 1 })).toEqual(['focus-pane-2']);
    // Two panes, the right one's tab active: nothing is to its right.
    expect(disabled({ splitRight: false, moveToOther: true, panes: 2 })).toEqual(['split-right']);
    // Nothing open.
    expect(disabled({ splitRight: false, moveToOther: false, panes: 0 })).toEqual(['split-right', 'move-to-other-pane', 'focus-pane-1', 'focus-pane-2']);
  });

  it("enables a compare's commands as each would act now", () => {
    const disabled = (compare: CompareCommands) =>
      paletteCommands(NOTHING, undefined, undefined, undefined, compare)
        .filter((c) => c.disabled && /compare|change/.test(c.id))
        .map((c) => c.id);
    // A file a compare reads is active.
    expect(disabled({ canCompare: true, hasChanges: false })).toEqual(['next-change', 'previous-change']);
    // A compare tab with a difference in it is active.
    expect(disabled({ canCompare: false, hasChanges: true })).toEqual(['compare-with']);
    // F7 and Shift+F7, named for the platform.
    const shortcut = (mac: boolean) => Object.fromEntries(paletteCommands({ ...NOTHING, mac }).map((c) => [c.id, c.shortcut]));
    expect([shortcut(false)['next-change'], shortcut(false)['previous-change']]).toEqual(['F7', 'Shift+F7']);
    expect(shortcut(true)['previous-change']).toBe('⇧F7');
  });

  it("names each command's chord for the platform, the views' and Settings' included", () => {
    const shortcut = (mac: boolean) => Object.fromEntries(paletteCommands({ ...NOTHING, mac }).map((c) => [c.id, c.shortcut]));
    expect(shortcut(false)).toMatchObject({ 'new-file': 'Ctrl+N', 'open-file': 'Ctrl+O', 'show-search': 'Ctrl+Shift+F', 'show-terminal': 'Ctrl+`', settings: 'Ctrl+,', about: undefined });
    expect(shortcut(true)).toMatchObject({ save: '⌘S', 'show-log': '⇧⌘D', 'show-raw': '⇧⌘U', 'show-terminal': '⌃`', settings: '⌘,' });
    // Root's graph: not Shift+Command+G, a browser's Find Previous on macOS.
    expect([shortcut(false)['show-graph'], shortcut(true)['show-graph']]).toEqual(['Ctrl+Shift+H', '⇧⌘H']);
    expect(shortcut(false)).toMatchObject({ 'split-right': 'Ctrl+\\', 'move-to-other-pane': undefined, 'focus-pane-1': 'Ctrl+1', 'focus-pane-2': 'Ctrl+2' });
    expect(shortcut(true)).toMatchObject({ 'split-right': '⌘\\', 'focus-pane-2': '⌘2' });
  });

  it('lists the Folder view only where the shell has it, as it was connected, whatever the host offers now', () => {
    const ids = (view: boolean, canOpenFolder: boolean) =>
      paletteCommands({ ...NOTHING, canOpenFolder }, undefined, { view, shown: true, canUp: true, refresh: 'read' }).map((c) => c.id);
    // A host that showed no folders when the shell was connected, and offers Open Folder since.
    expect(ids(false, true)).toContain('open-folder');
    for (const id of ['show-folder', 'folder-up', 'folder-refresh']) expect(ids(false, true), id).not.toContain(id);
    // One that did, and offers none now: the view is there still.
    for (const id of ['show-folder', 'folder-up', 'folder-refresh']) expect(ids(true, false), id).toContain(id);
  });

  it('offers no Folder, and no Folder view, to a host without one', () => {
    const ids = paletteCommands({ ...NOTHING, canOpenFolder: false }, undefined, { shown: true, canUp: true, refresh: 'read' }).map((c) => c.id);
    for (const id of ['open-folder', 'show-folder', 'folder-up', 'folder-refresh']) expect(ids, id).not.toContain(id);
  });

  it('offers no New to a host that makes no file', () => {
    expect(paletteCommands({ ...NOTHING, canNewFile: false }).map((c) => c.id)).not.toContain('new-file');
  });

  it("has one command for each of the shell's views", () => {
    expect(SHELL_VIEWS.map((v) => v.command)).toEqual(SHELL_VIEWS.map((v) => `show-${v.view}`));
  });
});

describe("paletteCommands' host commands", () => {
  const ids = (commands: { id: string }[]) => commands.map((c) => c.id);
  const file = (state: ToolbarState, host?: Parameters<typeof paletteCommands>[3]) =>
    paletteCommands(state, undefined, undefined, host).filter((c) => c.category === 'File');

  it('lists none without them, as before', () => {
    expect(paletteCommands(NOTHING, undefined, undefined, { openUrl: false, copyLink: null })).toEqual(paletteCommands(NOTHING));
  });

  it('puts Open from URL… after Open Folder…, or after Open File… with no folder', () => {
    const row = (state: ToolbarState) => file(state, { openUrl: true, copyLink: null });
    expect(ids(row(NOTHING)).slice(0, 4)).toEqual(['new-file', 'open-file', 'open-folder', 'open-url']);
    expect(row(NOTHING).find((c) => c.id === 'open-url')).toEqual({ id: 'open-url', label: 'Open from URL…', category: 'File' });
    expect(ids(row({ ...NOTHING, canOpenFolder: false })).slice(0, 3)).toEqual(['new-file', 'open-file', 'open-url']);
  });

  it("puts Copy Link last in the File group, greyed while it links no file", () => {
    const rows = file(NOTHING, { openUrl: true, copyLink: { enabled: false } });
    expect(rows.at(-1)).toEqual({ id: 'copy-link', label: 'Copy Link', category: 'File', disabled: true });
    // After the toolbar's File rows and Compare With….
    expect(ids(rows).slice(-3)).toEqual(['close-tab', 'compare-with', 'copy-link']);
    expect(file(NOTHING, { openUrl: false, copyLink: { enabled: true } }).at(-1)).toEqual({ id: 'copy-link', label: 'Copy Link', category: 'File' });
  });
});

describe('withMatlabCommands', () => {
  const MATLAB = [
    { id: 'matlab-connect', label: 'Connect to MATLAB…', category: 'MATLAB' },
    { id: 'matlab-open', label: 'Open in Simulink', category: 'MATLAB' },
  ];

  it("puts a host's MATLAB group before Settings and About, after everything else", () => {
    const all = withMatlabCommands(paletteCommands(NOTHING), MATLAB).map((c) => c.id);
    expect(all.slice(-4)).toEqual(['matlab-connect', 'matlab-open', 'settings', 'about']);
    expect(all.slice(0, -4)).toEqual(paletteCommands(NOTHING).map((c) => c.id).slice(0, -2));
  });

  it('leaves the list as it was with no MATLAB group', () => {
    expect(withMatlabCommands(paletteCommands(NOTHING), [])).toEqual(paletteCommands(NOTHING));
  });
});
