// Copyright 2026 The MathWorks, Inc.
//
// A row's `_props`: the object's own properties beyond its columns, which a property column the
// user adds in the Columns menu (Other Properties) reads by name (src/model/rows/propertyCells.ts).
// Read from the two places an object keeps them: a class object's property children, and a
// Simulink object's property bag.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorkspace, type TreeTableRow } from '../src/model/index.js';
import { propertyCells } from '../src/model/rows/propertyCells.js';

async function rowsOf(path: string): Promise<TreeTableRow[]> {
  const ws = createWorkspace({ rowBudget: Infinity });
  try {
    const doc = await ws.open(readFileSync(path), path.split('/').pop()!);
    return (await doc.table.open()).rows;
  } finally {
    ws.dispose();
  }
}

function rowNamed(rows: TreeTableRow[], label: string): TreeTableRow {
  const found = rows.find((r) => r.Name?.label === label);
  if (!found) throw new Error(`no row ${label}`);
  return found;
}

const valueText = (row: TreeTableRow): string => (typeof row.Value === 'string' ? row.Value : row.Value.text);

describe("a class object's properties", () => {
  it('are its row\'s _props, by name, each as the property\'s own row shows its value', async () => {
    const rows = await rowsOf('test/fixtures/object_props_text.sldd');
    const fleet = rowNamed(rows, 'fleetObject');
    expect(fleet._props).toEqual({ Count: '3', FleetName: '"east"', Lead: '<1x1 Garage>' });
    const children = rows.filter((r) => r.parent === fleet.ID);
    for (const child of children) expect(fleet._props![child.Name.label]).toBe(valueText(child));
  });

  it('are the same in a text and a binary dictionary', async () => {
    const text = rowNamed(await rowsOf('test/fixtures/object_props_text.sldd'), 'vehicleObject');
    const binary = rowNamed(await rowsOf('test/fixtures/object_props_binary.sldd'), 'vehicleObject');
    expect(text._props).toEqual({ Engine: '<1x1 Engine>', Specs: '<1x1 struct>', Tags: "{'suv', 'electric'}", Wheels: '6' });
    expect(binary._props).toEqual(text._props);
  });

  it('are read on a nested object too: its own row carries its own properties', async () => {
    const rows = await rowsOf('test/fixtures/object_props_text.sldd');
    expect(rowNamed(rows, 'Engine')._props).toEqual({ Cylinders: '8', Displacement: '5.7', Label: '"V8"' });
  });

  it("leave out a property the row already has a column for (the class's Name is not the row's Name)", () => {
    // A class property called Name: the row's Name cell is the entry's name, so the property's
    // value would be a second, different "Name" — and the menu shows the Name column for it.
    const node = {
      isObjectPropertyBag: true,
      children: [
        { name: 'Name', displayValue: '"Model-X"' },
        { name: 'Wheels', displayValue: '6' },
      ],
    };
    expect(propertyCells(node, { ID: 'v', Name: { label: 'v' }, Value: '' })).toEqual({ Wheels: '6' });
  });

  it("of an object array are not read: its children are its elements, not properties", () => {
    const node = { isObjectPropertyBag: true, children: [{ name: 'arr(1)', displayValue: '<1x1 Foo>' }] };
    expect(propertyCells(node, { ID: 'arr' })).toBeUndefined();
  });
});

describe("a Simulink object's stored properties", () => {
  it('are its row\'s _props: a signal\'s SampleTime, a numeric type\'s WordLength', async () => {
    const rows = await rowsOf('test-integration/fixtures/sldd/params_binary.sldd');
    expect(rowNamed(rows, 'sig1')._props).toMatchObject({ SampleTime: '-1', SamplingMode: 'auto', InitialValue: '' });
    expect(rowNamed(rows, 'MyNumType')._props).toMatchObject({ WordLength: '16', FixedExponent: '-8', IsAlias: 'false' });
  });

  it('leave out what the row has a column for, a nested object, and an internal field', async () => {
    const rows = await rowsOf('test-integration/fixtures/sldd/params_binary.sldd');
    const sig = rowNamed(rows, 'sig1')._props!;
    // Columns of the row: Description, DataType, Min, Max, and Dimensions as `dimensions`.
    for (const name of ['Description', 'DataType', 'Min', 'Max', 'Dimensions', 'Complexity', 'DimensionsMode']) {
      expect(sig, name).not.toHaveProperty(name);
    }
    // Objects, whose own properties are not columns.
    expect(sig).not.toHaveProperty('CoderInfo');
    expect(sig).not.toHaveProperty('LoggingInfo');
    expect(rowNamed(rows, 'MyBus')._props).not.toHaveProperty('Elements_internal');
  });

  it('are the same in a text and a binary dictionary', async () => {
    const text = rowNamed(await rowsOf('test-integration/fixtures/sldd/params.sldd'), 'MyNumType')._props;
    const binary = rowNamed(await rowsOf('test-integration/fixtures/sldd/params_binary.sldd'), 'MyNumType')._props;
    expect(text).toBeDefined();
    expect(binary).toEqual(text);
  });
});

describe('a row whose object has no properties of its own', () => {
  it('carries no _props', async () => {
    const rows = await rowsOf('test-integration/fixtures/sldd/params_binary.sldd');
    expect(rowNamed(rows, 'scalarD')).not.toHaveProperty('_props');
    expect(rowNamed(rows, 'myStruct')).not.toHaveProperty('_props');
  });
});

describe('the value of a stored property', () => {
  const cells = (props: Record<string, unknown>) => propertyCells({ serial: { _properties: props } }, { ID: 'x' });

  it('is printed as the inspector prints it: a scalar as itself, a list as [a, b, c], a typed scalar as its value', () => {
    expect(cells({ S: 'text', N: 0.5, B: true, L: [1, 2, 3], T: { _type: 'int16', _value: '5' } })).toEqual({
      S: 'text',
      N: '0.5',
      B: 'true',
      L: '[1, 2, 3]',
      T: '5',
    });
  });

  it('is left out where core reads it before printing it, or where it is an object', () => {
    expect(
      cells({
        Cdata: { _type: 'cdata', _value: 'M=' },
        Sparse: { _type: 'sparse', _value: '[0, 7]' },
        Encoded: { _type: 'mxArray', _value: '00ff', _attrs: { Class: 'double' } },
        Empty: { _type: 'double', _value: 'Matrix(0,0)' },
        Nested: { _object_class: 'Simulink.CoderInfo', _properties: { StorageClass: 'Auto' } },
        Mixed: [1, { a: 1 }],
        _saveobj: 'x',
        Elements_internal: [],
      }),
    ).toBeUndefined();
  });
});
