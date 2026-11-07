// Copyright 2026 The MathWorks, Inc.
//
// Every element connectShell draws, defined in one call, for a page that connects a shell: the
// widgets a document, the folder and a project are shown in (the table, the inspector, the variable
// editor, the context menu, the error dialog, the folder's tree, a project's page); the shell's
// parts (the toolbar, the location bar, the Explorer, the tab row, the two popovers, the toasts,
// the confirm dialog, a compare's view); the modules' views (Raw, Search, the Gallery, the Terminal, the Log, the
// command palette, the relationship graph); the four internal elements connectShell builds the
// center, the folder, the empty inspector and the status from; and last the shell itself, with its views and
// actions (defineAppShell, which stays the layout's own and defines only those).
//
// Each under its default name, as connectShell makes them by those names. Calling it again does
// nothing: each define is a no-op for its own class (shared/define.ts).

import { defineContextMenu } from '../context-menu/dex-context-menu.js';
import { defineErrorDialog } from '../error-dialog/dex-error-dialog.js';
import { defineHierarchy } from '../hierarchy/dex-hierarchy.js';
import { defineProjectPage } from '../project-page/dex-project-page.js';
import { definePropertyInspector } from '../property-inspector/dex-property-inspector.js';
import { defineTreeTable } from '../tree-table/dex-tree-table.js';
import { defineVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { defineShellDocs } from './connect/dex-shell-docs.js';
import { defineShellFolder } from './connect/dex-shell-folder.js';
import { defineShellNote } from './connect/dex-shell-note.js';
import { defineShellStatus } from './connect/dex-shell-status.js';
import { defineAboutPanel } from './dex-about-panel.js';
import { defineAppShell } from './dex-app-shell.js';
import { defineCompareView } from './dex-compare-view.js';
import { defineConfirmDialog } from './dex-confirm-dialog.js';
import { defineDocTabs } from './dex-doc-tabs.js';
import { defineExplorer } from './dex-explorer.js';
import { defineLocationBar } from './dex-location-bar.js';
import { defineSettingsPanel } from './dex-settings-panel.js';
import { defineToastHost } from './dex-toast-host.js';
import { defineToolbar } from './dex-toolbar.js';
import { defineCommandPalette } from './modules/dex-command-palette.js';
import { defineCommandWindow } from './modules/dex-command-window.js';
import { defineGalleryPanel } from './modules/dex-gallery-panel.js';
import { defineLogPanel } from './modules/dex-log-panel.js';
import { defineRawViewer } from './modules/dex-raw-viewer.js';
import { defineRelationshipGraph } from './modules/dex-relationship-graph.js';
import { defineSearchPanel } from './modules/dex-search-panel.js';

/**
 * Registers every element connectShell draws, under its default name: the widgets the documents,
 * the folder and a project are shown in, the shell's parts, the modules' views, the shell's
 * internal elements, and `<dex-app-shell>` with its views and actions. Call it once before
 * connectShell; a second call does nothing.
 */
export function defineShellWidgets(): void {
  defineTreeTable();
  definePropertyInspector();
  defineVariableEditor();
  defineContextMenu();
  defineErrorDialog();
  defineHierarchy();
  defineProjectPage();
  defineToolbar();
  defineLocationBar();
  defineExplorer();
  defineDocTabs();
  defineSettingsPanel();
  defineAboutPanel();
  defineToastHost();
  defineConfirmDialog();
  defineCompareView();
  defineRawViewer();
  defineSearchPanel();
  defineGalleryPanel();
  defineCommandWindow();
  defineLogPanel();
  defineCommandPalette();
  defineRelationshipGraph();
  defineShellDocs();
  defineShellFolder();
  defineShellNote();
  defineShellStatus();
  // Last, its views and actions first within it: a page's markup is upgraded before the shell reads it.
  defineAppShell();
}
