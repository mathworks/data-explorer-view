// Copyright 2026 The MathWorks, Inc.
//
// The parts of the File System Access API the browser host uses that TypeScript's DOM types lack:
// the pickers, the permission calls and a drop's handles (Chromium's, from the WICG draft rather
// than the WHATWG standard), and a directory's entries (typed only in the DOM.AsyncIterable lib,
// which this package does not take). Each is looked for before it is used: Firefox and Safari have
// none, and the host falls back to a file input, or a drop's entries, there. And how the browser
// answers when nothing comes of a picker, or of a request a click or a key press must lead to.
//
// Lifted from data-explorer-app src/web/fsAccess.ts at b13a860, with a drop's handle call added.
/** The entries of `dir`, files and directories, in the order the browser lists them. */
export function entriesOf(dir) {
    return dir.values();
}
const nameOf = (err) => err?.name;
/**
 * Whether `err` is a picker's answer when nothing was picked: the user cancelled it (AbortError), or
 * another picker was open already (Chromium's NotAllowedError, "File picker already active").
 */
export const pickedNothing = (err) => nameOf(err) === 'AbortError' || nameOf(err) === 'NotAllowedError';
/** Whether `err` is the browser's refusal of what only a click or a key press may ask for (SecurityError). */
export const wantedGesture = (err) => nameOf(err) === 'SecurityError';
