// Copyright 2026 The MathWorks, Inc.
//
// Which builder plans a file's rows, and which builder answers a fetch for them — as
// ONE object, so the two can never be chosen separately.
//
// WHY THIS IS A PAIR. A planned payload (lazyRows.ts) is half a feature: the rows that
// did not fit are marked `_lazy`, and the table then asks the host for them. If the
// payload is planned by one rule and the fetch answered by another, every deferred row
// in the file opens onto the wrong thing — or onto nothing, which is a twisty that looks
// live and does nothing for the rest of the session. There is no error on that path and
// no test that fails; it is the repo's "one rule, two paths" defect in its quietest
// form. So the branch on file type happens ONCE, here, and yields both halves together.
//
// The rule itself is general, and deliberately so: a tree too large to deliver whole is
// delivered breadth-first — every name at a level, then the next level, stopping where
// the budget stops — because a name the user can see and open is worth more than a value
// they cannot reach. That holds for a `.mat`'s variables, a dictionary's entries, a
// model's workspace and blocks and a project's files alike, which is why both builders
// below take a budget and neither format gets to be the special one.
//
// Kept vscode-free, like lazyRows.ts, so the pairing is unit-testable.
import { isMatFile } from 'data-explorer-core';
import { buildChildRows, buildRowsPlanned } from './rowBuilder.js';
import { buildMatRowsPlanned } from './matRowBuilder.js';
/**
 * A `.mat`: variables are the root node's own children, with no section layer, so the
 * payload and the fetch are literally the same call from a different node.
 */
const MAT_PLANNER = {
    payload: (node, budget, opts) => buildMatRowsPlanned(node, budget, opts?.savedStatus, opts),
    // No Status: a fetch only ever returns rows UNDER a variable, which core marks nothing on.
    children: (node, budget, opts) => buildMatRowsPlanned(node, budget, undefined, opts),
};
/**
 * Everything else — dictionary, model, project. The tree carries a section layer, so the
 * payload walks sections and the fetch walks one node's children; both emit their rows
 * through the same per-node function inside rowBuilder.ts.
 */
const SECTIONED_PLANNER = {
    payload: (node, budget, opts) => buildRowsPlanned(node, opts?.modifiedNames, opts?.clipMark, budget),
    children: (node, budget) => buildChildRows(node, budget),
};
/**
 * The planner for a file, by name.
 *
 * One branch, on the one distinction that matters to row shape: whether the tree has a
 * section layer. `.sldd`, `.slx`, `.mdl` and `.prj` all do and all share a planner —
 * they already shared `buildRows`, and giving each its own here would invent three
 * chances to drift where there is one rule.
 */
export function rowPlannerFor(name) {
    return isMatFile(name) ? MAT_PLANNER : SECTIONED_PLANNER;
}
