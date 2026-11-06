// Copyright 2026 The MathWorks, Inc.
// The relationship graph an app draws over the files it has open: a box per model, dictionary and
// MAT-file, the blocks and variables inside them, and the edges between them. Ported from
// the prototype's RelationshipGraphBuilder, which drew the same picture off its own session.
//
// NOTHING HERE DECIDES A RELATIONSHIP. Each one is somebody else's answer, shaped:
//
//   - which file a model links (its dictionary, its other data, the models it references) and
//     which dictionary a dictionary references is core's extraction, shaped by graphSources.ts —
//     the same `buildGraphSource` the hierarchy tree draws with — and resolved to a file by the
//     tree's own rule (`RelGraph.resolveFor`: a file of the referrer's folder first, then any of
//     that name), so the graph and the tree cannot disagree about where a reference leads;
//   - which block reads which variable is core's usage index, which knows MATLAB's resolution
//     order (a mask, then the model workspace, then the dictionaries a reference chain away, then
//     the MAT-files, first hit wins). ts matched names against whatever its providers held, so a
//     workspace variable and the dictionary entry it shadows were both drawn as read.
//
// Each file is read ONCE for both: a model's one parse gives its structure (`structureFromParsed`)
// and its usage summary (`summarizeParsedModel`), a dictionary's one scan its references and its
// names, as core's cheap tier does for a folder.
//
// The graph is EVERYTHING AT ONCE, where ts built a level and expanded a node at a time: an app
// has the files, so there is nothing to wait for, and the widget shows or hides a box's items
// (`expanded`) without asking for another graph.
//
// ONE KNOWN DIVERGENCE, inherited rather than made: two dictionaries of one name in different
// folders. The file-level edge goes where the tree's rule sends it (the referrer's folder), the
// variable-level edges where core's index does, which keys dictionaries by name and keeps the last
// one given. An app showing one folder at a time never meets it.
import {
  buildUsageIndexFromSummaries,
  extractSlxStructure,
  mergeFileSummaries,
  parseModel,
  refBasename,
  scanMat,
  scanSldd,
  sourceKind,
  structureFromParsed,
  summarizeMatScan,
  summarizeParsedModel,
  summarizeSlddScan,
  type FileSummaries,
  type NodeUsage,
  type UsageIndex,
} from 'data-explorer-core';
import { RelGraph, type GraphSource } from '../hierarchy/graphModel.js';
import { buildGraphSource } from '../hierarchy/graphSources.js';
import { parseLinkTarget } from '../ids/linkTarget.js';
import { basename } from '../ids/pathUtil.js';
import { SEARCH_ICONS } from '../search/searchItems.js';
import type { RawSource } from '../usage/usageCells.js';

/** What a box stands for: a model (`.slx`, `.mdl`), a data dictionary, or a MAT-file. */
export type GraphBoxKind = 'model' | 'sldd' | 'mat';

/**
 * What an edge says.
 *
 * - `model-ref`: a model references another (a Model block).
 * - `sldd-ref`: a dictionary references another.
 * - `data-link`: a model links a dictionary or a MAT-file (its data dictionary, or external data).
 * - `param-usage`: a block's parameter reads a variable of a dictionary or a MAT-file.
 * - `ws-usage`: a block's parameter reads a variable of its own model's workspace.
 */
export type GraphEdgeKind = 'model-ref' | 'sldd-ref' | 'data-link' | 'param-usage' | 'ws-usage';

/**
 * One row inside a box: a block of a model that reads a variable, or a variable some block reads.
 *
 * `group` says where in its box it is drawn. A dictionary's and a MAT-file's items are all `data`;
 * a model's are its blocks (`data`, drawn first) and then the model-workspace variables they read
 * (`workspace`, drawn under a divider), as ts drew them.
 */
export interface GraphItem {
  /** Unique in the graph, and never a file's uri; the same item has the same id in the next graph. */
  id: string;
  /** The box it is in. */
  boxId: string;
  /** What it reads: a variable's name, a block's path in its model (just its name in the top system). */
  name: string;
  /**
   * The name its file's table selects it by (`selectByName`), which `dex-graph-open` carries: a
   * variable's name, and a block's key, its SID (its name in a file older than SIDs), since a
   * block's name is not unique in a model.
   */
  revealName: string;
  /** Its icon's id in the package's icons/ (ITEM_ICONS). */
  iconId: string;
  /** Where it is drawn in its box. */
  group: 'data' | 'workspace';
}

