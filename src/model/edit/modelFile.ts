// Copyright 2026 The MathWorks, Inc.
//
// A `.slx` model as the MAT-file engine edits it (engineFile.ts): its Model Workspace, which core
// makes a MAT-file's editor over the workspace part (ModelWorkspaceNode), is the node every gesture
// edits; the table shows the whole model, section by section, as the read-only view does, and only
// the workspace takes an edit, a paste or a drop. Every other section is shown and not edited:
// core refuses every edit of it (ModelSectionNode._editRefusal), and its rows offer no Delete or
// Cut. Each configuration set says whether it is made the active one (Set as Active Configuration,
// core's setActiveConfigSet). A save is the model's package with its workspace part written anew,
// and the active set marked where another was made active (core's ModelFileWriter).
import type { Session } from 'data-explorer-core';
import { sectionRules } from '../actions/sectionRules.js';
import { buildEntryRows } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { EngineFile } from './engineFile.js';

/** The key of a model's Model Workspace among its sections, which every id of a variable in it starts after. */
export const WORKSPACE_SECTION = 'workspace';

// The Model Workspace of `root`, where it is a MAT-file's editor (core's ModelWorkspaceNode, a
// MatNode under the model), or the section of what was read, which takes no edit (a part core could
// not convert, a host parse with no parts).
function workspaceOf(root: any): any {
  return root?.getSection?.(WORKSPACE_SECTION) ?? null;
}

// Whether `variables` is a MAT-file's editor: core's ModelWorkspaceNode answers why a save of it is
// refused (_fileRefusal), which a section of what was read does not.
const editsAsMatFile = (variables: any): boolean => typeof variables?._fileRefusal === 'function';

// Every row of a section other than the workspace offers no Delete, and so no Cut: core refuses
// either there. Its other flags are core's, as every row's are.
function shownOnly(rows: TreeTableRow[], variables: any): TreeTableRow[] {
  const prefix = (variables?.id ?? '') + '/';
  for (const row of rows as any[]) {
    const id = String(row.ID ?? '');
    if (row._canDelete && !id.startsWith(prefix)) row._canDelete = false;
  }
  return rows;
}

// Each of the model's configuration sets says whether it is made the active one (`_canSetActive`)
// and, where it is not, core's reason as a sentence (`_setActiveWhy`, ModelNode.activeSetRefusal),
// which the menu's Set as Active Configuration is greyed with; a reference, what making it active
// cannot check (`_setActiveCaution`, ModelNode.activeSetCaution), its tooltip.
function setsMarked(rows: TreeTableRow[], root: any): TreeTableRow[] {
  const sets: any[] = root?.getSection?.('config')?.children ?? [];
  if (sets.length === 0 || typeof root.activeSetRefusal !== 'function') return rows;
  const why = new Map<string, string | null>(sets.map((set) => [String(set.id), root.activeSetRefusal(set)]));
  for (const row of rows as any[]) {
    const id = String(row.ID ?? '');
    if (!why.has(id)) continue;
    const refused = why.get(id)!;
    row._canSetActive = refused === null;
    if (refused !== null) row._setActiveWhy = refused.charAt(0).toUpperCase() + refused.slice(1);
    const caution = typeof root.activeSetCaution === 'function' ? root.activeSetCaution(sets.find((s) => String(s.id) === id)) : null;
    if (caution) row._setActiveCaution = caution;
  }
  return rows;
}

export const MODEL_FILE: EngineFile = {
  held: 'a model',
  register(session: Session, srcId: string, bytes: ArrayBuffer, path: string) {
    const root = session.addModelSource(srcId, bytes, { path }) as any;
    const variables = workspaceOf(root);
    if (!variables) throw new Error(`${path} has no Model Workspace.`);
    return { root, variables };
  },
  section: WORKSPACE_SECTION,
  target: (_srcId, variables) => variables.id,
  addSection: WORKSPACE_SECTION,
  payload(name, root, variables, budget, opts) {
    const planned = rowPlannerFor(name).payload(root, budget, opts);
    return { rows: setsMarked(shownOnly(planned.rows, variables), root), plan: planned.plan };
  },
  variableRows: (variable, budget, saved, opts) =>
    buildEntryRows(variable, WORKSPACE_SECTION, undefined, opts.clipMark, undefined, budget, saved),
  // The workspace alone takes a paste or a drop: a model's other sections, which take none, are no
  // target, and a section with no rule is refused one (the table's sectionRuleForRow).
  rules: (root) => sectionRules(root).filter((rule) => rule.sectionName === WORKSPACE_SECTION),
  readOnly: (variables) => !editsAsMatFile(variables) || !!variables.readOnly,
  // Core's words, which say why: a workspace made anew from another source as the model opens, a
  // package a save could not put back together.
  readOnlyWhy(name, variables) {
    if (!editsAsMatFile(variables)) return `Read-only: ${name}'s Model Workspace is held in a way this editor does not save, so it opens for viewing only.`;
    if (!variables.readOnly) return undefined;
    const why = variables._fileRefusal();
    return `Read-only: ${why ?? `${name} takes no edit of its Model Workspace.`}`;
  },
};
