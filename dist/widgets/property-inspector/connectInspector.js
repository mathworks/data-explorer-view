// Copyright 2026 The MathWorks, Inc.
//
// A property inspector that follows a feed of pages: a connected table's handle (its selection,
// inspected) or the pages a host sends (inspectorFeed). It shows each page, says when there is
// nothing to show, opens the variable editor on its Value row's matrix glyph and fills it, hands a
// clicked cross-reference to the app, and hands a change of an editable row to a feed that takes
// edits (`edit`: a table's handle). The feed can change (follow()): one inspector beside several
// tables shows the active one's.
//
// The VS Code extension's inspector webview (its pi-main.ts) with the extension taken out: the
// same rules, so that the extension, which uses this over its own channel, shows its inspector as
// it did.
import { defineVariableEditor } from '../variable-editor/dex-variable-editor.js';
/**
 * Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. A
 * `null` feed starts it empty, following none until `follow()` gives it one.
 */
export function connectInspector(inspector, feed, options = {}) {
    // A table's handle has an editor of its own (TableHandle.variableEditor): share it. The one made
    // here is made when a feed without one is first followed.
    let made;
    const editorFor = (next) => {
        const shared = next.variableEditor;
        const editor = options.variableEditor ?? (typeof shared?.show === 'function' ? shared : undefined);
        if (editor)
            return editor;
        if (!made) {
            defineVariableEditor();
            made = document.createElement('dex-variable-editor');
            document.body.appendChild(made);
        }
        return made;
    };
    let following = feed;
    let variableEditor = feed ? editorFor(feed) : undefined;
    const navigate = new Set();
    // Whether the editor is open on this inspector's glyph: a new page closes only that, not a grid
    // the table beside it opened in the same editor.
    let openedHere = false;
    let disposed = false;
    // The row of the page on screen, which a change of one of its fields is an edit of.
    let shownRowId;
    const setEmpty = (isEmpty) => {
        const empty = options.empty;
        if (typeof empty === 'function')
            return empty(isEmpty);
        if (empty) {
            empty.hidden = !isEmpty;
            inspector.hidden = isEmpty;
        }
    };
    // The glyph in the Value row: the same editor, opened the same way, as the table's Value cell.
    const onOpen = (e) => {
        const detail = e.detail;
        const editor = variableEditor;
        if (!detail?.matrix || !detail.anchorEl || !following || !editor)
            return;
        const nodeId = detail.matrix.nodeId;
        if (typeof nodeId !== 'string' || nodeId === '')
            return;
        editor.show(detail.anchorEl, detail.matrix);
        openedHere = true;
        void following.matrix(nodeId).then((page) => void editor.deliver(page), () => { });
    };
    // A cross-reference: its row is in a table, which is for whoever opens documents.
    const onNavigate = (e) => {
        const target = e.detail?.sourceId;
        if (typeof target === 'string' && target !== '')
            for (const listener of [...navigate])
                listener(target);
    };
    // A change of an editable row: a cell edit of the page's row, its key the column, for the feed to
    // write back. A feed that takes no edits has pages with no editable rows, and is asked nothing.
    const onChanged = (e) => {
        const detail = e.detail;
        const feed = following;
        if (!feed?.edit || shownRowId === undefined || typeof detail?.key !== 'string' || detail.key === '')
            return;
        feed.edit({ rowId: shownRowId, columnId: detail.key, oldValue: String(detail.oldValue ?? ''), newValue: String(detail.newValue ?? '') });
    };
    inspector.addEventListener('dex-matrix-open', onOpen);
    inspector.addEventListener('dex-property-navigate', onNavigate);
    inspector.addEventListener('dex-property-changed', onChanged);
    const show = (page) => {
        // Each page replaces every row a grid opened from here was anchored to.
        if (openedHere)
            variableEditor?.close();
        openedHere = false;
        const groups = Array.isArray(page.groups) ? page.groups : [];
        const rowId = typeof page.rowId === 'string' && groups.length > 0 ? page.rowId : undefined;
        // Another row's page, with the focus still in a field (a move that blurs nothing: a menu's Back,
        // a command, a host's select): what is typed there is the row it was typed for, written to it
        // while the inspector still names that row and its feed.
        if (rowId !== shownRowId)
            inspector.commit();
        shownRowId = rowId;
        inspector.groups = groups;
        setEmpty(groups.length === 0);
    };
    setEmpty(true);
    let stop = feed ? feed.onPage(show) : () => { };
    return {
        on(_type, listener) {
            navigate.add(listener);
            return () => void navigate.delete(listener);
        },
        follow(next) {
            if (disposed || next === following)
                return;
            // What is typed in a field is the row of the feed it was typed in, written before it is left.
            inspector.commit();
            stop();
            // The rows shown, and a grid opened on one of them, are the last feed's.
            if (openedHere)
                variableEditor?.close();
            openedHere = false;
            following = next;
            if (next)
                variableEditor = editorFor(next);
            shownRowId = undefined;
            inspector.groups = [];
            setEmpty(true);
            stop = next ? next.onPage(show) : () => { };
        },
        commit() {
            if (!disposed)
                inspector.commit();
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            stop();
            inspector.removeEventListener('dex-matrix-open', onOpen);
            inspector.removeEventListener('dex-property-navigate', onNavigate);
            inspector.removeEventListener('dex-property-changed', onChanged);
            navigate.clear();
            made?.remove();
        },
    };
}
