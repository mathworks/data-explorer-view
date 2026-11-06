// Copyright 2026 The MathWorks, Inc.
// The relationship graph's shape: its boxes, items and edges, the icons they draw with, and the
// lookup an app selects one by. Apart from the builder (relationshipGraph.ts) on purpose: the
// widget, and an app that only draws a graph it was handed, import these and nothing else, so core's
// parsers, which only the builder runs, are not in their bundle.
import { SEARCH_ICONS } from '../search/searchItems.js';

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