/** A file: given, or only referenced by one that was (a ghost). */
export interface GraphBox {
  /** A given file's uri; a ghost's own id, which is no uri. */
  id: string;
  /** The file's uri, to open it by; empty for a ghost, which is no file the app has. */
  uri: string;
  kind: GraphBoxKind;
  /** The file's name, or for a ghost the name the reference spells. */
  label: string;
  /** Referenced by a file given and not given itself: drawn dashed, with no items. */
  ghost: boolean;
  /**
   * A ghost's reference as the first file to name it wrote it (`VehicleParams.sldd`): what an app
   * resolves, as it resolves a link to a file, to find the file and open it. Absent on a file given.
   */
  ref?: string;
  /** Its blocks and variables that take part in an edge, in the order they are drawn. */
  items: GraphItem[];
}

/** A relationship, from a box or an item to another. */
export interface GraphEdge {
  /** Unique in the graph; the same edge has the same id in the next graph. */
  id: string;
  kind: GraphEdgeKind;
  /** The id of the box or item it starts at: the referrer, or the block. */
  from: string;
  /** The id of the box or item it ends at: the file referenced, or the variable read. */
  to: string;
  /** On a usage edge, the block parameter that reads the variable (`Value`, `UpperLimit`). */
  label?: string;
}

/** The boxes, models and data files alike, and the edges between them and their items. */
export interface RelationshipGraph {
  /** The given files in the order given, then the ghosts in the order first referenced. */
  boxes: GraphBox[];
  /** Between files first, by referrer; then the usages, top to bottom of the models' boxes. */
  edges: GraphEdge[];
}

/** The icon of a box of each kind: the one its row has in a folder's hierarchy. */
export const BOX_ICONS: Readonly<Record<GraphBoxKind, string>> = {
  model: 'simulink',
  sldd: 'simulink_database',
  mat: 'matlabWorkspaceFile',
};

/**
 * The icon of each kind of item. A block's is its row's in a model's table (core's block node). A
 * variable's is its search result's: the graph reads names only, not classes, so it has the same
 * per-kind icon a search over names shows rather than a class's.
 */
export const ITEM_ICONS = {
  block: 'block',
  sldd: SEARCH_ICONS.sldd,
  mat: SEARCH_ICONS.mat,
  workspace: SEARCH_ICONS.workspace,
} as const;

// Ids. A given file's box is its uri, which is what an app holds for it (`selected`, reveal()).
// Every other id is a JSON array, which no uri is (a uri starts with its scheme), so an item can
// never take a file's id, and whatever characters the names hold, no two ids are spelt alike.
const ghostId = (kind: GraphBoxKind, ref: string): string => JSON.stringify(['ghost', kind, refBasename(ref)]);
const itemId = (boxId: string, part: 'data' | 'workspace' | 'block', key: string): string =>
  JSON.stringify([boxId, part, key]);
const edgeId = (kind: GraphEdgeKind, from: string, to: string): string => JSON.stringify([kind, from, to]);

/** A file as read: its references for the tree's shaper, and its usage summary. */
interface ReadFile {
  file: RawSource;
  /** Null for a project marker, which draws no box but scopes the references around it. */
  kind: GraphBoxKind | null;
  source: GraphSource;
  /** Null when its bytes would not read: it is still a box, with no items. */
  summary: FileSummaries | null;
}

/**
 * Read one file once for both halves of the graph, or null for one of no kind the graph draws.
 *
 * A file that will not read is still a box — it is open, so the user is looking for it — and a
 * model the full parse refuses still gets its references from core's structure scan, which never
 * throws, so it keeps the edges the hierarchy tree draws for it.
 */
function readFile(file: RawSource): ReadFile | null {
  const raw = { uriString: file.uriString, path: file.path };
  switch (sourceKind(file.path)) {
    case 'model': {
      try {
        const parsed = parseModel(file.bytes, file.path);
        const source = buildGraphSource({ ...raw, structure: structureFromParsed(parsed, file.path) });
        return { file, kind: 'model', source, summary: summarizeParsedModel(parsed, file.uriString, file.path) };
      } catch {
        const source = buildGraphSource({ ...raw, structure: extractSlxStructure(file.bytes, file.path) });
        return { file, kind: 'model', source, summary: null };
      }
    }
    case 'sldd': {
      try {
        const scan = scanSldd(file.bytes);
        return {
          file,
          kind: 'sldd',
          source: buildGraphSource({ ...raw, slddRefs: scan.refs }),
          summary: summarizeSlddScan(scan, file.uriString, file.path),
        };
      } catch {
        return { file, kind: 'sldd', source: buildGraphSource(raw), summary: null };
      }
    }
    case 'mat': {
      let summary: FileSummaries | null = null;
      try {
        summary = summarizeMatScan(scanMat(file.bytes), file.uriString, file.path);
      } catch {
        /* a MAT-file that will not read: a box with no items */
      }
      return { file, kind: 'mat', source: buildGraphSource(raw), summary };
    }
    case 'prj':
      return { file, kind: null, source: buildGraphSource(raw), summary: null };
    case null:
      return null;
  }
}

