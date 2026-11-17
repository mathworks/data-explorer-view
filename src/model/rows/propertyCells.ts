// Copyright 2026 The MathWorks, Inc.
//
// A row's properties beyond its columns: what a column the user names in the table's Columns menu
// (its Other Properties group) shows. The table reads the cell of such a column from the row's
// `_props`, by the property's name; a row whose object has no property of that name leaves the
// cell empty.
//
// Two places hold an object's own properties, and both are read:
//   - an object whose CHILDREN are its class's properties (core's `isObjectPropertyBag`: a MATLAB
//     class object, so a `MyClass` with `MyPropA`), each child by its name, as the child's own row
//     shows its value;
//   - an object that keeps a property bag (`serial._properties`, a Simulink object and a class
//     derived from one), each top-level property by its name, where the value is one a property
//     column shows: text, a number, a logical, a list of those, or a typed scalar (MATLAB's rule
//     for these columns). Not a nested object (`CoderInfo`, `LoggingInfo`), whose own properties
//     are not columns, nor a `*_internal` or envelope key.
//
// A property the row already has a cell for (Value, Description, `complexity` for `Complexity`)
// is left out: the menu shows that column for its name instead, so its text here would be a
// second copy of the cell on every row.
//
// The values are printed as core's Property Inspector prints them in its Other group (core's
// piOther), for the shapes kept; core does not export that printer, and calling `toPIObject()`
// per row for it cost three quarters of a 15,000-entry dictionary's open (measured 2026-11-17).

/** The cell text of each of the node's own properties the row has no column for, or undefined. */
export function propertyCells(n: any, row: Record<string, unknown>): Record<string, string> | undefined {
  let props: Record<string, string> | undefined;
  const put = (name: string, text: string): void => {
    if (inRow(row, name) || (props && name in props)) return;
    (props ??= {})[name] = text;
  };

  let isBag = false;
  try {
    isBag = n?.isObjectPropertyBag === true;
  } catch {
    isBag = false;
  }
  if (isBag && Array.isArray(n.children)) {
    for (const child of n.children as any[]) {
      const name = child?.name;
      // An object array's children are its elements (`obj(1)`), not properties.
      if (typeof name !== 'string' || !PROPERTY_NAME.test(name)) continue;
      let text: unknown;
      try {
        text = child.displayValue;
      } catch {
        continue;
      }
      put(name, typeof text === 'string' ? text : text === undefined || text === null ? '' : String(text));
    }
  }

  const bag = n?.serial?._properties;
  if (isPlainObject(bag)) {
    for (const name of Object.keys(bag)) {
      if (!PROPERTY_NAME.test(name) || name.endsWith('_internal')) continue;
      const text = primitiveText(bag[name]);
      if (text !== null) put(name, text);
    }
  }
  return props;
}

// A MATLAB property name: a letter, then letters, digits and underscores.
const PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

// Whether the row has a cell for `name`: under its own key, or under the lower-camel key a schema
// column gives a property (`Complexity` → `complexity`).
function inRow(row: Record<string, unknown>, name: string): boolean {
  return name in row || name.charAt(0).toLowerCase() + name.slice(1) in row;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// The text of a value a property column shows, or null for one it does not. Each kept shape is
// printed as core's piOther prints it: a scalar as String(), a list as `[a, b, c]`, a typed
// scalar as its `_value`. The typed scalars core reads before printing (complex or MAT-stream
// cdata, an encoded binary value, a sparse array, a `Matrix(…)` empty) are not kept.
function primitiveText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')
      ? '[' + v.join(', ') + ']'
      : null;
  }
  if (isPlainObject(v) && '_type' in v && '_value' in v) {
    const value = v._value;
    if (v._type === 'cdata' || v._type === 'sparse' || '_attrs' in v) return null;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string' && !value.startsWith('Matrix(')) return value;
  }
  return null;
}
