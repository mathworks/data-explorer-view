// Copyright 2026 The MathWorks, Inc.
//
// The Gallery view's wiring: <dex-gallery-panel> shows the Add gallery's tiles for the active file,
// as its table's view says it can take them (TableView.add, addSections: a dictionary's every tile,
// a MAT-file's or a model's own classes, a model's configuration sets beside them), headed with the
// file's name, and greyed for no file or one the page does not edit, which its note names. A tile
// pressed adds one entry to that file, as the table's own `+ Add` does: through the document's
// source, its Name open for a rename once it is there; one that fails says why. connectShell calls
// refresh() as the active tab or its view changes.
const message = (err) => (err instanceof Error ? err.message : String(err));
/** Wire `panel` to the active file (`target()`, null for none); refresh() draws it as it is now. */
export function connectGalleryPane(panel, context) {
    // The panel's own note, what to open, for no file and for one that has not said why.
    const opening = panel.note;
    const refresh = () => {
        const target = context.target();
        panel.target = target?.name ?? '';
        panel.disabled = !target?.editable;
        panel.note = target?.note ?? opening;
        panel.classes = target?.view?.add?.classes ?? null;
        panel.sections = target?.view?.addSections ?? null;
    };
    // The panel sends nothing while disabled; the file is asked again, as the press may come after
    // a change the panel was not yet redrawn for.
    const onAdd = (e) => {
        const target = context.target();
        if (!target?.editable)
            return;
        // A cell editor's commit refused before it, or the add itself: said, not left unhandled.
        const failed = (err) => context.failed(`Could not add to ${target.name}: ${message(err)}`);
        try {
            void Promise.resolve(target.add({ className: e.detail.className, section: e.detail.section, rename: true })).catch(failed);
        }
        catch (err) {
            failed(err);
        }
    };
    panel.addEventListener('dex-gallery-add', onAdd);
    refresh();
    return {
        refresh,
        dispose() {
            panel.removeEventListener('dex-gallery-add', onAdd);
        },
    };
}
