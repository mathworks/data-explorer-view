// Copyright 2026 The MathWorks, Inc.
//
// A property inspector that follows a feed of pages: a connected table's handle (its selection,
// inspected) or the pages a host sends (inspectorFeed). It shows each page, says when there is
// nothing to show, opens the variable editor on its Value row's matrix glyph and fills it, and
// hands a clicked cross-reference to the app.
//
// The VS Code extension's inspector webview (its pi-main.ts) with the extension taken out: the
// same rules, so that the extension, which uses this over its own channel, shows its inspector as
// it did.
import { defineVariableEditor } from '../variable-editor/dex-variable-editor.js';
/** Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. */
export function connectInspector(inspector, feed, options = {}) {
    // A table's handle has an editor of its own (TableHandle.variableEditor): share it.
    const shared = feed.variableEditor;
    let editor = options.variableEditor ?? (typeof shared?.show === 'function' ? shared : undefined);
    let madeEditor = false;
    if (!editor) {
        defineVariableEditor();
        editor = document.createElement('dex-variable-editor');
        document.body.appendChild(editor);
        madeEditor = true;
    }
    const variableEditor = editor;
    const navigate = new Set();
    // Whether the editor is open on this inspector's glyph: a new page closes only that, not a grid
    // the table beside it opened in the same editor.
    let openedHere = false;
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
        if (!detail?.matrix || !detail.anchorEl)
            return;
        const nodeId = detail.matrix.nodeId;
        if (typeof nodeId !== 'string' || nodeId === '')
            return;
        variableEditor.show(detail.anchorEl, detail.matrix);
        openedHere = true;
        void feed.matrix(nodeId).then((page) => void variableEditor.deliver(page), () => { });
    };
    // A cross-reference: its row is in a table, which is for whoever opens documents.
    const onNavigate = (e) => {
        const target = e.detail?.sourceId;
        if (typeof target === 'string' && target !== '')
            for (const listener of [...navigate])
                listener(target);
    };
    inspector.addEventListener('dex-matrix-open', onOpen);
    inspector.addEventListener('dex-pi-navigate', onNavigate);
    setEmpty(true);
    const stop = feed.onPage((page) => {
        // Each page replaces every row a grid opened from here was anchored to.
        if (openedHere)
            variableEditor.close();
        openedHere = false;
        const groups = Array.isArray(page.groups) ? page.groups : [];
        inspector.groups = groups;
        setEmpty(groups.length === 0);
    });
    return {
        on(_type, listener) {
            navigate.add(listener);
            return () => void navigate.delete(listener);
        },
        dispose() {
            stop();
            inspector.removeEventListener('dex-matrix-open', onOpen);
            inspector.removeEventListener('dex-pi-navigate', onNavigate);
            navigate.clear();
            if (madeEditor)
                variableEditor.remove();
        },
    };
}
