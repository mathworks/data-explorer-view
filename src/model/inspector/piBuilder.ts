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
   * sets it false, unless it is asked for editable rows.
   */
  editable?: boolean;
  /**
   * The property's key, which an edit of the row names (a cell edit's `columnId`): core's key for
   * it, which its setter takes as it takes the column's. On an editable row only.
   */
  key?: string;
  /** On an editable row whose editor is a choice: the choices, which the field offers in a list. */
  options?: string[];
  /**
   * A text that may hold lines: on an editable row (a Description), a field of several lines; on a
   * read-only one (MATLAB's display of a value), drawn as written, its lines and spaces kept.
   * buildPropertyGroups sets it on editable rows only.
   */
  multiline?: boolean;
  /** `link` anchors the NAME, and a click sends `dex-property-navigate` with `linkTarget` (else the name). */
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

/** How buildPropertyGroups draws a node's rows. */
export interface PropertyGroupOptions {
  /**
   * Rows editable where core offers an editor of the property (its propDef's `editable`), each
   * keyed by the property an edit names, a choice with its options and a text of lines marked so.
   * Not a matrix's Value, whose glyph opens the variable editor it is edited in, nor a Value shown
   * as a summary (`<10x10 double>`), whose text is not the value. Default false: every row
   * read-only, as the VS Code extension's inspector shows them.
   */
  editable?: boolean;
}

// The two steps the prototype's inspector took from a node to its page: the node's own object of
// properties, then the groups of rows drawn from it. Its relationship and Used By extras are the
// pages' (inspectorPages.ts), which a table's inspector asks for.
export function buildPropertyGroups(node: any, options: PropertyGroupOptions = {}): PropertyGroup[] {
  if (!node || typeof node.toPIObject !== 'function') return [];
  const raw = node.toPIObject();
  if (!raw || !raw.propertySheet) return [];
  const obj = raw.objects && raw.objects[0] ? raw.objects[0] : {};
  // How core shows each property of the node's layout (its editor and options), by key: asked only
  // for editable rows, as only they draw a field.
  const editors = options.editable ? editorsOf(node) : undefined;
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
      if (editors && propDef.editable === true && !row.matrix && !isSummary(propDef.name, row.value)) {
        const editor = editors.get(propDef.name);
        row.editable = true;
        row.key = propDef.name;
        if (editor?.editor === 'select' && Array.isArray(editor.options)) {
          row.options = editor.options.filter((o: unknown): o is string => typeof o === 'string');
        }
        if (editor?.editor === 'textArea') row.multiline = true;
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
function isSummary(key: string, value: string): boolean {
  return key === 'Value' && value.startsWith('<') && value.endsWith('>');
}

/**
 * Each property of `node`'s layout as core shows it (getPropInfo: its editor, and a choice's
 * options), by key. The node's toPIObject names a property's editor and not its options, which a
 * choice's field lists. None where the node has no layout, or core cannot say.
 */
function editorsOf(node: any): Map<string, { editor?: unknown; options?: unknown }> {
  const editors = new Map<string, { editor?: unknown; options?: unknown }>();
  try {
    for (const group of node.getPILayout?.() ?? []) {
      for (const prop of group.items ?? []) {
        const info = node.getPropInfo(prop);
        if (info && typeof info.key === 'string') editors.set(info.key, info);
      }
    }
  } catch {
    // An editor core cannot describe is a plain text field.
  }
  return editors;
}
