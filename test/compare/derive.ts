// Copyright 2026 The MathWorks, Inc.
//
// What the compare's tests read: a fixture's bytes, and a second version of a file made from it.
//
// A second version is not kept as a fixture of its own: test/fixtures is walked as a folder by the
// goldens, and a copy edited by hand could drift from what an engine writes. It is made in the
// test instead, the way a user makes one: the file opened for editing, an edit made through its
// engine (the table's own commands), and the document's save bytes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace, isEditable, sourceUri, type EditableTableSource, type TreeTableRow } from '../../src/model/index.js';

/** A fixture's bytes: `test/fixtures/<rel>`, or `test/shell/fixtures/<rel>` with `shell: true`. */
export function fixtureBytes(rel: string, shell = false): Uint8Array {
  return new Uint8Array(readFileSync(join(import.meta.dirname, '..', ...(shell ? ['shell', 'fixtures'] : ['fixtures']), rel)));
}

/** Every pending timer turn, as the engines' tests settle (four, plus two for a write's echo). */
export const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** The row labelled `label` (under the row labelled `under`, where given). */
export function rowNamed(rows: readonly TreeTableRow[], label: string, under?: string): TreeTableRow {
  const parent = under === undefined ? undefined : rows.find((row) => row.Name.label === under);
  if (under !== undefined && !parent) throw new Error(`no row ${under}`);
  const row = rows.find((r) => r.Name.label === label && (!parent || r.parent === parent.ID));
  if (!row) throw new Error(`no row ${label}${under === undefined ? '' : ` under ${under}`}`);
  return row;
}

/**
 * A second version of a file: `bytes` opened in an editing workspace, `change` made through its
 * engine (the table's edit, delete, addEntry), settled, and `doc.serialize()`'s bytes.
 */
export async function derive(
  bytes: Uint8Array,
  name: string,
  change: (table: EditableTableSource, rows: readonly TreeTableRow[]) => Promise<void> | void,
): Promise<Uint8Array> {
  const ws = createWorkspace({ editing: true });
  try {
    const doc = await ws.open(bytes, name, sourceUri(`/derived/${name}`));
    const view = await doc.table.open();
    doc.table.opened?.();
    if (!isEditable(doc.table) || !view.editable) throw new Error(`${name} does not open for editing`);
    await change(doc.table, view.rows);
    await settle();
    return doc.serialize().bytes;
  } finally {
    ws.dispose();
  }
}
