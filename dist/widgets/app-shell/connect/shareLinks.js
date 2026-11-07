// Copyright 2026 The MathWorks, Inc.
//
// The shell's Open from URL…, for a host that fetches files from web addresses (ShellHost.fetchUrl):
// what it asks, in the shell's own dialog, since a page has no prompt of its own and the Electron
// app's native one would not say what an address is to be. The host does the fetching, under its
// own rules (the browser host's: https:, a data file, a size and a time), and says why one was not
// fetched; the shell asks, opens the path the host answers, and says what the host said.
//
// And Copy Link, for a host that makes links (ShellHost.linkFor): what the shell asks a link of, the
// open files and the entry the link is to select, named as a link names it (linkedEntryOf, as
// openAt then finds it: a block in a subsystem by its key), and what it says once it has copied
// one. The host knows which files have an address; the shell copies what it answers. DOM-free.
import { linkedEntryOf } from './rows.js';
/** What Open from URL… asks. */
export const OPEN_URL_PROMPT = {
    title: 'Open from URL',
    message: 'The web address of a data dictionary, model or MAT-file. A file page on GitHub, or one whose address has /-/blob/ in it, works too.',
    label: 'URL',
    placeholder: 'https://',
    type: 'url',
    okLabel: 'Open',
};
/** What Copy Link says when none of the open files has an address. */
export const NO_LINK = 'None of the open files has a web address to link to.';
/** The request for a link to `files` (every open tab, pane by pane) at `tab`'s selection; at Root, `tab` is undefined. */
export function linkRequestOf(files, tab) {
    if (!tab)
        return { files };
    // The selection's first row, as the location bar and Properties take it; a section's own row, or
    // none selected, names no entry, and the link opens the file as it is.
    const rowId = tab.selection[0];
    const named = rowId === undefined ? undefined : linkedEntryOf(tab.rows, rowId);
    return { files, at: { path: tab.path, ...(named ? { entry: named.entry, ...(named.section ? { section: named.section } : {}) } : {}) } };
}
/** What Copy Link says once it has copied `link`: "Link copied", or a warning naming the files left out. */
export function copiedNote(link) {
    if (link.left.length === 0)
        return { level: 'info', text: 'Link copied' };
    return { level: 'warning', text: `Link copied. Left out, having no web address: ${link.left.join(', ')}` };
}
