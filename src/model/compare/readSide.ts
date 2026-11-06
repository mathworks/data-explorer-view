// Copyright 2026 The MathWorks, Inc.
//
// One side of a compare, read: every row of a document, none held back, its table's columns, and
// (when asked) each entry's inspector page. What diffSides (diff.ts) compares, two at a time.
//
// The rows are the ones the table draws, read through the document's TableSource, so a compare
// reads every kind of file the table shows (dictionaries, models, MAT-files) through one door and
// reads them as the user sees them. A paint holds back what lies past its row budget (`_lazy`,
// lazyRows.ts): a compare cannot leave it out, as a difference in it would go unseen, so each such
// row's children are asked for, and theirs in turn. What bounds the reading is `maxRows`, a size
// past which the user is told the file is too large to compare rather than left waiting.
//
// Nothing here touches a DOM: a TableSource is the same in a page (a workspace's document), in a
// terminal and in a worker, which is how the command line's `diff` reads its two files.
import { uriBasename } from '../ids/pathUtil.js';
import { isSectionRowId } from '../ids/sectionRowId.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';
import type { TableSource, TableView } from '../source/tableSource.js';
import type { TreeTableRow } from '../rows/tableRow.js';

/** One side of a compare: every row of a document (none held back), and its table's columns. */
export interface DiffSide {
  /** Its uri (TableView.docUri). */
  docUri: string;
  /** Every row, parents before children; none `_lazy` (readDiffSide asked `children` for them). */
  rows: readonly TreeTableRow[];
  /** Its table's column keys, in their default order (TableView.columns). */
  columns: readonly string[];
  /** Each column's heading (TableView.columnLabels). */
  columnLabels: Readonly<Record<string, string>>;
  /**
   * Each entry's inspector page (TableSource.inspect's groups), by the entry's row id: read with
   * `properties`. An entry is a row right under a section heading, or a top-level row of a document
   * with no sections (a MAT-file's variable).
   */
  pages?: ReadonlyMap<string, readonly PropertyGroup[]>;
  /** `properties` was asked, and the side has more entries than `maxPages`: no page was read. */
  pagesSkipped?: true;
}

/** How readDiffSide reads a side. */
export interface ReadSideOptions {
  /** Read each entry's inspector page (DiffSide.pages), for DiffOptions.properties. Default false. */
  properties?: boolean;
  /**
   * The rows to start from instead of asking `open()`: what a connected table shows now (its
   * handle's `view` and its table's `rows`, the entries repainted and the children fetched since),
   * so a compare in a page reads the rows on screen. Default: `open()`'s.
   */
  shown?: { view: TableView; rows: readonly TreeTableRow[] };
  /**
   * The most rows a side may hold once every held-back row is fetched; past it readDiffSide rejects
   * with "<file> has more than <n> rows to compare." Default 1,000,000.
   */
  maxRows?: number;
  /** With `properties`: the most entries whose pages are read; a side with more reads none (`pagesSkipped`). Default 5,000. */
  maxPages?: number;
}

/** The most rows a side holds by default: past it a compare would keep the user waiting, and the page short of memory. */
const MAX_ROWS = 1_000_000;
/** The most entries whose pages a side reads by default: one inspect each. */
const MAX_PAGES = 5_000;
/** The most pages asked for at once: enough to keep a source across a channel busy, not to flood it. */
const PAGES_IN_FLIGHT = 32;

/** An entry: a row right under a section heading, or a top-level row of a document with no sections (a MAT-file's variable). */
const isEntry = (row: TreeTableRow): boolean =>
  row.parent !== null ? isSectionRowId(row.parent) : !isSectionRowId(row.ID);

/** A row as a side holds it: as it is, or without the `_lazy` its fetched children make untrue. */
function fetched(row: TreeTableRow): TreeTableRow {
  if (!row._lazy) return row;
  const { _lazy: _held, ...rest } = row;
  return rest as TreeTableRow;
}

/** Each entry's page, in the entries' order, at most PAGES_IN_FLIGHT asked at once. */
async function pagesOf(source: TableSource, entries: readonly TreeTableRow[]): Promise<Map<string, readonly PropertyGroup[]>> {
  const groups = new Array<readonly PropertyGroup[]>(entries.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const i = next++;
      groups[i] = (await source.inspect(entries[i].ID)).groups;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PAGES_IN_FLIGHT, entries.length) }, worker));
  return new Map(entries.map((entry, i) => [entry.ID, groups[i]]));
}

/**
 * Every row of the document `source` shows: `open()`'s (or `shown`'s) rows, then for each row held
 * back (`_lazy`) none of whose children are among them, `children()` once, the rows it answers that
 * are held back in turn; each such row then carries no `_lazy`. With `properties`, each entry's
 * `inspect()` page. Rejects as `open()` does (the table's banner text) and past `maxRows`. DOM-free:
 * runs wherever a TableSource does.
 */
export async function readDiffSide(source: TableSource, options: ReadSideOptions = {}): Promise<DiffSide> {
  const view = options.shown?.view ?? (await source.open());
  const first = options.shown?.rows ?? view.rows;
  const maxRows = options.maxRows ?? MAX_ROWS;
  const tooMany = (): Error =>
    new Error(`${decodeURIComponent(uriBasename(view.docUri))} has more than ${maxRows.toLocaleString('en-US')} rows to compare.`);

  // The rows that have a child among the rows read so far: a held-back row among them was opened
  // since the paint (its children fetched by the table), and is not asked again.
  const parents = new Set(first.map((row) => row.parent));
  const rows: TreeTableRow[] = [];
  // Each held-back row's children go right after it, so the side reads in the table's order.
  const take = async (list: readonly TreeTableRow[]): Promise<void> => {
    for (const row of list) {
      if (rows.length >= maxRows) throw tooMany();
      rows.push(fetched(row));
      if (!row._lazy || parents.has(row.ID)) continue;
      const answer = await source.children(row.ID);
      for (const child of answer.rows) parents.add(child.parent);
      await take(answer.rows);
    }
  };
  await take(first);

  const side: DiffSide = { docUri: view.docUri, rows, columns: view.columns, columnLabels: view.columnLabels };
  if (!options.properties) return side;
  const entries = rows.filter(isEntry);
  if (entries.length > (options.maxPages ?? MAX_PAGES)) return { ...side, pagesSkipped: true };
  return { ...side, pages: await pagesOf(source, entries) };
}
