// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/browser-host`: a ShellHost for a plain browser page, so any team's web app
// hosts the app shell (`data-explorer-view/app-shell`) with no backend: files picked, dropped,
// read, saved and watched in the browser, and a folder served in the page, with its hierarchy,
// Usage, search and project pages, as an Electron main process serves one to its window.
//
// Chromium's File System Access API is used where it is (pickers that give handles, saves in place,
// changes on disk seen); Firefox and Safari get file inputs, Save As as a download, and a folder as
// it was when picked. docs/browser-host.md has the table, and the rule every browser holds a page to:
// a file dialog, or leave to write, only after a click or a key press.
//
// ```ts
// import { connectShell, defineAppShell, installFileDrop } from 'data-explorer-view/app-shell';
// import { browserHost } from 'data-explorer-view/browser-host';
//
// defineAppShell();
// const shell = document.querySelector('dex-app-shell')!;
// const host = browserHost({
//   onFolder: (root, port) => app.showFolder(root, port),
//   onChanged: (path) => app.fileChanged(path),
// });
// const app = connectShell(shell, { host });
// installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)));
// addEventListener('beforeunload', (e) => host.edited && e.preventDefault());
// ```
//
// DOM, not lit: nothing here draws, and nothing here is a widget. It reads core through its
// browser entry only (`data-explorer-core`), and the shell's host types by type alone.

export { browserHost, LOOK_EVERY_MS } from './host.js';
export type { BrowserHost, BrowserHostOptions } from './host.js';
export { WebFiles, statOf, stampOf } from './files.js';
export type { WebFile, WebSource } from './files.js';
export { listDirectory, FOLDER_FILE_LIMIT } from './walk.js';
export type { ListedFile, WebDir, WebListing } from './walk.js';
export { dropSources } from './drop.js';
export type { DroppedItem } from './drop.js';
export { POLL_MS } from './watch.js';
