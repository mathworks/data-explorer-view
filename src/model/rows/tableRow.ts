// Copyright 2026 The MathWorks, Inc.
//
// A row of the tree table: what the row builders and the planner make of a document, and what
// `<dex-tree-table>` takes as `rows`. Declared here, in the model, so the two name one type: the
// tree-table entry re-exports it.
//
// Type-only imports, so nothing from core enters a page's bundle through the table: they are
// erased before a bundler resolves them. See the contract below TreeTableRow.
import type { RowData } from 'data-explorer-core';
import type { MatrixDescriptor } from '../matrix/matrixPayload.js';

/**
 * One row of the tree table. A row names its parent by `ID` (`parent`, null at the top level);
 * the cells are by column key, each the cell's text or an object with the text and what the cell
 * can do (edit it, copy it, follow its link).
 */
export interface TreeTableRow {
  ID: string;
  parent: string | null;
  Name: { label: string; iconId?: string; editable?: boolean; element?: boolean; clipboardMode?: string };
  Value:
    | { text: string; editable?: boolean; clipboardMode?: string; linkTarget?: string; editor?: string; options?: string[] }
    | string;
  _valueEditable?: boolean;
  // Whether a Description typed onto this row could be SAVED — its own flag, because
  // it is its own question: a plain MATLAB variable has an editable Value and nowhere
  // to keep a Description, an object with a summarized Value has a read-only Value and
  // keeps one fine. Reading the Value flag for it was wrong in both directions.
  _descriptionEditable?: boolean;
  // Whether this row's object HAS a Description property at all — core's answer, beside the
  // two above. false (a plain MATLAB variable, a value inside another) draws the cell not
  // applicable: the wash a blank Value or Data Type gets, no text, no editor. Absent — a core
  // older than the flag — is today's cell. Not the same question as `_descriptionEditable`:
  // a Description this file cannot save is still the object's, shown and read-only.
  _descriptionApplies?: boolean;
  // Present only when this row's value is a griddable matrix (matrixPayload.ts).
  // Its presence IS the decision — the cell renders the glyph and asks nothing else.
  // A DESCRIPTOR: name, class, shape and the node to ask. The cells are fetched when
  // a panel opens, so a row that is merely on screen costs four fields, not 4 MB.
  _matrix?: MatrixDescriptor;
  // Present only when this row's children were held back by the payload's row budget
  // (lazyRows.ts). Its presence IS the decision, like `_matrix`: the row gets a twisty
  // although no child row arrived with it, and opening it asks the app for the next level
  // (dex-request-children) instead of revealing rows the table already holds.
  _lazy?: boolean;
  // `prefix` is core's: the qualifier of a value like `Bus: artFsAimCmd`, split off so the
  // anchor can cover exactly the name the dictionary holds. Declared here because
  // _CoreRowContract below compares this line against core's RowData, and a field core
  // sends that this shape does not name is a build error rather than a lost qualifier.
  DataType: { prefix?: string; text: string; clipboardMode?: string; linkTarget?: string } | string;
  Class?: { text: string; clipboardMode?: string } | string;
  Kind?: { text: string; clipboardMode?: string } | string;
  Description: { text: string; clipboardMode?: string } | string;
  Status: { text: string; clipboardMode?: string } | string;
  UsedBy?: { text: string; linkTarget?: string } | { links: { text: string; linkTarget: string }[] } | string;
  // Block rows only, straight from core's ModelBlockNode.toRow: the systems that
  // enclose the block (`Controller/Inner`, empty for one in the root system) and the
  // block's own path (those plus its label). The Name cell shows the first and hovers
  // the second; nothing here computes either, so both spellings stay core's.
  _systemPath?: string;
  _blockPath?: string;
  /**
   * Every other cell the row has, by column key: a dictionary entry's `Min`, `Max`, `Unit`, …,
   * a block row's parameter links. Each column's cell has a shape of its own, which the table
   * reads; `unknown` here, so code that reads one says which shape it expects.
   */
  [column: string]: unknown;
}

/**
 * The compile-time half of the row contract with core.
 *
 * TreeTableRow cannot simply extend core's RowData. The row builders normalize a
 * row on its way to the table (rowBuilder.ts, usageCells.ts, matrixPayload.ts):
 * it stringifies core's `Value: unknown`, and it adds cell shapes core has no name
 * for — `paramLinks`, `blockLinks`, `clipboardMode`, `_matrix`. So the two shapes
 * are declared separately, and were checked against each other nowhere.
 *
 * What must hold is narrower than equality: for every key core DOES own, the cell
 * core can emit has to be one this table declares. Break that — rename
 * `Name.label`, retype `Status`, add a third arm to `DataType` — and the cell does
 * not fail loudly, it goes blank: `_getCellText` reads exactly these keys, so the
 * row silently stops being searchable AND sortable, with nothing raising anywhere.
 * Each line below turns that into a build error instead. Core may omit any of them
 * (the host fills them in), hence the `| undefined`.
 *
 * `Value` is deliberately absent — the builders own that conversion. The runtime half
 * of the contract, that a cell reads for search exactly as it paints, is pinned in
 * test/treeTableCells.test.ts.
 */
type AssertTrue<T extends true> = T;
type CoreCellFits<K extends keyof TreeTableRow & keyof RowData> = RowData[K] extends TreeTableRow[K] | undefined
  ? true
  : false;
type _CoreRowContract = [
  AssertTrue<CoreCellFits<'ID'>>,
  AssertTrue<CoreCellFits<'parent'>>,
  AssertTrue<CoreCellFits<'Name'>>,
  AssertTrue<CoreCellFits<'DataType'>>,
  AssertTrue<CoreCellFits<'Class'>>,
  AssertTrue<CoreCellFits<'Kind'>>,
  AssertTrue<CoreCellFits<'Description'>>,
  AssertTrue<CoreCellFits<'Status'>>,
  AssertTrue<CoreCellFits<'UsedBy'>>,
  AssertTrue<CoreCellFits<'_valueEditable'>>,
  AssertTrue<CoreCellFits<'_descriptionEditable'>>,
  AssertTrue<CoreCellFits<'_descriptionApplies'>>,
];
