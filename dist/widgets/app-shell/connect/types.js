// Copyright 2026 The MathWorks, Inc.
//
// What connectShell takes and gives: the host it runs over, the commands it carries out, and the
// handle a page drives it by. One shell runs in an Electron window and in a plain browser page;
// what differs between the two is the host. Electron's preload answers every question with a
// native dialog and the disk; a browser page picks files with an <input type="file">, keeps them
// in memory, and leaves out what it cannot do (a folder, a reveal), so the shell asks its own
// in-page dialogs instead.
//
// Lifted from data-explorer-app src/shared/api.ts at 0983920: the page's half of its `window.dex`
// API, less what the app's own wiring does (its IPC channels, the menu's and the theme's events,
// the folder's port message), which a host now does through the handle.
export {};