/** The names a data file defines, in its own order: the one summary its part holds. */
function dataNames(read: ReadFile): string[] {
  const part = read.kind === 'sldd' ? read.summary?.slddByName : read.summary?.matByName;
  const summary = part ? [...part.values()][0] : undefined;
  return summary ? [...summary.names] : [];
}

/** The ghost kind a data-link reference names: a MAT-file or a model by its extension, else a dictionary. */
function linkedKind(ref: string): GraphBoxKind {
  const kind = sourceKind(ref);
  return kind === 'mat' || kind === 'model' ? kind : 'sldd';
}

/**
 * The relationship graph of `files`: each model, dictionary and MAT-file a box, each file one of
 * them references and that is not among them a ghost box, and the edges between them and between
 * their blocks and variables. Projects and files of other kinds draw nothing.
 *
 * A file's `path` decides how it is read; its `uriString` is its box's id and `uri`. A uri given
 * twice is one box. Pure and synchronous: the same files give the same graph, ids and order
 * included, so a widget keeps its selection and its expanded boxes across a rebuild.
 */
export function buildRelationshipGraph(files: readonly RawSource[]): RelationshipGraph {
  const seen = new Set<string>();
  const reads: ReadFile[] = [];
  for (const file of files) {
    if (seen.has(file.uriString)) continue;
    seen.add(file.uriString);
    const read = readFile(file);
    if (read) reads.push(read);
  }

  const boxes: GraphBox[] = [];
  const boxById = new Map<string, GraphBox>();
  for (const read of reads) {
    if (!read.kind) continue;
    const box: GraphBox = {
      id: read.file.uriString,
      uri: read.file.uriString,
      kind: read.kind,
      label: basename(read.file.path),
      ghost: false,
      items: [],
    };
    boxes.push(box);
    boxById.set(box.id, box);
  }

  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  const addEdge = (edge: GraphEdge): void => {
    if (edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  };

  linkFiles(reads, boxById, boxes, addEdge);

  const index = buildUsageIndexFromSummaries(
    mergeFileSummaries(reads.flatMap((r) => (r.summary ? [r.summary] : []))),
  );
  edges.push(...usageEdges(reads, boxById, index));
  return { boxes, edges };
}

/**
 * The edges between files, in referrer order: a model's referenced models, then its dictionary,
 * then its other data; a dictionary's references. Each reference goes to every file the tree's rule
 * resolves it to, or to the ghost of its name, made the first time it is named. A file that names
 * itself draws nothing: an edge from a box to itself says nothing a reader can follow.
 */
function linkFiles(
  reads: readonly ReadFile[],
  boxById: Map<string, GraphBox>,
  boxes: GraphBox[],
  addEdge: (edge: GraphEdge) => void,
): void {
  // The tree's model, over every file read — the project markers too, which decide which folder a
  // reference is resolved in first.
  const tree = new RelGraph(reads.map((r) => r.source));
  for (const read of reads) {
    if (!read.kind) continue;
    const from = read.file.uriString;
    const link = (kind: GraphEdgeKind, ref: string, ghostKind: GraphBoxKind): void => {
      const targets = tree.resolveFor(ref, from).filter((uri) => boxById.has(uri));
      if (targets.length === 0) targets.push(ghostOf(ghostKind, ref, boxById, boxes));
      for (const to of targets) if (to !== from) addEdge({ id: edgeId(kind, from, to), kind, from, to });
    };
    const s = read.source;
    for (const ref of s.modelRefs) link('model-ref', ref, 'model');
    if (s.dataDictionary) link('data-link', s.dataDictionary, 'sldd');
    for (const ref of s.dataSources) link('data-link', ref, linkedKind(ref));
    for (const ref of s.slddRefs) link('sldd-ref', ref, 'sldd');
  }
}

/** The ghost box of a reference, made the first time it is named, by its kind and its name in any case. */
function ghostOf(kind: GraphBoxKind, ref: string, boxById: Map<string, GraphBox>, boxes: GraphBox[]): string {
  const id = ghostId(kind, ref);
  if (!boxById.has(id)) {
    const box: GraphBox = { id, uri: '', kind, label: basename(ref), ghost: true, items: [], ref };
    boxes.push(box);
    boxById.set(id, box);
  }
  return id;
}

/**
 * The items, and the usage edges between them.
 *
 * Read off the REVERSE direction of core's index (`usagesOf`: which blocks read this variable),
 * because that is the one that credits every name an expression reads: `Kp*Ki` is a usage of both,
 * where the forward answer (`paramsOf`) names one origin per parameter. A block reading one
 * variable through two parameters is one usage there, labelled with the first, and one edge here.
 *
 * Each data file's items are its variables some block reads, in the file's order; each model's are
 * its blocks that read one, by path, and then its workspace variables some block reads, in the
 * workspace's order. A mask parameter is no item: it is defined inside the model, and core gives
 * it no reverse entry. The edges go top to bottom of the models' boxes, and for one block in the
 * order of the boxes and items they reach.
 */
function usageEdges(reads: readonly ReadFile[], boxById: Map<string, GraphBox>, index: UsageIndex): GraphEdge[] {
  const pending: GraphEdge[] = [];
  const blocks = new Map<string, GraphItem>();

  const blockOf = (usage: NodeUsage): GraphItem | null => {
    const model = boxById.get(usage.modelSrcId);
    if (!model) return null;
    const id = itemId(model.id, 'block', usage.linkTarget);
    let block = blocks.get(id);
    if (!block) {
      // The view's one reading of a block target (`blocks:<key>@<model>`), for the key a table
      // selects a block row by.
      const target = parseLinkTarget(`blocks:${usage.linkTarget}`);
      const revealName = target.kind === 'block' ? target.block : usage.blockName;
      block = { id, boxId: model.id, name: usage.blockPath, revealName, iconId: ITEM_ICONS.block, group: 'data' };
      blocks.set(id, block);
    }
    return block;
  };

  // Every variable some block reads becomes an item of its box, and each usage of it an edge.
  const variable = (box: GraphBox, group: 'data' | 'workspace', iconId: string, name: string): GraphItem[] => {
    const usages = index.usagesOf(box.uri, name);
    if (usages.length === 0) return [];
    const item: GraphItem = { id: itemId(box.id, group, name), boxId: box.id, name, revealName: name, iconId, group };
    const kind: GraphEdgeKind = group === 'workspace' ? 'ws-usage' : 'param-usage';
    for (const usage of usages) {
      const block = blockOf(usage);
      if (!block) continue;
      pending.push({ id: edgeId(kind, block.id, item.id), kind, from: block.id, to: item.id, label: usage.paramProperty });
    }
    return [item];
  };

  for (const read of reads) {
    const box = read.kind ? boxById.get(read.file.uriString) : undefined;
    if (!box || !read.summary) continue;
    if (read.kind === 'model') {
      const workspace = read.summary.models[0]?.workspaceNames ?? new Set<string>();
      box.items = [...workspace].flatMap((name) => variable(box, 'workspace', ITEM_ICONS.workspace, name));
    } else {
      const iconId = read.kind === 'sldd' ? ITEM_ICONS.sldd : ITEM_ICONS.mat;
      box.items = dataNames(read).flatMap((name) => variable(box, 'data', iconId, name));
    }
  }

  // The blocks go in front of their model's workspace variables, by path: the order a reader looks
  // a block up in. Its key breaks a tie, so two blocks of one path in a file older than SIDs (which
  // Simulink does not allow, and a damaged file may hold) still have an order.
  const blocksOf = new Map<string, GraphItem[]>();
  for (const block of blocks.values()) blocksOf.set(block.boxId, [...(blocksOf.get(block.boxId) ?? []), block]);
  for (const [boxId, list] of blocksOf) {
    list.sort((a, b) => a.name.localeCompare(b.name) || (a.revealName < b.revealName ? -1 : a.revealName > b.revealName ? 1 : 0));
    const box = boxById.get(boxId)!;
    box.items = [...list, ...box.items];
  }

  // Top to bottom of the models' boxes, then by where each edge ends.
  const rank = new Map<string, number>();
  [...boxById.values()].forEach((box, b) => {
    rank.set(box.id, b * 1e6);
    box.items.forEach((item, i) => rank.set(item.id, b * 1e6 + i + 1));
  });
  // No two are one edge: core answers one usage per block and variable, and a variable is either a
  // model's own workspace's (ws-usage) or a data file's (param-usage), never both.
  const at = (id: string): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return pending.sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to));
}

/**
 * The id to select or reveal for a file and, optionally, a name in it: the item of the box at
 * `uri` that `name` reveals (as `GraphItem.revealName`: a variable's name, a block's key), else
 * that box; null for a uri no box was drawn for. For an app's "Show in Graph" on a table row,
 * which knows the row's file and the name it selects the row by. A variable before a block of the
 * same key, as `selectByName` prefers an entry.
 */
export function graphIdOf(graph: RelationshipGraph, uri: string, name?: string): string | null {
  if (!uri) return null;
  const box = graph.boxes.find((b) => !b.ghost && b.uri === uri);
  if (!box) return null;
  if (name === undefined) return box.id;
  // A model's variables are its workspace's; its blocks are the rest of its items.
  const matches = box.items.filter((i) => i.revealName === name);
  const found = matches.find((i) => i.group === 'workspace') ?? matches[0];
  return found ? found.id : box.id;
}
