// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/app-shell`: the app shell, a data explorer's window in one element, and
// everything it is made of. connectShell fills an empty <dex-app-shell> with the app (the toolbar,
// the location bar, the Explorer and the folder, the open files as tabs, the inspector, Raw,
// Search, the Gallery, the Terminal, the Log, the relationship graph, Settings, About and the
// command palette) over a host the page hands in (ShellHost: an Electron preload, or
// `data-explorer-view/browser-host` in a plain page). defineShellWidgets defines every element it
// draws. Each part is also an element of its own, with its define, for an app that lays out its
// own window: their classes, defines, details and event maps are here. The shell's internal
// elements and connectShell's pieces are not.

// The layout: the shell, the views it shows on its sides, and the actions on its bars.
export { DexAppShell, defineAppShell } from './dex-app-shell.js';
export type { AppShellEventMap, ShellActionDetail, ShellViewChangedDetail } from './dex-app-shell.js';
export { DexShellAction, DexShellView, defineShellAction, defineShellView } from './dex-shell-view.js';

// The shell's parts: the toolbar, the tab row, the location bar, the Explorer, the two popovers,
// the toasts and the confirm dialog.
export { DexToolbar, defineToolbar } from './dex-toolbar.js';
export type { ToolbarActionDetail, ToolbarEventMap, ToolbarItem } from './dex-toolbar.js';
export { DexDocTabs, defineDocTabs } from './dex-doc-tabs.js';
export type { DocTab, DocTabsEventMap, TabCloseDetail, TabMoveDetail, TabPinDetail, TabSelectDetail } from './dex-doc-tabs.js';
export { DexLocationBar, defineLocationBar } from './dex-location-bar.js';
export type { LocationBarEventMap, LocationGoDetail, LocationSegment } from './dex-location-bar.js';
export { DexExplorer, defineExplorer } from './dex-explorer.js';
export type {
  ExplorerEventMap,
  ExplorerFile,
  ExplorerGroup,
  ExplorerMenuDetail,
  ExplorerOpenDetail,
  ExplorerSection,
  ExplorerSelection,
} from './dex-explorer.js';
export { DexSettingsPanel, defineSettingsPanel } from './dex-settings-panel.js';
export type { SettingsChangeDetail, SettingsPanelEventMap } from './dex-settings-panel.js';
export { DexAboutPanel, defineAboutPanel } from './dex-about-panel.js';
export { DexToastHost, defineToastHost } from './dex-toast-host.js';
export type { Toast } from './dex-toast-host.js';
export { DexConfirmDialog, defineConfirmDialog } from './dex-confirm-dialog.js';
export type { ConfirmButton, ConfirmOptions } from './dex-confirm-dialog.js';

// The modules' views: Raw, Search, the Gallery, the relationship graph, the Terminal (a command
// window), the Log, and the command palette.
export { DexRawViewer, defineRawViewer } from './modules/dex-raw-viewer.js';
export type { RawCopyDetail, RawViewerEventMap } from './modules/dex-raw-viewer.js';
export { DexSearchPanel, defineSearchPanel } from './modules/dex-search-panel.js';
export type { SearchOpenDetail, SearchPanelEventMap, SearchQueryDetail } from './modules/dex-search-panel.js';
export { DexGalleryPanel, defineGalleryPanel } from './modules/dex-gallery-panel.js';
export type { GalleryAddDetail, GalleryPanelEventMap } from './modules/dex-gallery-panel.js';
export { DexRelationshipGraph, defineRelationshipGraph } from './modules/dex-relationship-graph.js';
export type { GraphExpandDetail, GraphOpenDetail, GraphSelectedDetail, RelationshipGraphEventMap } from './modules/dex-relationship-graph.js';
export { DexCommandWindow, defineCommandWindow } from './modules/dex-command-window.js';
export type { CommandRunDetail, CommandWindowEventMap } from './modules/dex-command-window.js';
export { DexLogPanel, defineLogPanel } from './modules/dex-log-panel.js';
export type { LogEntry, LogFilter, LogFilterChangedDetail, LogLevel, LogPanelEventMap } from './modules/dex-log-panel.js';
export { DexCommandPalette, defineCommandPalette } from './modules/dex-command-palette.js';
export type { CommandPaletteEventMap, PaletteCommand, PaletteRunDetail } from './modules/dex-command-palette.js';

// The app: every element connectShell draws defined in one call, connectShell itself, a page's
// drop of files onto the window, and the host and handle types a page drives it by.
export { defineShellWidgets } from './defineShellWidgets.js';
export { connectShell } from './connect/connectShell.js';
export { installFileDrop } from './connect/drop.js';
export type { CloseAnswer, ConnectShellOptions, ShellCommand, ShellHandle, ShellHost } from './connect/types.js';
