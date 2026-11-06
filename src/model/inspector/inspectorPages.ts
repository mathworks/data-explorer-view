// Copyright 2026 The MathWorks, Inc.
//
// The inspector's pages past one row's properties (buildPropertyGroups'), as the prototype's
// inspector had them: a page for the file itself, for a section heading, for a selection of several
// rows, and the row's Usage as a group of its own. Pure, and DOM-free: each is drawn from what it is
// handed (a node, a table cell, the facts of a file), so a document's table (inspectTree.ts) and the
// shell's relationship graph draw one file's page the same way from what each knows of it.
//
// What core offers, and what it does not. A file's root node has a property layout of its own
// (getPILayout: its name, and a dictionary's release, format and size), which the file's page
// shows; its name there is the uri core registers the tree under, so the page names the file
// itself. A section has none (its toPIObject is null): its page is drawn here, from its children.
// Neither says where the file is, whether it holds edits, nor which other files it names or is
// named by: those are the document's and the app's to say, and are handed in.
import { isMatFile, isModelFile, isProjectFile, isSlddFile, modelNameOf, normalizeRefNames, refBasename } from 'data-explorer-core';
import type { GraphBox, GraphEdgeKind, RelationshipGraph } from '../graph/graphTypes.js';
import { uriPath } from '../source/sourceUri.js';
import type { PropertyGroup, PropertyRow } from './piBuilder.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** What a file's page calls the kind of file `name` is; empty for a kind the inspector does not name. */
export function fileKindOf(name: string): string {
  if (isModelFile(name)) return 'Simulink model';
  if (isSlddFile(name)) return 'Data dictionary';
  if (isMatFile(name)) return 'MAT-file';
  if (isProjectFile(name)) return 'Project';
  return '';
}

/** Another file, as a file's page lists it among its references: its name, where a click goes, and its state. */
export interface FileLink {
  /** The file's name, as the page shows it. */
  name: string;
  /**
   * What a click on it asks to open (`dex-property-navigate`'s target): the file's uri where it is
   * known, else its name as the referencing file wrote it, which a link to a file resolves as a
   * Model Reference row's does (beside that file, or where a folder shown has it).
   */
  target: string;
  /** What the row says of it: whether it is open ('Open', 'Not open'), or was found at all ('Not found'). */
  state: string;
}

/** What a file's page says of the file. */
export interface FileFacts {
  /** Its name (`params.sldd`). */
  name: string;
  /** Where it is, as the host names it; empty where there is no file to name (a reference never found). */
  path: string;
  /** Whether it holds edits its file does not; absent for a file that is not open, which holds none. */
  modified?: boolean;
  /** Its own rows, after its name and kind: core's facts of it (a dictionary's release, format and size). */
  more?: PropertyRow[];
  /** The files it references, in the order it names them. */
  references: readonly FileLink[];
  /** The files that reference it. */
  referencedBy: readonly FileLink[];
}

const text = (name: string, value: string): PropertyRow => ({ name, value, editable: false, type: 'text' });
const link = (to: FileLink): PropertyRow => ({ name: to.name, value: to.state, editable: false, type: 'link', linkTarget: to.target });

/**
 * A file's page: General (its name, kind, core's facts of it, where it is and whether it holds
 * edits), then References and Referenced By, each file a link to it, where it has any.
 */
export function filePropertyGroups(facts: FileFacts): PropertyGroup[] {
  const kind = fileKindOf(facts.name);
  const general: PropertyRow[] = [
    text('Name', facts.name),
    ...(kind ? [text('Kind', kind)] : []),
    ...(facts.more ?? []),
    ...(facts.path ? [text('File', facts.path)] : []),
    ...(facts.modified === undefined ? [] : [text('Modified', facts.modified ? 'Yes' : 'No')]),
  ];
  const groups: PropertyGroup[] = [{ title: 'General', properties: general }];
  if (facts.references.length > 0) groups.push({ title: 'References', properties: facts.references.map(link) });
  if (facts.referencedBy.length > 0) groups.push({ title: 'Referenced By', properties: facts.referencedBy.map(link) });
  return groups;
}

