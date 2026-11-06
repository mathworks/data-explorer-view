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
import type { RawTree } from '../raw/rawOfRow.js';
import { uriPath } from '../source/sourceUri.js';
import type { InspectOptions, InspectorView } from '../source/tableSource.js';
import { InspectorSelection } from './inspectorSelection.js';
import { fileReferences, filePropertyGroups, namesFile, rootRows, sectionPropertyGroups, selectionPropertyGroups, type FileLink } from './inspectorPages.js';
import { buildPropertyGroups } from './piBuilder.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The open documents' trees, as core's session lists them: whom a file references, and who references it. */
export interface OpenSources {
  getDataSourceIds(): string[];
  getDataSource(srcId: string): unknown;
}

/** A document's tree, as `inspectTree` reads it: the Raw pane's (RawTree), and what a file's page says besides. */
export interface InspectedTree extends RawTree {
  /** The file's name (`params.sldd`). Default: the last segment of its uri (`fileIds[0]`). */
  readonly name?: string;
  /**
   * The session the document's tree is registered in, which every open document of its workspace
   * shares: the files its page lists as open. Absent: it lists none open, and no file as
   * referencing it.
   */
  readonly sources?: OpenSources;
  /** Whether the document holds edits its file does not. Absent: it never does (a read-only document). */
  dirty?(): boolean;
}

/** The inspector's page for `selection` of the document `tree` is of: see the head of this file. Never throws. */
export function inspectTree(tree: InspectedTree, selection: string | readonly string[], options: InspectOptions = {}): InspectorView {
  const rowIds = typeof selection === 'string' ? [selection] : [...selection];
  try {
    if (options.pages) {
      const first = rowIds[0];
      if (first === undefined || (rowIds.length === 1 && tree.fileIds.includes(first))) return filePage(tree, options.fileTitle);
      if (rowIds.length > 1) {
        const nodes = rowIds.filter((id) => !isSectionRowId(id)).map((id) => tree.find(id)).filter((n) => !!n);
        return { rowId: first, groups: selectionPropertyGroups(nodes, rowIds.length) };
      }
      if (isSectionRowId(first)) return sectionPage(tree, first);
    }
    let view: InspectorView = { groups: [] };
    const rows = { editable: !!options.editable };
    // The inspector's own rule for which row a selection shows (the first, unless it is a section
    // heading), with this document's lookup.
    const show = { showNode: (node: unknown) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node, rows) }), clear: () => {} };
    new InspectorSelection(show, (_uri, id) => tree.find(id)).show(tree.fileIds[0] ?? '', rowIds);
    return view;
  } catch {
    // A tree that cannot be read (a document closed, text that does not parse) has nothing to show.
    return { groups: [] };
  }
}

/** The name of the file `tree` is of. */
const nameOf = (tree: InspectedTree): string => tree.name || uriPathBasename(tree.fileIds[0] ?? '');

/** The file's page: what it is, where (`title`, the host's words for its path, or the path), and the open files it references and is referenced by. */
function filePage(tree: InspectedTree, title?: string): InspectorView {
  const root = tree.root() as any;
  const uri = tree.fileIds[0];
  if (!root || uri === undefined) return { groups: [] };
  const name = nameOf(tree);
  // Every other open document, by its uri and name, with its tree.
  const others = (tree.sources?.getDataSourceIds() ?? [])
    .filter((id) => !tree.fileIds.includes(id))
    .map((id) => ({ uri: srcIdToUriString(id), root: tree.sources!.getDataSource(id) }))
    .filter((o) => !!o.root && o.uri !== uri)
    .map((o) => ({ ...o, name: uriPathBasename(o.uri) }));
  const references: FileLink[] = fileReferences(root).map((ref) => {
    const open = others.find((o) => namesFile(ref, o.name));
    return open ? { name: open.name, target: open.uri, state: 'Open' } : { name: ref, target: ref, state: 'Not open' };
  });
  const referencedBy: FileLink[] = others
    .filter((o) => fileReferences(o.root).some((ref) => namesFile(ref, name)))
    .map((o) => ({ name: o.name, target: o.uri, state: 'Open' }));
  const groups = filePropertyGroups({
    name,
    path: title || uriPath(uri),
    modified: tree.dirty?.() ?? false,
    more: rootRows(root, (node) => buildPropertyGroups(node)),
    references,
    referencedBy,
  });
  return { rowId: uri, groups };
}

/** A section heading's page; nothing for a section the tree does not have. */
function sectionPage(tree: InspectedTree, rowId: string): InspectorView {
  const root = tree.root() as any;
  const section = root ? sectionByName(root, sectionNameFromRowId(rowId)!) : null;
  return section ? { rowId, groups: sectionPropertyGroups(section, nameOf(tree)) } : { groups: [] };
}
