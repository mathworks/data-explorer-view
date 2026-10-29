// Copyright 2026 The MathWorks, Inc.
import { matrixDescriptor, type MatrixDescriptor } from '../matrix/matrixPayload.js';

// The property inspector's rows: what buildPropertyGroups makes of a node, and what
// `<dex-property-inspector>` takes as `groups`. Declared here, in the model, so the two name one
// type: the property-inspector entry re-exports it.

/** One row of the inspector: a property's name and its value as text. */
export interface PropertyRow {
  name: string;
  value: string;
  /**
   * The value is an input; a committed change sends `dex-property-changed`. buildPropertyGroups
   * sets it false.
   */
  editable?: boolean;
  /** `link` anchors the NAME, and a click sends `dex-pi-navigate` with `linkTarget` (else the name). */
  type?: 'text' | 'link';
  linkTarget?: string;
  // A link on the VALUE, set by core on the Data Type property when the type names another
  // entry in the same dictionary. Distinct from `linkTarget` above, which pairs with
  // `type: 'link'` and anchors the property NAME: this row's label is the word "Data Type",
  // which is not what the click navigates to.
  valueLink?: string;
  // Present only on a Value row whose value is a griddable matrix. Same descriptor
  // and same builder the table rows use, so the PI cannot disagree with the table
  // about what is griddable. The cells are fetched when a popover opens, not carried
  // here — see matrixRequest.ts.
  matrix?: MatrixDescriptor;
}

/** One titled group of the inspector's rows. */
export interface PropertyGroup {
  title: string;
  properties: PropertyRow[];
}

/** @deprecated PropertyRow, under the name it had when the model and the widget each declared one. */
export type PIPropertyRow = PropertyRow;
/** @deprecated PropertyGroup, under the name it had when the model and the widget each declared one. */
export type PIPropertyGroup = PropertyGroup;

// Replicates the vendored two-step transform (PIController.convertToPIObject +
// LitRenderer.setPIContent). graphture/usedBy extras are intentionally omitted.
export function buildPropertyGroups(node: any): PropertyGroup[] {
  if (!node || typeof node.toPIObject !== 'function') return [];
  const raw = node.toPIObject();
  if (!raw || !raw.propertySheet) return [];
  const obj = raw.objects && raw.objects[0] ? raw.objects[0] : {};
  const out: PropertyGroup[] = [];
  for (const groupDef of raw.propertySheet.groups ?? []) {
    const properties: PropertyRow[] = [];
    for (const item of groupDef.items ?? []) {
      if (item.type !== 'property') continue;
      const propDef = (raw.propertySheet.properties ?? []).find(
        (p: any) => p.name === item.name,
      );
      if (!propDef) continue;
      const link = (propDef as any).link; // usually undefined for textual sldd
      // Core's forward type link (BaseNode.toPIObject). Passed straight through and NOT
      // folded into `link`: that one would make this a `type: 'link'` row, whose template
      // anchors the property name and mutes the value.
      const valueLink = (propDef as any).valueLink;
      const row: PropertyRow = {
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
