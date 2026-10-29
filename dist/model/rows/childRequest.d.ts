import type { PlanOptions, RowPlanner } from './rowPlanner.js';
import { type PostTarget } from './postPayload.js';
/**
 * Fill the Usage column of these rows — `usageGraph.annotateDataRows`, passed in rather
 * than imported.
 *
 * That module imports `vscode`, which would put this one in the set vitest cannot load
 * (see vitest.config.ts) and leave the always-posts rule below checkable only through
 * the integration suite. One parameter keeps it a unit test, and the provider that has
 * the dependency anyway is the one that supplies it.
 */
export type UsageFiller = (sourceUri: string, rows: any[]) => Promise<boolean>;
/**
 * The `childRows` envelope for a node, or for the absence of one. Total: never throws.
 *
 * `rows` empty is a real answer, not an error — the node is gone from the session (a
 * repost rebuilt the tree under new ids), or it has no children after all. Either way
 * the table stops offering to fetch, which is the honest outcome: an empty answer is
 * how a row that cannot grow says so.
 *
 * `planner` is the file's, not this module's choice (rowPlanner.ts): the rows a fetch
 * returns have to be the rows the payload would have delivered for the same node, and
 * the only way to be sure of that is for one object to own both.
 *
 * `truncated` counts the children that got no row at all, and is always 0: the plan gives
 * every child a row, even a 200,000-element cell's (core builds a cell's children
 * uncapped), and defers what is under them. It is still sent so the message keeps its
 * shape (protocol.ts). 0 on the failure paths too: an empty answer means the node is gone
 * or has no children, and neither is a loss to report.
 *
 * `opts` are the stamps the view's payload was planned with (a MAT-file's `canCopy`), so a
 * fetched row carries the flags its siblings carry: the menu of a row the user expanded must
 * be the menu of the row beside it.
 */
export declare function childRowsMessage(nodeId: string, node: any, planner: RowPlanner, opts?: PlanOptions): {
    type: 'childRows';
    nodeId: string;
    rows: any[];
    truncated: number;
};
/**
 * Answer a webview's `requestChildren` on the webview it came from.
 *
 * The Usage column is filled for these rows exactly as it is for the payload's — by
 * the same `annotateDataRows` the provider hands in, whose graph is built once per
 * source and cached — so a row the user expanded does not show an empty cell where its
 * siblings show their users. Awaited, and then posted whatever came back: a usage graph
 * that fails is worth less than the rows, so its rejection costs the column and not the
 * fetch.
 *
 * Through `postOrReport` like the payload itself, because a fetch is subject to the
 * same undeliverable-message failure the cap exists for — one node with a hundred
 * thousand heavy children is a budget's worth of rows and can still be too large to
 * serialize. A silent rejection here is a twisty that opens onto nothing, which is
 * the hang this whole area is about, scoped to one row.
 */
export declare function answerChildRequest(webview: PostTarget, uriString: string, nodeId: string, what: string, fillUsage: UsageFiller, planner: RowPlanner, opts?: PlanOptions): Promise<void>;
