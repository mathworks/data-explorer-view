// Copyright 2026 The MathWorks, Inc.
//
// What the shell says, in a toast and the Log, of an editing gesture a table ran (TableHandle's
// `ran`): the prototype's words for Copy, Cut, Paste and Delete, whichever way the gesture came (the
// toolbar, a chord, the palette, the menu). Pure: connectShell says it.
/**
 * What a table's editing gesture did, as the prototype's toasts said it: Copy and Cut, a Paste of
 * something, and Delete with how many entries it took. None for the rest, whose table shows them.
 */
export function ranNote({ actionId, count }) {
    if (actionId === 'copy')
        return 'Copied to clipboard';
    if (actionId === 'cut')
        return 'Cut to clipboard';
    if (actionId === 'paste' && count > 0)
        return 'Pasted';
    if (actionId === 'delete' && count > 0)
        return count === 1 ? 'Entry deleted' : `${count} entries deleted`;
    return undefined;
}
