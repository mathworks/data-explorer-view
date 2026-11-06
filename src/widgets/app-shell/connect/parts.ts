// Copyright 2026 The MathWorks, Inc.
//
// What connectShell puts in the shell, and in the page beside it: the markup the Electron app's
// index.html held (data-explorer-app at 0983920), as the shell's parts. In the shell, the toolbar
// and the location bar in their rows, the Explorer view (the open files, the folder under them) and
// the Settings and About actions on the left, the documents' area in the center, the Properties view
// on the right, and the status text. In the body, once, the overlays every part shares: the
// variable editor, the context menu, the error and confirm dialogs, the toasts and the two popovers.
//
// Its own module so that connectShell, which wires these, is not also the page's markup.

import type { DexAppShell } from '../dex-app-shell.js';
import type { DexShellAction, DexShellView } from '../dex-shell-view.js';

/** `el` with these attributes, as markup would write them: the shell reads its views' and actions' attributes. */
function withAttributes<T extends Element>(el: T, attributes: Record<string, string>): T {
  for (const [name, value] of Object.entries(attributes)) if (value) el.setAttribute(name, value);
  return el;
}

/** Make a `<dex-shell-view>` for `side`, its activity button drawn from `icon`, `label` and `shortcut`. */
function view(side: 'left' | 'right', id: string, label: string, icon: string, shortcut: string): DexShellView {
  return withAttributes(document.createElement('dex-shell-view'), { side, view: id, label, icon, shortcut });
}

/** Make a `<dex-shell-action>` on the left bar. */
function action(id: string, label: string, icon: string, shortcut = ''): DexShellAction {
  return withAttributes(document.createElement('dex-shell-action'), { side: 'left', action: id, label, icon, shortcut });
}

/** The parts connectShell builds, as it wires them; `remove()` takes every one of them away again. */
export type ShellParts = ReturnType<typeof buildShell>;

/**
 * Fill `shell` with the app's parts, and put the shared overlays in the body. `canOpenFolder`: the
 * host shows folders, so the welcome offers Open Folder….
 */
export function buildShell(shell: DexAppShell, options: { appName: string; canOpenFolder: boolean }) {
  const toolbar = document.createElement('dex-toolbar');
  toolbar.slot = 'toolbar';
  toolbar.label = options.appName;
  const location = document.createElement('dex-location-bar');
  location.slot = 'location';

  // The open files, and under them the folder, once one is shown.
  const explorerView = view('left', 'explorer', 'Explorer', 'filesSB', 'Mod+Shift+E');
  const explorer = document.createElement('dex-explorer');
  const folderPart = document.createElement('dex-shell-folder');
  folderPart.hidden = true;
  const tree = document.createElement('dex-hierarchy');
  folderPart.append(tree);
  explorerView.append(explorer, folderPart);

  const docs = document.createElement('dex-shell-docs');
  docs.canOpenFolder = options.canOpenFolder;
  const strip = document.createElement('dex-doc-tabs');
  strip.slot = 'tabs';
  docs.append(strip);

  // The inspector, and the note it shows in its place while it has nothing to show.
  const propertiesView = view('right', 'properties', 'Properties', 'propertyInspectorSB', 'Mod+Shift+I');
  const inspectorEmpty = document.createElement('dex-shell-note');
  inspectorEmpty.className = 'dex-inspector-empty';
  inspectorEmpty.textContent = 'Select an entry to view its properties.';
  const inspector = document.createElement('dex-property-inspector');
  propertiesView.append(inspectorEmpty, inspector);

  const status = document.createElement('span');
  status.slot = 'status';

  const children = [
    toolbar,
    location,
    explorerView,
    action('settings', 'Settings', 'settings', 'Mod+,'),
    action('about', 'About', 'info'),
    docs,
    propertiesView,
    status,
  ];
  shell.append(...children);

  // One variable editor, one context menu and one error dialog, for every table and the inspector.
  // The confirm dialog last: where both dialogs are open, the one later in the body is on top.
  const editor = document.createElement('dex-variable-editor');
  const menu = document.createElement('dex-context-menu');
  const dialog = document.createElement('dex-error-dialog');
  const toasts = document.createElement('dex-toast-host');
  const settingsPanel = document.createElement('dex-settings-panel');
  const aboutPanel = document.createElement('dex-about-panel');
  const confirm = document.createElement('dex-confirm-dialog');
  const overlays = [editor, menu, dialog, toasts, settingsPanel, aboutPanel, confirm];
  document.body.append(...overlays);

  return {
    toolbar,
    location,
    explorer,
    folderPart,
    tree,
    docs,
    strip,
    inspectorEmpty,
    inspector,
    status,
    editor,
    menu,
    dialog,
    toasts,
    settingsPanel,
    aboutPanel,
    confirm,
    /** Take the parts out of the shell and the overlays out of the body. */
    remove(): void {
      for (const el of [...children, ...overlays]) el.remove();
    },
  };
}
