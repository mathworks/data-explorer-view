// Copyright 2026 The MathWorks, Inc.
//
// The Raw view's wiring: <dex-raw-viewer> shows what the active document's file holds for the
// selected row, as the document answers it (TableSource.raw), and the file itself, its summary,
// with no row selected, its header naming the row or the file. connectShell calls refresh() whenever what it shows may have moved (the
// selection, the active tab, a change of the document's) and as its view comes on screen.
//
// An answer is asked for each refresh, and the last one asked is the one shown: a slow answer for
// a row the selection has moved past is dropped. A new row says it is loading while its answer
// comes; the same row asked again (after an edit) keeps its last answer up until the new one is
// there, so an edit does not flash a note. Hidden, the pane asks nothing, since a record of
// megabytes is not worth writing for nobody; it is asked again as it is shown.
import { noRaw } from '../../../model/raw/rawView.js';
const message = (err) => (err instanceof Error ? err.message : String(err));
/** Wire `viewer` to the active document; refresh() shows what it holds now. */
export function connectRawPane(viewer, context) {
    let asked = 0;
    let shownKey = null;
    const refresh = () => {
        if (!context.shown())
            return;
        const target = context.target();
        const ask = ++asked;
        if (!target) {
            shownKey = null;
            viewer.loading = false;
            viewer.raw = null;
            viewer.label = '';
            return;
        }
        const key = `${target.key}\n${target.rowId}`;
        // Named with the answer it names, so a dropped answer's name is never shown over another's.
        const show = (raw) => {
            shownKey = key;
            viewer.raw = raw;
            viewer.label = target.label ?? '';
            viewer.loading = false;
        };
        if (!target.raw)
            return show(noRaw('This file has no raw data.'));
        // A new row or file is loading; the same one asked again keeps its answer up meanwhile.
        if (key !== shownKey)
            viewer.loading = true;
        target.raw(target.rowId).then((raw) => {
            if (ask === asked)
                show(raw);
        }, (err) => {
            if (ask === asked)
                show(noRaw(message(err)));
        });
    };
    const onCopy = (e) => {
        void context.copy(e.detail.text).catch((err) => context.failed(`Could not copy the raw data: ${message(err)}`));
    };
    viewer.addEventListener('dex-raw-copy', onCopy);
    return {
        refresh,
        dispose() {
            asked++;
            viewer.removeEventListener('dex-raw-copy', onCopy);
        },
    };
}
