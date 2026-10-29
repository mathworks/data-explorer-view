// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/serve`: the host's ends of the wire, for the process that holds a folder's
// files or a document and draws nothing (Electron's main process, a worker): serveFolder and
// serveTable, the uri a file is listed under, a listing from core's `listFolder`, and the ports a
// channel comes in.
//
// Nothing here imports anything at run time but these few modules of the model, none of which
// imports core (test/entries.test.ts holds the built entry to that), so a main process that
// bundles it bundles a few kilobytes. `./model` has the names both ends of a channel use (the
// wire's messages, `sourceUri` and `uriPath`, `portFromMessagePort`); the rest are here alone.
//
// Not `./host`: that entry is the VS Code extension's host plumbing for its webviews (the
// document registry over core's module-level session, the answers posted to a webview), and it
// loads core.
export { serveFolder } from '../model/source/serveFolder.js';
export { serveTable } from '../model/source/serveTable.js';
export { listedFiles } from '../model/hierarchy/folderList.js';
export { sourceUri, uriPath } from '../model/source/sourceUri.js';
export { portFromMainPort, portFromMessagePort } from '../model/source/ports.js';