/**
 * The rows of a file's root node core describes it by, past its name: a dictionary's release, file
 * format and number of entries, a model's release. Not a fact core has no value for (a .mdl's
 * release, which its text may not say). Read-only: none is an edit of the document.
 */
export function rootRows(root: any, rows: (node: any) => PropertyGroup[]): PropertyRow[] {
  return rows(root)
    .flatMap((group) => group.properties)
    .filter((row) => row.name !== 'Name' && row.value !== '')
    .map((row) => ({ ...row, editable: false }));
}

/** What an entry is, for counting a section's entries by type: a block's type, else its class. */
function typeOf(node: any): string {
  const type = node?.blockType ?? node?.className;
  return typeof type === 'string' && type !== '' ? type : 'Unknown';
}

/** `nodes` counted by their type, in the order each type is first met. */
function typeCounts(nodes: readonly unknown[]): PropertyRow[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const type = typeOf(node);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, n]) => text(type, String(n)));
}

/**
 * A section heading's page: its name, the file it is a section of and how many entries it holds,
 * then its entries counted by type (a block by its block type), where it holds any.
 */
export function sectionPropertyGroups(section: any, fileName: string): PropertyGroup[] {
  const children: unknown[] = Array.isArray(section?.children) ? section.children : [];
  const groups: PropertyGroup[] = [
    {
      title: 'General',
      properties: [text('Name', String(section?.displayName || section?.name || '')), text('File', fileName), text('Entries', String(children.length))],
    },
  ];
  if (children.length > 0) groups.push({ title: 'Entry Types', properties: typeCounts(children) });
  return groups;
}

/**
 * The page of a selection of `count` rows: how many are selected, and those of them that are
 * entries (`nodes`: a section heading is none) counted by type.
 */
export function selectionPropertyGroups(nodes: readonly unknown[], count: number): PropertyGroup[] {
  return [{ title: `${count} selected`, properties: typeCounts(nodes) }];
}

const isRecord = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * A table row's Usage cell (`UsedBy`) as a group of the inspector's, its links the cell's: for a
 * block's row, what its parameters read ("Uses": each parameter, its value a link to the variable,
 * or core's own cell before a usage graph filled it); for any other, who uses it ("Used By": each
 * block a link to it, with its path and model, or core's own list of links). Null for a cell with
 * nothing in it, which the page leaves out.
 */
export function usedByGroup(row: { UsedBy?: unknown; _isBlockRow?: boolean } | undefined): PropertyGroup | null {
  const cell = row?.UsedBy;
  const rows: PropertyRow[] = [];
  if (typeof cell === 'string') {
    if (cell !== '') rows.push(text(cell, ''));
  } else if (isRecord(cell) && 'blockLinks' in cell) {
    for (const b of Array.isArray(cell.blockLinks) ? cell.blockLinks.filter(isRecord) : []) {
      const model = str(b.modelName);
      const where = `${str(b.blockPath)}${model ? ` (${model})` : ''}`;
      const target = str(b.linkTarget);
      rows.push(target ? { name: str(b.blockName), value: where, editable: false, type: 'link', linkTarget: target } : text(str(b.blockName), where));
    }
  } else if (isRecord(cell) && 'paramLinks' in cell) {
    for (const p of Array.isArray(cell.paramLinks) ? cell.paramLinks.filter(isRecord) : []) {
      const source = str(p.source);
      const row = text(str(p.property), `${str(p.paramName)}${source ? ` (${source})` : ''}`);
      const target = str(p.linkTarget);
      rows.push(target ? { ...row, valueLink: target } : row);
    }
  } else if (isRecord(cell) && Array.isArray(cell.links)) {
    for (const l of cell.links.filter(isRecord)) {
      const target = str(l.linkTarget);
      rows.push(target ? { name: str(l.text), value: '', editable: false, type: 'link', linkTarget: target } : text(str(l.text), ''));
    }
  } else if (isRecord(cell) && typeof cell.text === 'string' && cell.text !== '') {
    const target = str(cell.linkTarget);
    rows.push(target ? { name: cell.text, value: '', editable: false, type: 'link', linkTarget: target } : text(cell.text, ''));
  }
  return rows.length > 0 ? { title: row?._isBlockRow ? 'Uses' : 'Used By', properties: rows } : null;
}

