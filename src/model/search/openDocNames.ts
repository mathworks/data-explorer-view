// Copyright 2026 The MathWorks, Inc.
// The entry names of an OPEN document, read off the rows its table shows, so that a search can
// offer the files a page has open when there is no folder to index: a file dropped on the page,
// or opened from a dialog. A folder's names come from nameIndex.ts, which reads each file through
// the source cache; a document that is open has done that reading already, and its rows carry
// every name the index would take from it.
//
// THE SAME RECORDS AS THE FOLDER'S INDEX
//
// A page with a folder searches both lists, and they must agree about the same file: a record
// only the rows give is a hit that appears while the file is open, one only the scan gives is a
// hit that vanishes when it opens. So the records are namesFromSldd's, namesFromMat's and
// namesFromSlx's, field for field (openDocNames.test.ts holds the two together over the fixtures),
// and what a table shows that the index does not take is left out:
//
//   dictionary  each row straight under a section heading, whichever section: an entry. Not the
//               rows under an entry (a bus's elements, a struct's fields), which have no
//               namespace of their own.
//   MAT-file    each top-level row: a variable. Not the cells and fields under one.
//   model       the Model Workspace's rows, then the Model Elements' blocks, in the order
//               namesFromSlx gives them. A block carries the key it is revealed by (`_blockKey`,
//               core's SID) and its path through the model (`_blockPath`), both written by core's
//               block rows, so neither is spelled twice. Not the configuration sets, references
//               or data sources: the index takes none of them.
//   project     nothing: it opens on a page, not in a table.
//
// Order within a dictionary is the table's, section by section, where the scan's is the file's;
// the two differ only for a file that interleaves its sections, and a search sorts its records
// anyway (sortNameRecords). A paint that holds rows back (`_lazy`) holds back what lies under a
// dictionary's entries or a MAT-file's variables, never the entries themselves: the top level of
// a row plan always comes whole (lazyRows.ts), so however large the file, its rows carry every
// name.
import { uriBasename } from '../ids/pathUtil.js';
import { sectionNameFromRowId } from '../ids/sectionRowId.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { DocKind } from '../source/readDocument.js';
import type { EntryKind, NameRecord } from './nameExtract.js';

/**
 * The name records of an open document, from the rows its table shows (a TableView's `rows`):
 * the records the folder's index gives the same file (namesFromSldd, namesFromMat, namesFromSlx),
 * each named after `sourceUri`. `kind` is the document's (`Doc.kind`); a project has none. A row
 * with no name gives none, as the index drops an entry with none, and so does a block row with no
 * key, which a search could not reveal.
 */
export function namesOfRows(rows: readonly TreeTableRow[], sourceUri: string, kind: DocKind): NameRecord[] {
  // The file's name by the index's own rule (nameExtract.ts's nameRecords), so a hit from either
  // list is grouped under the same heading.
  const sourceLabel = uriBasename(sourceUri);
  const record = (name: string, entryKind: EntryKind): NameRecord => ({ name, sourceUri, sourceLabel, kind: entryKind });
  const sectionOf = (row: TreeTableRow): string | null => (row.parent === null ? null : sectionNameFromRowId(row.parent));

  if (kind === 'mat') {
    return rows.filter((row) => row.parent === null && row.Name.label).map((row) => record(row.Name.label, 'mat'));
  }
  if (kind === 'dictionary') {
    return rows.filter((row) => sectionOf(row) !== null && row.Name.label).map((row) => record(row.Name.label, 'sldd'));
  }
  if (kind !== 'model') return [];

  // Two lists, because namesFromSlx gives the workspace first and the blocks after, whatever
  // order the sections are drawn in.
  const workspace: NameRecord[] = [];
  const blocks: NameRecord[] = [];
  for (const row of rows) {
    const section = sectionOf(row);
    if (section === 'workspace' && row.Name.label) workspace.push(record(row.Name.label, 'workspace'));
    if (section !== 'blocks') continue;
    // The label is core's blockLabel (`<SID: 65>` for a block with no name), as the index's.
    const key = typeof row._blockKey === 'string' ? row._blockKey : '';
    if (!key) continue;
    blocks.push({ ...record(row.Name.label, 'block'), selectName: key, blockPath: row._blockPath || row.Name.label });
  }
  return [...workspace, ...blocks];
}
