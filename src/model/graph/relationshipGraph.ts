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
// ONE INDEX PER MODEL, over the files its references resolve to by the tree's rule. Core's index
// keys dictionaries by NAME, and given two of one name it keeps the last: over a folder holding two
// copies of a set (a project's variants, side by side), one index for everything would send every
// model's usages to the copy given last, while the file edges, resolved in the referrer's folder
// first, went to its own. Scoping an index to a folder would not do either: a model in
// `models/` linking `data/params.sldd` is the common layout, its file edge reaches across by the
// tree's fallback, and a folder's index would hold no dictionary to draw its usages to. So each
// model's index holds the model and exactly what `resolveFor` reaches from it (its dictionary, its
// other data, its workspace's MAT-file, and each dictionary's references resolved from that
// dictionary), and the two kinds of edge cannot disagree. Only the small index is rebuilt per
// model; each file is still parsed and summarised once.
import {
  buildUsageIndexFromSummaries,
  extractSlxStructure,
  identifiersIn,
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
} from 'data-explorer-core';
import { RelGraph, type GraphSource } from '../hierarchy/graphModel.js';
import { buildGraphSource } from '../hierarchy/graphSources.js';
import { parseLinkTarget } from '../ids/linkTarget.js';
import { basename } from '../ids/pathUtil.js';
import type { RawSource } from '../usage/usageCells.js';
import {
  ITEM_ICONS,
  type GraphBox,
  type GraphBoxKind,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphItem,
  type RelationshipGraph,
} from './graphTypes.js';

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
function dataNameSet(read: ReadFile): ReadonlySet<string> {
  const part = read.kind === 'sldd' ? read.summary?.slddByName : read.summary?.matByName;
  return (part ? [...part.values()][0]?.names : undefined) ?? new Set();
}

function dataNames(read: ReadFile): string[] {
  return [...dataNameSet(read)];
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

  // The tree's model, over every file read — the project markers too, which decide which folder a
  // reference is resolved in first. One for both kinds of edge, so they resolve alike.
  const tree = new RelGraph(reads.map((r) => r.source));
  linkFiles(reads, tree, boxById, boxes, addEdge);
  edges.push(...usageEdges(reads, tree, boxById));
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
  tree: RelGraph,
  boxById: Map<string, GraphBox>,
  boxes: GraphBox[],
  addEdge: (edge: GraphEdge) => void,
): void {
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
 * The data files a model's parameters can resolve in: what its references reach by the tree's rule,
 * the referrer's folder first. Its dictionary and its other data (a workspace kept in a MAT-file is
 * one of them), then breadth first each dictionary's references, resolved from that dictionary. Only
 * files given and read; a reference to one not given reaches nothing, as it does for MATLAB.
 */
function scopeOf(model: ReadFile, tree: RelGraph, readByUri: Map<string, ReadFile>): ReadFile[] {
  const scope: ReadFile[] = [];
  const seen = new Set<string>([model.file.uriString]);
  const reach = (refs: readonly string[], from: string): void => {
    for (const ref of refs) {
      for (const uri of tree.resolveFor(ref, from)) {
        const read = readByUri.get(uri);
        if (!read || seen.has(uri) || (read.kind !== 'sldd' && read.kind !== 'mat')) continue;
        seen.add(uri);
        scope.push(read);
      }
    }
  };
  const s = model.source;
  reach([...(s.dataDictionary ? [s.dataDictionary] : []), ...s.dataSources], model.file.uriString);
  for (let i = 0; i < scope.length; i++) {
    if (scope[i]!.kind === 'sldd') reach(scope[i]!.source.slddRefs, scope[i]!.file.uriString);
  }
  return scope;
}

