// Copyright 2026 The MathWorks, Inc.
//
// Made-up sides for the compare's tests: rows written out by name and cells, so each rule of the
// diff and of its lines is seen alone (test/compareRead.test.ts reads real files, where every rule
// is at once).
import type { DiffSide } from '../../src/model/compare/readSide.js';
import type { PropertyGroup } from '../../src/model/inspector/piBuilder.js';
import { COLUMN_LABELS } from '../../src/model/rows/rowBuilder.js';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';

/** A made-up row: its name, its cells, and the rows under it. */
export interface Made {
  label: string;
  cells: Partial<Record<string, string>> & { _blockPath?: string; element?: true };
  children: Made[];
}

/** A made-up row. */
export const r = (label: string, cells: Made['cells'] = {}, children: Made[] = []): Made => ({ label, cells, children });

const SIDE_COLUMNS = ['Name', 'Value', 'DataType', 'UsedBy', 'Status', 'Kind', 'Class', 'Description', 'Min', 'lastModified'];

/**
 * A side of made-up rows, by section key ('' for a MAT-file's variables: no heading): ids
 * `${uri}/${key}/${path}#${n}`, headings `section:${key}` labelled by `labels[key] ?? key`,
 * columns ['Name','Value','DataType','UsedBy','Status','Kind','Class','Description','Min','lastModified'],
 * columnLabels those keys' COLUMN_LABELS (rowBuilder.ts: 'Data Type', 'Usage', 'Last Modified', the rest
 * their key), a cell key `element` setting `Name.element`, any other key the row's cell of that name.
 * `pages` are by an entry's label.
 */
export function sideOf(uri: string, sections: Record<string, Made[]>, pages?: Record<string, PropertyGroup[]>, labels: Record<string, string> = {}): DiffSide {
  const rows: TreeTableRow[] = [];
  const pageMap = new Map<string, PropertyGroup[]>();
  let n = 0;
  const add = (made: Made, key: string, parent: string | null, path: string[], entry: boolean): void => {
    const here = [...path, made.label];
    const ID = `${uri}/${key}/${here.join('/')}#${n++}`;
    const { element, ...cells } = made.cells;
    rows.push({
      ID,
      parent,
      Name: { label: made.label, ...(element ? { element: true } : {}) },
      Value: '',
      DataType: '',
      Description: '',
      Status: '',
      ...cells,
    });
    if (entry && pages?.[made.label]) pageMap.set(ID, pages[made.label]);
    for (const child of made.children) add(child, key, ID, here, false);
  };
  for (const [key, entries] of Object.entries(sections)) {
    let parent: string | null = null;
    if (key !== '') {
      parent = `section:${key}`;
      rows.push({ ID: parent, parent: null, Name: { label: labels[key] ?? key }, Value: '', DataType: '', Description: '', Status: '' });
    }
    for (const made of entries) add(made, key, parent, [], true);
  }
  return {
    docUri: uri,
    rows,
    columns: SIDE_COLUMNS,
    columnLabels: Object.fromEntries(SIDE_COLUMNS.map((c) => [c, COLUMN_LABELS[c]])),
    ...(pages ? { pages: pageMap } : {}),
  };
}
