// Copyright 2026 The MathWorks, Inc.
import { matrixDescriptor } from '../matrix/matrixPayload.js';
// The two steps the prototype's inspector took from a node to its page: the node's own object of
// properties, then the groups of rows drawn from it. Its relationship and Used By extras are the
// pages' (inspectorPages.ts), which a table's inspector asks for.
export function buildPropertyGroups(node, options = {}) {
    if (!node || typeof node.toPIObject !== 'function')
        return [];
    const raw = node.toPIObject();
    if (!raw || !raw.propertySheet)
        return [];
    const obj = raw.objects && raw.objects[0] ? raw.objects[0] : {};
    // How core shows each property of the node's layout (its editor and options), by key: asked only
    // for editable rows, as only they draw a field.
    const editors = options.editable ? editorsOf(node) : undefined;
    const out = [];
    for (const groupDef of raw.propertySheet.groups ?? []) {
        const properties = [];
        for (const item of groupDef.items ?? []) {
            if (item.type !== 'property')
                continue;
            const propDef = (raw.propertySheet.properties ?? []).find((p) => p.name === item.name);
            if (!propDef)
                continue;
            const link = propDef.link; // usually undefined for textual sldd
            // Core's forward type link (BaseNode.toPIObject). Passed straight through and NOT
            // folded into `link`: that one would make this a `type: 'link'` row, whose template
            // anchors the property name and mutes the value.
            const valueLink = propDef.valueLink;
            const row = {
                name: propDef.displayName || propDef.name,
                value: String(obj[propDef.name] ?? ''),
                editable: false, // read-only V1
                type: link ? 'link' : 'text',
                linkTarget: link || undefined,
                ...(typeof valueLink === 'string' && valueLink !== '' ? { valueLink } : {}),
            };
            // The Variable Editor affordance, on the Value property only: it is the one
            // property whose value can be a matrix. `node` is passed, NOT its Value
            // child — matrixDescriptor's own matrixForRow does that resolution, and doing
            // it here would title the popover `Value` where the table says
            // `ParamMat.Value`.
            //
            // The DESCRIPTOR, like the table's rows: name, class, shape and the node to
            // ask. The inspector repaints on every selection change, so building the cells
            // here cost ~240 ms and 4 MB for the 1000x1000 entry every time it was clicked,
            // for a popover that may never be opened. PropertiesViewProvider answers the
            // `requestMatrix` that follows one that is.
            if (propDef.name === 'Value') {
                const matrix = matrixDescriptor(node);
                if (matrix) {
                    row.matrix = matrix;
                }
            }
            if (editors && propDef.editable === true && !row.matrix && !isSummary(propDef.name, row.value)) {
                const editor = editors.get(propDef.name);
                row.editable = true;
                row.key = propDef.name;
                if (editor?.editor === 'select' && Array.isArray(editor.options)) {
                    row.options = editor.options.filter((o) => typeof o === 'string');
                }
                if (editor?.editor === 'textArea')
                    row.multiline = true;
            }
            properties.push(row);
        }
        out.push({ title: groupDef.displayName || groupDef.name, properties });
    }
    return out;
}
/**
 * Whether a Value is shown as a summary of itself, `<10x10 double>`, rather than as its text. Core
 * offers such a Value an editor seeded with the whole value written out (its edit text, which the
 * table asks for as its editor opens), so the row's own text is not what an edit starts from.
 */
function isSummary(key, value) {
    return key === 'Value' && value.startsWith('<') && value.endsWith('>');
}
/**
 * Each property of `node`'s layout as core shows it (getPropInfo: its editor, and a choice's
 * options), by key. The node's toPIObject names a property's editor and not its options, which a
 * choice's field lists. None where the node has no layout, or core cannot say.
 */
function editorsOf(node) {
    const editors = new Map();
    try {
        for (const group of node.getPILayout?.() ?? []) {
            for (const prop of group.items ?? []) {
                const info = node.getPropInfo(prop);
                if (info && typeof info.key === 'string')
                    editors.set(info.key, info);
            }
        }
    }
    catch {
        // An editor core cannot describe is a plain text field.
    }
    return editors;
}
