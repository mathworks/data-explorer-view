// Copyright 2026 The MathWorks, Inc.
import { matrixDescriptor } from '../matrix/matrixPayload.js';
// Replicates the vendored two-step transform (PIController.convertToPIObject +
// LitRenderer.setPIContent). graphture/usedBy extras are intentionally omitted.
export function buildPropertyGroups(node) {
    if (!node || typeof node.toPIObject !== 'function')
        return [];
    const raw = node.toPIObject();
    if (!raw || !raw.propertySheet)
        return [];
    const obj = raw.objects && raw.objects[0] ? raw.objects[0] : {};
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
            properties.push(row);
        }
        out.push({ title: groupDef.displayName || groupDef.name, properties });
    }
    return out;
}
