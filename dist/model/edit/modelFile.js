import { sectionRules } from '../actions/sectionRules.js';
import { buildEntryRows } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
/** The key of a model's Model Workspace among its sections, which every id of a variable in it starts after. */
export const WORKSPACE_SECTION = 'workspace';
// The Model Workspace of `root`, where it is a MAT-file's editor (core's ModelWorkspaceNode, a
// MatNode under the model), or the section of what was read, which takes no edit (a part core could
// not convert, a host parse with no parts).
function workspaceOf(root) {
    return root?.getSection?.(WORKSPACE_SECTION) ?? null;
}
// Whether `variables` is a MAT-file's editor: core's ModelWorkspaceNode answers why a save of it is
// refused (_fileRefusal), which a section of what was read does not.
const editsAsMatFile = (variables) => typeof variables?._fileRefusal === 'function';
// Every row of a section other than the workspace offers no Delete, and so no Cut: core refuses
// either there. Its other flags are core's, as every row's are.
function shownOnly(rows, variables) {
    const prefix = (variables?.id ?? '') + '/';
    for (const row of rows) {
        const id = String(row.ID ?? '');
        if (row._canDelete && !id.startsWith(prefix))
            row._canDelete = false;
    }
    return rows;
}
export const MODEL_FILE = {
    held: 'a model',
    register(session, srcId, bytes, path) {
        const root = session.addModelSource(srcId, bytes, { path });
        const variables = workspaceOf(root);
        if (!variables)
            throw new Error(`${path} has no Model Workspace.`);
        return { root, variables };
    },
    section: WORKSPACE_SECTION,
    target: (_srcId, variables) => variables.id,
    addSection: WORKSPACE_SECTION,
    payload(name, root, variables, budget, opts) {
        const planned = rowPlannerFor(name).payload(root, budget, opts);
        return { rows: shownOnly(planned.rows, variables), plan: planned.plan };
    },
    variableRows: (variable, budget, saved, opts) => buildEntryRows(variable, WORKSPACE_SECTION, undefined, opts.clipMark, undefined, budget, saved),
    // The workspace alone takes a paste or a drop: a model's other sections, which take none, are no
    // target, and a section with no rule is refused one (the table's sectionRuleForRow).
    rules: (root) => sectionRules(root).filter((rule) => rule.sectionName === WORKSPACE_SECTION),
    readOnly: (variables) => !editsAsMatFile(variables) || !!variables.readOnly,
    // Core's words, which say why: a workspace made anew from another source as the model opens, a
    // package a save could not put back together.
    readOnlyWhy(name, variables) {
        if (!editsAsMatFile(variables))
            return `Read-only: ${name}'s Model Workspace is held in a way this editor does not save, so it opens for viewing only.`;
        if (!variables.readOnly)
            return undefined;
        const why = variables._fileRefusal();
        return `Read-only: ${why ?? `${name} takes no edit of its Model Workspace.`}`;
    },
};
