import { wholeFileRules } from '../actions/sectionRules.js';
import { WHOLE_FILE_SECTION } from '../ids/sectionRowId.js';
import { buildMatVariableRows } from '../rows/matRowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
/** A MAT-file: the file's own variables, a table of them alone, one section, the file. */
export const MAT_FILE = {
    held: 'a MAT-file',
    register(session, srcId, bytes, path) {
        const root = session.addMatSource(srcId, bytes, { path });
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
        if (!variables.readOnly)
            return undefined;
        try {
            serialize();
        }
        catch (err) {
            return `Read-only: ${err.message}`;
        }
        return `Read-only: ${name} is laid out in a way a save could not keep as it is, so it opens for viewing only.`;
    },
};
