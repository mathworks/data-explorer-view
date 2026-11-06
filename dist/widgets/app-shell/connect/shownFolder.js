// Copyright 2026 The MathWorks, Inc.
//
// The folder in the Explorer, as the shell shows one and then another in its place: the folder's
// part (its title, its note) and its tree filled from the folder read across its port (folder.ts's
// showFolder), and what listens to the folder, let go of with it. connectShell says what a chosen
// file and a change mean (a tab opened, the documents' Usage and project pages painted again, the
// Search view asked again); this keeps the folder's own half.
//
// Lifted from data-explorer-app src/renderer/app.ts at 0983920 (its showFolder), where the note
// and the title were elements of index.html, and the folder had a search box of its own, which the
// Search view stands for here.
import { showFolder } from './folder.js';
/** Show folders in `part`, with `tree` as their tree. */
export function connectShownFolder(part, tree, actions) {
    let folder;
    // What listens to the folder shown: let go of with it, when another is shown or the shell goes.
    let stops = [];
    const drop = () => {
        for (const stop of stops)
            stop();
        stops = [];
        folder?.dispose();
        folder = undefined;
    };
    return {
        get current() {
            return folder;
        },
        show(root, port) {
            drop();
            part.hidden = false;
            part.root = root;
            part.note = '';
            let note = 'No data files in this folder.';
            const shown = showFolder(tree, root, port, {
                empty: (isEmpty) => (part.note = isEmpty ? note : ''),
                open: (uri) => actions.open(uri),
                error: (text) => {
                    note = `This folder could not be read: ${text}`;
                    part.note = note;
                    actions.failed?.(text);
                },
            });
            folder = shown;
            // The folder's names are read again each time it takes a change: its tree is built again
            // once they are, which is when a search of them is asked again.
            stops = [shown.onChange((uris) => actions.changed(shown, uris)), shown.session.hierarchy.subscribe(() => actions.namesChanged?.(shown))];
            actions.shown(shown);
        },
        dispose() {
            drop();
        },
    };
}
