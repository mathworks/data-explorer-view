// Copyright 2026 The MathWorks, Inc.
//
// What connectShell puts in the shell, and in the page beside it: the markup the Electron app's
// index.html held (data-explorer-app at 0983920), as the shell's parts. In the shell, the toolbar
// and the location bar in their rows, a `<dex-shell-view>` for each of the shell's views
// (views.ts: the Explorer, with the open files and the folder under them, the Gallery and Search
// on the left; the Properties and Raw on the right; the Terminal and the Log in the bottom panel),
// the Settings and About actions on the left, the documents' area in the center (the open files'
// panels, and Root's relationship graph), and the status. In the body, once, the overlays
// every part shares: the variable editor, the context menu, the error and confirm dialogs, the
// toasts, the two popovers and the command palette.
//
// Its own module so that connectShell, which wires these, is not also the page's markup.

import type { DexAppShell } from '../dex-app-shell.js';
import type { DexShellAction, DexShellView } from '../dex-shell-view.js';
import { SHELL_VIEWS } from './views.js';

/** `el` with these attributes, as markup would write them: the shell reads its views' and actions' attributes. */
function withAttributes<T extends Element>(el: T, attributes: Record<string, string>): T {
  for (const [name, value] of Object.entries(attributes)) if (value) el.setAttribute(name, value);
  return el;
}

/** Make the `<dex-shell-view>` of the view `id` (views.ts), its activity button drawn from its icon, label and chord, holding `content`. */
function view(id: string, ...content: Element[]): DexShellView {
  const spec = SHELL_VIEWS.find((v) => v.view === id)!;
  const el = withAttributes(document.createElement('dex-shell-view'), { side: spec.side, view: id, label: spec.label, icon: spec.icon, shortcut: spec.chord });
  el.append(...content);
  return el;
}

/** Make a `<dex-shell-action>` on the left bar. */
function action(id: string, label: string, icon: string, shortcut = ''): DexShellAction {
  return withAttributes(document.createElement('dex-shell-action'), { side: 'left', action: id, label, icon, shortcut });
}

/** The parts connectShell builds, as it wires them; `remove()` takes every one of them away again. */
export type ShellParts = ReturnType<typeof buildShell>;

/** Fill `shell` with the app's parts, and put the shared overlays in the body. */
export function buildShell(shell: DexAppShell, options: { appName: string }) {
  const toolbar = document.createElement('dex-toolbar');
  toolbar.slot = 'toolbar';
  toolbar.label = options.appName;
  const location = document.createElement('dex-location-bar');
  location.slot = 'location';

  // The open files, and under them the folder, once one is shown.
  const explorer = document.createElement('dex-explorer');
  const folderPart = document.createElement('dex-shell-folder');
  folderPart.hidden = true;
  const tree = document.createElement('dex-hierarchy');
  folderPart.append(tree);
  // The modules' views: each a widget of its own, which connectShell fills.
  const gallery = document.createElement('dex-gallery-panel');
  const search = document.createElement('dex-search-panel');
  const raw = document.createElement('dex-raw-viewer');
  const terminal = document.createElement('dex-command-window');
  terminal.heading = options.appName;
  const log = document.createElement('dex-log-panel');

  const docs = document.createElement('dex-shell-docs');
  const strip = document.createElement('dex-doc-tabs');
  strip.slot = 'tabs';
  // Shown with the first file: with none, the welcome fills the center, and at Root the graph.
  strip.hidden = true;
  // The relationship graph: Root's, while files are open, in a panel of its own under the files'.
  const graphPanel = document.createElement('section');
  graphPanel.className = 'graph-panel';
  graphPanel.hidden = true;
  const graph = document.createElement('dex-relationship-graph');
  graphPanel.append(graph);
  docs.append(strip, graphPanel);

  // The inspector, and the note it shows in its place while it has nothing to show.
  const inspectorEmpty = document.createElement('dex-shell-note');
  inspectorEmpty.className = 'dex-inspector-empty';
  inspectorEmpty.textContent = 'Select an entry to view its properties.';
  const inspector = document.createElement('dex-property-inspector');

  // What the status bar says of the active file: its format's pill, and Modified.
  const status = document.createElement('dex-shell-status');
  status.slot = 'status';

  const children = [
    toolbar,
    location,
    view('explorer', explorer, folderPart),
    view('gallery', gallery),
    view('search', search),
    action('settings', 'Settings', 'settings', 'Mod+,'),
    action('about', 'About', 'info'),
    docs,
    view('properties', inspectorEmpty, inspector),
    view('raw', raw),
    view('terminal', terminal),
    view('log', log),
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
  // A modal, as the dialogs are; it closes before its command runs, so no question that command
  // asks is ever under it.
  const palette = document.createElement('dex-command-palette');
  const overlays = [editor, menu, dialog, toasts, settingsPanel, aboutPanel, confirm, palette];
  document.body.append(...overlays);

  return {
    toolbar,
    location,
    explorer,
    folderPart,
    tree,
    docs,
    strip,
    graphPanel,
    graph,
    inspectorEmpty,
    inspector,
    status,
    gallery,
    search,
    raw,
    terminal,
    log,
    palette,
    editor,
    menu,
    dialog,
    toasts,
    settingsPanel,
    aboutPanel,
    confirm,
    /** Whether a modal of the shell's is up: a question, the error dialog, the variable editor (each says `open`). */
    modalOpen(): boolean {
      return [confirm, dialog, editor].some((modal) => modal.hasAttribute('open'));
    },
    /** Take the parts out of the shell and the overlays out of the body. */
    remove(): void {
      for (const el of [...children, ...overlays]) el.remove();
    },
  };
}