/**
 * The items, and the usage edges between them.
 *
 * Model by model, each through an index over the model and its scope (scopeOf, and the header for
 * why). Read off the REVERSE direction of core's index (`usagesOf`: which blocks read this
 * variable), because that is the one that credits every name an expression reads: `Kp*Ki` is a
 * usage of both, where the forward answer (`paramsOf`) names one origin per parameter. A block
 * reading one variable through two parameters is one usage there, labelled with the first, and one
 * edge here.
 *
 * Each data file's items are its variables some block reads, in the file's order; each model's are
 * its blocks that read one, by path, and then its workspace variables some block reads, in the
 * workspace's order. A mask parameter is no item: it is defined inside the model, and core gives
 * it no reverse entry. The edges go top to bottom of the models' boxes, and for one block in the
 * order of the boxes and items they reach.
 */
function usageEdges(reads: readonly ReadFile[], tree: RelGraph, boxById: Map<string, GraphBox>): GraphEdge[] {
  const pending: GraphEdge[] = [];
  const blocks = new Map<string, GraphItem>();
  // The variables of each data file some block reads, and each model's workspace variables.
  const read = new Map<string, Set<string>>();
  const readByUri = new Map(reads.map((r) => [r.file.uriString, r]));

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

  for (const model of reads) {
    if (model.kind !== 'model' || !model.summary) continue;
    const scope = scopeOf(model, tree, readByUri);
    const index = buildUsageIndexFromSummaries(
      mergeFileSummaries([model.summary, ...scope.flatMap((r) => (r.summary ? [r.summary] : []))]),
    );
    // Each usage of a variable of `owner` an edge from the block to the variable's item.
    const usages = (owner: ReadFile, names: Iterable<string>, group: 'data' | 'workspace'): void => {
      const uri = owner.file.uriString;
      const kind: GraphEdgeKind = group === 'workspace' ? 'ws-usage' : 'param-usage';
      for (const name of names) {
        for (const usage of index.usagesOf(uri, name)) {
          const block = blockOf(usage);
          if (!block) continue;
          const to = itemId(uri, group, name);
          read.set(uri, (read.get(uri) ?? new Set()).add(name));
          pending.push({ id: edgeId(kind, block.id, to), kind, from: block.id, to, label: usage.paramProperty });
        }
      }
    };
    // Asked only for the names the model's blocks mention, not every name of every file in scope:
    // core credits a usage to an identifier of a block parameter's expression and to nothing else
    // (identifiersIn, the same call its index makes), so a name no expression holds has none to
    // give, and the answers are the same. What it saves is the product of models and names: 320
    // models sharing a 140,000-entry dictionary asked 45 million questions to find 640 usages.
    const summary = model.summary.models[0];
    const mentioned = [...new Set((summary?.blockParams ?? []).flatMap((p) => identifiersIn(p.expression)))];
    const workspace = summary?.workspaceNames ?? new Set<string>();
    usages(model, mentioned.filter((name) => workspace.has(name)), 'workspace');
    for (const data of scope) {
      const defined = dataNameSet(data);
      usages(data, mentioned.filter((name) => defined.has(name)), 'data');
    }
  }

  // The items of each box: the variables read, in their file's order (a workspace's own), then the
  // blocks go in front of their model's workspace variables, by path: the order a reader looks a
  // block up in. Its key breaks a tie, so two blocks of one path in a file older than SIDs (which
  // Simulink does not allow, and a damaged file may hold) still have an order.
  for (const r of reads) {
    const box = r.kind ? boxById.get(r.file.uriString) : undefined;
    const used = read.get(r.file.uriString);
    if (!box || !used || !r.summary) continue;
    const [group, iconId, names] =
      r.kind === 'model'
        ? (['workspace', ITEM_ICONS.workspace, [...(r.summary.models[0]?.workspaceNames ?? [])]] as const)
        : (['data', r.kind === 'sldd' ? ITEM_ICONS.sldd : ITEM_ICONS.mat, dataNames(r)] as const);
    box.items = names
      .filter((name) => used.has(name))
      .map((name) => ({ id: itemId(box.id, group, name), boxId: box.id, name, revealName: name, iconId, group }));
  }
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
  // No two are one edge: each model's index answers one usage per block and variable, a block is
  // in one model, and a variable is either that model's own workspace's (ws-usage) or a data file's
  // (param-usage), never both.
  const at = (id: string): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return pending.sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to));
}
