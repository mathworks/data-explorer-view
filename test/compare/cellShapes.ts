// Copyright 2026 The MathWorks, Inc.
//
// Each shape of cell the table reads, made up, with the text it reads as: what cellTextOf is
// tested on (test/compareCellText.test.ts), and held to the table's own reading with
// (test/compareCellParity.test.ts). Made up because the fixtures, read with no folder around them,
// give no cell of some shapes: a block's parameter links come from a folder's usage graph.
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';

/** One shape: what it is, the row's cells, the column read, and the text it reads as. */
export interface CellShape {
  what: string;
  cells: Record<string, unknown>;
  column: string;
  text: string;
}

/** A row with these cells. */
export const rowWith = (cells: Record<string, unknown>): TreeTableRow =>
  ({ ID: 'r', parent: null, Name: { label: 'x' }, Value: '', DataType: '', Description: '', Status: '', ...cells }) as TreeTableRow;

export const CELL_SHAPES: CellShape[] = [
  { what: 'a plain string as it is', cells: { Value: '1' }, column: 'Value', text: '1' },
  { what: "a cell object's text", cells: { Value: { text: 'x', editable: true } }, column: 'Value', text: 'x' },
  { what: 'a Value that links by its text', cells: { Value: { text: '$bdroot/Child', linkTarget: 'file:///w/c.slx' } }, column: 'Value', text: '$bdroot/Child' },
  { what: 'a Data Type with its qualifier, as it is on screen', cells: { DataType: { prefix: 'Bus: ', text: 'Cmd' } }, column: 'DataType', text: 'Bus: Cmd' },
  { what: "a Data Type's links joined as the table joins them", cells: { DataType: { links: [{ text: 'a' }, { text: 'b' }] } }, column: 'DataType', text: 'a, b' },
  {
    what: "a block's parameter links as property=name(source)",
    cells: { DataType: { paramLinks: [{ property: 'Gain', paramName: 'k', source: 'params.sldd' }] } },
    column: 'DataType',
    text: 'Gain=k(params.sldd)',
  },
  {
    what: 'a parameter link of no source as property=name',
    cells: { DataType: { paramLinks: [{ property: 'Gain', paramName: 'k', source: '', linkTarget: '' }, { property: 'Bias', paramName: 'b', source: 'p.sldd' }] } },
    column: 'DataType',
    text: 'Gain=k, Bias=b(p.sldd)',
  },
  { what: 'no Description where the object has none', cells: { Description: 'd', _descriptionApplies: false }, column: 'Description', text: '' },
  { what: 'a Description where the object has one', cells: { Description: 'd', _descriptionApplies: true }, column: 'Description', text: 'd' },
  { what: 'a null cell as empty', cells: { Min: null }, column: 'Min', text: '' },
  { what: 'no cell as empty', cells: {}, column: 'Min', text: '' },
  { what: 'a shapeless cell as empty', cells: { Min: {} }, column: 'Min', text: '' },
  { what: 'the Name as its label', cells: { Name: { label: 'Kp', iconId: 'x' } }, column: 'Name', text: 'Kp' },
  { what: "another column's editable cell by its text", cells: { Min: { text: '0', editable: true, editor: 'text' } }, column: 'Min', text: '0' },
  { what: 'a Class cell object by its text', cells: { Class: { text: 'Simulink.Parameter', clipboardMode: 'x' } }, column: 'Class', text: 'Simulink.Parameter' },
];
