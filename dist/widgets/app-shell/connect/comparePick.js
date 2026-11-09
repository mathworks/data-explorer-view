// Copyright 2026 The MathWorks, Inc.
//
// Compare With…'s question: which file to compare the active one with, asked in the command
// palette as a list of the other open files a compare reads (each under its path, as the host says
// it, so two files of one name are told apart), and Browse…, for one the host's picker gives. A
// row's id says what was picked (`pick:<tab id>`, `pick:browse`), so the palette's run of it is told
// from a command's.
/** What a picked row's id begins with: `pick:<tab id>`, or `pick:browse`. */
export const PICK_PREFIX = 'pick:';
/** Whether `tab` is a file a compare reads: read, shown in a table, not a project, not a comparison. */
export function comparable(tab) {
    return !tab.compare && !!tab.doc && tab.doc.kind !== 'project' && !!tab.handle?.view;
}
/** Compare With…'s rows: each other open file a compare reads (its name, its path as the host says it as the category), then Browse…. */
export function compareChoices(from, tabs, titleOf) {
    return [
        ...tabs.filter((t) => t !== from && comparable(t)).map((t) => ({ id: `${PICK_PREFIX}${t.id}`, label: t.name, category: titleOf(t.path) })),
        { id: `${PICK_PREFIX}browse`, label: 'Browse…', category: 'Open a file to compare with' },
    ];
}