/**
 * The files a file's root node names, as it names them, each once: a model's data dictionary, its
 * External Data and its Model References (core completes a reference's extension); a dictionary's
 * references. None for a MAT-file, which names no file.
 */
export function fileReferences(root: any): string[] {
  const names: string[] = [];
  const add = (name: unknown) => {
    if (typeof name === 'string' && name !== '' && !names.some((n) => refBasename(n) === refBasename(name))) names.push(name);
  };
  if (!root) return names;
  add(root.dataDictionary);
  for (const key of ['dataSources', 'references']) {
    const section = Array.isArray(root.children) ? root.children.find((c: any) => c?.name === key) : undefined;
    for (const child of section?.children ?? []) add(child?.name);
  }
  if (root.dictionaryReferences !== undefined) for (const name of normalizeRefNames(root.dictionaryReferences)) add(name);
  return names;
}

/**
 * Whether the reference `ref` names the file `name`: by its name in any case, as core resolves a
 * reference (refBasename), and a model by its name without the extension (a model reference names
 * `.slx` where the file is `.mdl`, modelNameOf).
 */
export function namesFile(ref: string, name: string): boolean {
  if (refBasename(ref) === refBasename(name)) return true;
  const a = modelNameOf(refBasename(ref));
  return a !== null && a === modelNameOf(refBasename(name));
}

/** The edges of a relationship graph that are between files: one names the other. */
const FILE_EDGES: ReadonlySet<GraphEdgeKind> = new Set<GraphEdgeKind>(['model-ref', 'sldd-ref', 'data-link']);

/**
 * The page of the file a relationship graph's box stands for, `id` the box or an item in it: what
 * the graph knows of the file (it need not be open: the graph draws a folder's files too), its
 * References and Referenced By the boxes its edges between files reach, each a link to its file (a
 * ghost, a file referenced and not found, by the name it was referenced by). `open` says whether a
 * file is open, and holding edits. Null for an id the graph does not draw.
 */
export function graphFilePage(
  graph: RelationshipGraph,
  id: string,
  open: (uri: string) => { dirty: boolean } | undefined,
): { box: GraphBox; groups: PropertyGroup[] } | null {
  const box = graph.boxes.find((b) => b.id === id) ?? graph.boxes.find((b) => b.items.some((i) => i.id === id));
  if (!box) return null;
  const byId = new Map(graph.boxes.map((b) => [b.id, b]));
  const linkTo = (other: GraphBox): FileLink =>
    other.ghost
      ? { name: other.label, target: other.ref ?? other.label, state: 'Not found' }
      : { name: other.label, target: other.uri, state: open(other.uri) ? 'Open' : 'Not open' };
  // Each file once, in the order the graph's edges name them.
  const linked = (ends: (edge: (typeof graph.edges)[number]) => string | null): FileLink[] => {
    const seen = new Set<string>();
    const out: FileLink[] = [];
    for (const edge of graph.edges) {
      const other = FILE_EDGES.has(edge.kind) ? byId.get(ends(edge) ?? '') : undefined;
      if (!other || other === box || seen.has(other.id)) continue;
      seen.add(other.id);
      out.push(linkTo(other));
    }
    return out;
  };
  const state = box.ghost ? undefined : open(box.uri);
  const groups = filePropertyGroups({
    name: box.label,
    path: box.ghost ? '' : uriPath(box.uri),
    ...(state ? { modified: state.dirty } : {}),
    ...(box.ghost ? { more: [text('File', 'Not found')] } : {}),
    references: linked((edge) => (edge.from === box.id ? edge.to : null)),
    referencedBy: linked((edge) => (edge.to === box.id ? edge.from : null)),
  });
  return { box, groups };
}
