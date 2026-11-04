// Copyright 2026 The MathWorks, Inc.
//
// What kind of file the MAT-file engine (matEngine.ts) edits. The engine's rules are a MAT-file's:
// every edit is core's (MatNode's gate), and a save is `session.serializeSource`. A MAT-file is one
// of two files those rules edit: a `.slx` model's Model Workspace is a MAT-file's editor too, under
// the model (core's ModelWorkspaceNode), saved as the model's package with its workspace part
// written anew. What differs between the two is said here, and nothing else: how the bytes are
// registered, which node holds the variables a gesture edits, the section they sit in (as row ids,
// paste rules and the clipboard key it), the rows of the whole table and of one variable, and why
// the file takes no edit.
import type { Session } from 'data-explorer-core';
import { wholeFileRules, type SectionRule } from '../actions/sectionRules.js';
import { WHOLE_FILE_SECTION } from '../ids/sectionRowId.js';
import { buildMatVariableRows, type SavedStatus } from '../rows/matRowBuilder.js';
import type { RowPlan } from '../rows/lazyRows.js';
import { rowPlannerFor, type PlanOptions } from '../rows/rowPlanner.js';
import type { TreeTableRow } from '../rows/tableRow.js';

export interface EngineFile {
  /** What the file is held as, where a save answers no bytes of it: 'a MAT-file'. */
  readonly held: string;
  /**
   * Register `bytes` under `srcId` in `session`: the root registered, and the node whose children
   * are the variables every gesture edits. Throws why the file does not read.
   */
  register(session: Session, srcId: string, bytes: ArrayBuffer, path: string): { root: any; variables: any };
  /** The section a variable sits in, as the table's ids, the paste rules and the clipboard key it. */
  readonly section: string;
  /** The id core is asked to add a variable to and to paste into (addEntryRefusal, pasteEntries). */
  target(srcId: string, variables: any): string;
  /** The section core's addEntry is asked to add into. */
  readonly addSection: string;
  /**
   * The sections beside the variables that the gallery adds an entry to, by key, each where core
   * says it takes one now: a model's configuration sets (`config`). Absent: none.
   */
  addSections?(root: any): readonly string[];
  /** The rows of the whole table, within `budget`, and what was held back. */
  payload(name: string, root: any, variables: any, budget: number, opts: PlanOptions): { rows: TreeTableRow[]; plan: RowPlan };
  /** The rows of one variable, its own row first: what a repaint of it splices in. */
  variableRows(variable: any, budget: number, saved: SavedStatus, opts: PlanOptions): TreeTableRow[];
  /** Where a paste or a drop into the table lands, and what it admits. */
  rules(root: any, variables: any, label: string): SectionRule[];
  /** Whether the variables take no edit at all. */
  readOnly(variables: any): boolean;
  /**
   * Why the file takes no edit, for its banner, or undefined. `serialize` is the engine's save, whose
   * refusal says why in core's words.
   */
  readOnlyWhy(name: string, variables: any, serialize: () => Uint8Array): string | undefined;
}

/** A MAT-file: the file's own variables, a table of them alone, one section, the file. */
export const MAT_FILE: EngineFile = {
  held: 'a MAT-file',
  register(session, srcId, bytes, path) {
    const root = session.addMatSource(srcId, bytes, { path }) as any;
    return { root, variables: root };
  },
  section: WHOLE_FILE_SECTION,
  target: (srcId) => srcId,
  addSection: '',
  payload: (name, _root, variables, budget, opts) => rowPlannerFor(name).payload(variables, budget, opts),
  variableRows: (variable, budget, saved, opts) => buildMatVariableRows(variable, budget, saved, opts),
  rules: (_root, variables, label) => wholeFileRules(variables, label),
  readOnly: (variables) => !!variables.readOnly,
  // Core's own words where a save says them; a file whose layout a save could not keep says nothing
  // until it is edited, which it cannot be, so that one gets the view's.
  readOnlyWhy(name, variables, serialize) {
    if (!variables.readOnly) return undefined;
    try {
      serialize();
    } catch (err) {
      return `Read-only: ${(err as Error).message}`;
    }
    return `Read-only: ${name} is laid out in a way a save could not keep as it is, so it opens for viewing only.`;
  },
};
