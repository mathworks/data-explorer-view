// Copyright 2026 The MathWorks, Inc.
//
// A `.slx` model as the MAT-file engine edits it (engineFile.ts): its Model Workspace, which core
// makes a MAT-file's editor over the workspace part (ModelWorkspaceNode), is the node every gesture
// edits; the table shows the whole model, section by section, as the read-only view does, and only
// the workspace takes a paste or a drop. Its configuration sets take the edits a dictionary's do,
// where core says the model's sets take one (ModelNode.configEditRefusal): a rename and a
// Description (core's row flags), an Add from the gallery's Configurations tiles (`addSections`), a
// paste or a drop of a set or a reference (`pasteTarget`), a Delete, which core refuses for the
// active set, saying why, and a Cut or a drag into another document, which takes it out of this
// one (`movedOut`). Every other section is shown and
// not edited: core refuses every edit of it (ModelSectionNode._editRefusal), and its rows offer no
// Delete or Cut. Each configuration set says whether it is made the active one (Set as Active
// Configuration, core's setActiveConfigSet). A save is the model's package with its workspace part
// written anew, its sets as edited and the active one marked (core's ModelFileWriter).
import type { Session } from 'data-explorer-core';
import { sectionRules } from '../actions/sectionRules.js';
import { buildSectionRowId } from '../ids/sectionRowId.js';
import { buildEntryRows } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { EngineFile } from './engineFile.js';

/** The key of a model's Model Workspace among its sections, which every id of a variable in it starts after. */
export const WORKSPACE_SECTION = 'workspace';
/** The key of a model's configuration sets among its sections. */
const CONFIG_SECTION = 'config';

// The Model Workspace of `root`, where it is a MAT-file's editor (core's ModelWorkspaceNode, a
// MatNode under the model), or the section of what was read, which takes no edit (a part core could
// not convert, a host parse with no parts).
function workspaceOf(root: any): any {
  return root?.getSection?.(WORKSPACE_SECTION) ?? null;
}

// Whether `variables` is a MAT-file's editor: core's ModelWorkspaceNode answers why a save of it is
// refused (_fileRefusal), which a section of what was read does not.
const editsAsMatFile = (variables: any): boolean => typeof variables?._fileRefusal === 'function';

// Whether the model's configuration sets take an edit: core's answer (ModelNode.configEditRefusal),
// which a core that edits none does not give.
function setsTakeEdits(root: any): boolean {
  return typeof root?.configEditRefusal === 'function' && root.configEditRefusal() === null;
}

// Every row of a section other than the workspace offers no Delete, and so no Cut: core refuses
// either there. A configuration set is the one row outside it that is deleted and cut, where the
// model's sets take an edit: a move into another document takes it out (`movedOut`). Its other
// flags are core's, as every row's are.
function shownOnly(rows: TreeTableRow[], variables: any, root: any): TreeTableRow[] {
  const prefix = (variables?.id ?? '') + '/';
  const sets = new Set<string>(setsOf(root).map((set: any) => String(set.id)));
  for (const row of rows as any[]) {
    const id = String(row.ID ?? '');
    if (row._canDelete && !id.startsWith(prefix) && !sets.has(id)) row._canDelete = false;
  }
  return rows;
}

// The model's configuration sets, where they take an edit; none where they do not.
function setsOf(root: any): any[] {
  return setsTakeEdits(root) ? (root.getSection(CONFIG_SECTION)?.children ?? []) : [];
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
  // The gallery's Configurations tiles, where core says the model's sets take a new one.
  addSections(root) {
    const config = root?.getSection?.(CONFIG_SECTION);
    return setsTakeEdits(root) && config?.entryRefusal?.('Simulink.ConfigSet') === null ? [CONFIG_SECTION] : [];
  },
  payload(name, root, variables, budget, opts) {
    const planned = rowPlannerFor(name).payload(root, budget, opts);
    return { rows: setsMarked(shownOnly(planned.rows, variables, root), root), plan: planned.plan };
  },
  variableRows: (variable, budget, saved, opts) =>
    buildEntryRows(variable, WORKSPACE_SECTION, undefined, opts.clipMark, undefined, budget, saved),
  // The workspace takes a paste or a drop, and the configuration sets where they take an edit (a
  // set or a reference, which core pastes into them): a model's other sections, which take none,
  // are no target, and a section with no rule is refused one (the table's sectionRuleForRow).
  rules: (root) =>
    sectionRules(root).filter((rule) => rule.sectionName === WORKSPACE_SECTION || (rule.sectionName === CONFIG_SECTION && setsTakeEdits(root))),
  // A set moved into another document is taken out of the model.
  movedOut: (root) => setsOf(root),
  // A paste or a drop onto the Configurations heading or a set lands in the sets.
  pasteTarget(root, rowId) {
    const config = root?.getSection?.(CONFIG_SECTION);
    if (!config || !setsTakeEdits(root)) return null;
    const id = String(config.id);
    return rowId === buildSectionRowId(CONFIG_SECTION) || rowId.startsWith(id + '/') ? { sectionName: CONFIG_SECTION, containerId: id } : null;
  },
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
