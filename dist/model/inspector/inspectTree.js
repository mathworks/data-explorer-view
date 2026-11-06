// Copyright 2026 The MathWorks, Inc.
//
// What a document's table answers when the inspector asks about a selection (`TableSource.inspect`):
// one rule, which every document of a workspace runs over its own tree, read-only (workspace.ts) or
// edited (edit/jsonView.ts, edit/binaryView.ts, edit/matEngine.ts), as each answers the Raw pane
// through rawOfRow.
//
// Asked with no options, it is the rule the VS Code extension's inspector has: the first row of the
// selection, read-only, and nothing for a section heading or no row (InspectorSelection,
// buildPropertyGroups). Asked for `pages`, the file itself has a page (no row selected, or the
// file's own id), and so do a section heading and a selection of several rows (inspectorPages.ts).
// Asked for `editable`, a row's properties are editable where core offers an editor of them.
import { sectionByName } from 'data-explorer-core';
import { srcIdToUriString } from '../ids/srcId.js';
import { uriPathBasename } from '../ids/pathUtil.js';
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
import { uriPath } from '../source/sourceUri.js';
import { InspectorSelection } from './inspectorSelection.js';
import { fileReferences, filePropertyGroups, namesFile, rootRows, sectionPropertyGroups, selectionPropertyGroups } from './inspectorPages.js';
import { buildPropertyGroups } from './piBuilder.js';
/** The inspector's page for `selection` of the document `tree` is of: see the head of this file. Never throws. */
export function inspectTree(tree, selection, options = {}) {
    const rowIds = typeof selection === 'string' ? [selection] : [...selection];
    try {
        if (options.pages) {
            const first = rowIds[0];
            if (first === undefined || (rowIds.length === 1 && tree.fileIds.includes(first)))
                return filePage(tree);
            if (rowIds.length > 1) {
                const nodes = rowIds.filter((id) => !isSectionRowId(id)).map((id) => tree.find(id)).filter((n) => !!n);
                return { rowId: first, groups: selectionPropertyGroups(nodes, rowIds.length) };
            }
            if (isSectionRowId(first))
                return sectionPage(tree, first);
        }
        let view = { groups: [] };
        const rows = { editable: !!options.editable };
        // The inspector's own rule for which row a selection shows (the first, unless it is a section
        // heading), with this document's lookup.
        const show = { showNode: (node) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node, rows) }), clear: () => { } };
        new InspectorSelection(show, (_uri, id) => tree.find(id)).show(tree.fileIds[0] ?? '', rowIds);
        return view;
    }
    catch {
        // A tree that cannot be read (a document closed, text that does not parse) has nothing to show.
        return { groups: [] };
    }
}
/** The name of the file `tree` is of. */
const nameOf = (tree) => tree.name || uriPathBasename(tree.fileIds[0] ?? '');
/** The file's page: what it is, and the open files it references and is referenced by. */
function filePage(tree) {
    const root = tree.root();
    const uri = tree.fileIds[0];
    if (!root || uri === undefined)
        return { groups: [] };
    const name = nameOf(tree);
    // Every other open document, by its uri and name, with its tree.
    const others = (tree.sources?.getDataSourceIds() ?? [])
        .filter((id) => !tree.fileIds.includes(id))
        .map((id) => ({ uri: srcIdToUriString(id), root: tree.sources.getDataSource(id) }))
        .filter((o) => !!o.root && o.uri !== uri)
        .map((o) => ({ ...o, name: uriPathBasename(o.uri) }));
    const references = fileReferences(root).map((ref) => {
        const open = others.find((o) => namesFile(ref, o.name));
        return open ? { name: open.name, target: open.uri, state: 'Open' } : { name: ref, target: ref, state: 'Not open' };
    });
    const referencedBy = others
        .filter((o) => fileReferences(o.root).some((ref) => namesFile(ref, name)))
        .map((o) => ({ name: o.name, target: o.uri, state: 'Open' }));
    const groups = filePropertyGroups({
        name,
        path: uriPath(uri),
        modified: tree.dirty?.() ?? false,
        more: rootRows(root, (node) => buildPropertyGroups(node)),
        references,
        referencedBy,
    });
    return { rowId: uri, groups };
}
/** A section heading's page; nothing for a section the tree does not have. */
function sectionPage(tree, rowId) {
    const root = tree.root();
    const section = root ? sectionByName(root, sectionNameFromRowId(rowId)) : null;
    return section ? { rowId, groups: sectionPropertyGroups(section, nameOf(tree)) } : { groups: [] };
}
