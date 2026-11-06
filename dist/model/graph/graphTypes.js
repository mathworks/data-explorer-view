// Copyright 2026 The MathWorks, Inc.
// The relationship graph's shape: its boxes, items and edges, the icons they draw with, and the
// lookup an app selects one by. Apart from the builder (relationshipGraph.ts) on purpose: the
// widget, and an app that only draws a graph it was handed, import these and nothing else, so core's
// parsers, which only the builder runs, are not in their bundle.
import { SEARCH_ICONS } from '../search/searchItems.js';
/** The icon of a box of each kind: the one its row has in a folder's hierarchy. */
export const BOX_ICONS = {
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
};
/**
 * The id to select or reveal for a file and, optionally, a name in it: the item of the box at
 * `uri` that `name` reveals (as `GraphItem.revealName`: a variable's name, a block's key), else
 * that box; null for a uri no box was drawn for. For an app's "Show in Graph" on a table row,
 * which knows the row's file and the name it selects the row by. A variable before a block of the
 * same key, as `selectByName` prefers an entry.
 */
export function graphIdOf(graph, uri, name) {
    if (!uri)
        return null;
    const box = graph.boxes.find((b) => !b.ghost && b.uri === uri);
    if (!box)
        return null;
    if (name === undefined)
        return box.id;
    // A model's variables are its workspace's; its blocks are the rest of its items.
    const matches = box.items.filter((i) => i.revealName === name);
    const found = matches.find((i) => i.group === 'workspace') ?? matches[0];
    return found ? found.id : box.id;
}
