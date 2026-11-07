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
// import { connectShell, defineShellWidgets, installFileDrop } from 'data-explorer-view/app-shell';
// import { browserHost } from 'data-explorer-view/browser-host';
//
// defineShellWidgets();
// const shell = document.querySelector('dex-app-shell')!;
// const host = browserHost({
//   onFolder: (root, port) => app.showFolder(root, port),
//   onChanged: (path) => app.fileChanged(path),
// });
// const app = connectShell(shell, { host });
// installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)));
// addEventListener('beforeunload', (e) => {
//   if (!host.edited) return;
//   e.preventDefault();
//   e.returnValue = ''; // what older browsers ask on
// });
// ```
//
// DOM, not lit: nothing here draws, and nothing here is a widget. It reads core through its
// browser entry only (`data-explorer-core`), and the shell's host types by type alone.
//
// The entry is the host and the types an app names to drive it: a folder to open (BrowserDir, a
// handle or ListedFiles), a file to add (BrowserSource) and what `host.files` answers (BrowserFile),
// what fetching web addresses answers (FetchedUrls), and the window and navigator a test may give
// (FilePickers, UserActivation). How the host lists,
// reads, watches and paces itself stays inside, free to change in a minor release.

export { browserHost } from './host.js';
export type { BrowserFiles, BrowserHost, BrowserHostOptions, FetchedUrls } from './host.js';
export type { BrowserFile, BrowserSource } from './files.js';
export type { BrowserDir, ListedFile } from './walk.js';
export type { FilePickers, FilePickerType, UserActivation } from './fsAccess.js';
