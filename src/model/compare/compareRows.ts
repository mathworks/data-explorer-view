// Copyright 2026 The MathWorks, Inc.
//
// A compare laid out as lines, for its two tables (`<dex-compare-view>`): the rows each table is
// given, the marks they draw, and the lines Next Change steps through.
//
// LINE FOR LINE
//
// The two tables keep their lines side by side, so each is given one row per line, under one id
// on both sides: a row's expansion, selection and scroll then follow from one table to the other
// by id. A line one side has no row for is a gap there, a blank row, so the lines below it still
// meet. The ids are the diff's keys ('line:' + RowDiff.key), not the documents' row ids, which
// embed each document's uri and so never agree; a heading keeps its section's row id
// ('section:<key>'), which is the same in every document. A MAT-file's variables have no heading,
// and draw none.
//
// WHAT A ROW IN A COMPARE IS
//
// A copy of its side's row that only shows: it follows no link (a link would open another file
// from inside a compare), holds back no children (every row is already here, readDiffSide fetched
// them) and opens no matrix (the cells compared are the rows' own). Its Usage is dropped, which
// says what the folder holds rather than the file, and is not compared.
//
// Internal to this package: the compare tab imports it by path. The diff it lays out is public.
import type { TreeTableRow } from '../rows/tableRow.js';
import type { DocumentDiff, RowDiff, SectionDiff } from './diff.js';

/** A line's mark on one side: the shape DiffMark has in <dex-tree-table> (C5), which takes it as it is. */
export interface SideMark {
  kind: 'added' | 'removed' | 'changed' | 'gap';
  /** With 'changed': the compared column keys whose cells differ. */
  columns?: readonly string[];
}

/** One line of a compare, the same on both sides: a section's heading or a row. */
export interface CompareLine {
  /** Its rows' ID on both sides: 'section:<key>' for a heading, 'line:' + RowDiff.key for a row. */
  id: string;
  /** The line it is under; null at the top. */
  parent: string | null;
  /** Its section's key. */
  section: string;
  /** For a row: its diff. */
  row?: RowDiff;
  /** For a heading: its section's diff. */
  heading?: SectionDiff;
  /** For a row: the id of its entry's line (its own, for an entry). */
  entry?: string;
  /** It differs itself: a row's status, a heading's status, is not 'same'. */
  differs: boolean;
  /** A line under it differs. */
  differsBelow: boolean;
}

/** What one table of the compare is given. */
export interface CompareSideRows {
  /** One row per line, in line order: a copy of this side's row where it has one, a gap row where not. */
  rows: TreeTableRow[];
  /** Each marked line's mark on this side, by line id. */
  marks: Map<string, SideMark>;
}

/** A diff laid out for the compare's two tables: its lines, each table's rows and marks, the changes, and the lines to open. */
export interface CompareRows {
  /** Every line drawn, parents before children, in the diff's order. */
  lines: CompareLine[];
  /** Each line by its id, for a selected or expanded row of either table. */
  byId: ReadonlyMap<string, CompareLine>;
  /** What the left table is given: a's side. */
  left: CompareSideRows;
  /** What the right table is given: b's side. */
  right: CompareSideRows;
  /** The ids of the lines that differ, in line order: what Next Change steps through. */
  changes: string[];
  /** The ids of every line a differing line is under: what to open so that every difference shows. */
  opened: string[];
}

/** How compareRows lays a diff out. */
export interface CompareRowsOptions {
  /** Leave out a line with no difference in or under it, a heading too. Default true. */
  onlyDifferences?: boolean;
}

/** What a compare's row does not carry: what would make it ask its side for more, and its Usage. */
const DROPPED = new Set(['_lazy', '_matrix', '_hasEditText', 'UsedBy']);

/**
 * A cell that follows no link: an object without its `linkTarget`; a block's parameter links with
 * none (an empty target is the table's plain-text form of a parameter, as for one that does not
 * resolve); a list of links as their text, which the table would draw as anchors whatever their
 * targets. The text the table reads of it is the same.
 */
function unlinked(cell: unknown): unknown {
  if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) return cell;
  const { linkTarget: _target, ...rest } = cell as Record<string, unknown>;
  if (Array.isArray(rest.links)) {
    const { links, ...plain } = rest;
    return { ...plain, text: (links as { text: string }[]).map((link) => link.text).join(', ') };
  }
  if (Array.isArray(rest.paramLinks)) return { ...rest, paramLinks: rest.paramLinks.map((link) => ({ ...(link as object), linkTarget: '' })) };
  return 'linkTarget' in cell ? rest : cell;
}

/** A side's row as its compare table shows it, under the line's id. */
function copyOf(row: TreeTableRow, line: CompareLine): TreeTableRow {
  const out: Record<string, unknown> = {};
  for (const [key, cell] of Object.entries(row)) if (!DROPPED.has(key)) out[key] = unlinked(cell);
  out.ID = line.id;
  out.parent = line.parent;
  return out as TreeTableRow;
}

/** A blank row where a side has none of a line. */
const gapOf = (line: CompareLine): TreeTableRow => ({ ID: line.id, parent: line.parent, Name: { label: '' }, Value: '', DataType: '', Description: '', Status: '' });

/** Lay a diff out as the compare's lines: both tables' rows, their marks, the changes in order, and the lines to open. */
export function compareRows(diff: DocumentDiff, options: CompareRowsOptions = {}): CompareRows {
  const only = options.onlyDifferences ?? true;
  const out: CompareRows = {
    lines: [],
    byId: new Map(),
    left: { rows: [], marks: new Map() },
    right: { rows: [], marks: new Map() },
    changes: [],
    opened: [],
  };
  const byId = out.byId as Map<string, CompareLine>;

  /** One line, with each side's row (or a gap) and mark. */
  const draw = (line: CompareLine, a: TreeTableRow | undefined, b: TreeTableRow | undefined, status: string, columns?: readonly string[]): void => {
    out.lines.push(line);
    byId.set(line.id, line);
    out.left.rows.push(a ? copyOf(a, line) : gapOf(line));
    out.right.rows.push(b ? copyOf(b, line) : gapOf(line));
    if (status === 'added') {
      out.left.marks.set(line.id, { kind: 'gap' });
      out.right.marks.set(line.id, { kind: 'added' });
    } else if (status === 'removed') {
      out.left.marks.set(line.id, { kind: 'removed' });
      out.right.marks.set(line.id, { kind: 'gap' });
    } else if (status === 'changed') {
      out.left.marks.set(line.id, { kind: 'changed', columns: columns ?? [] });
      out.right.marks.set(line.id, { kind: 'changed', columns: columns ?? [] });
    }
    if (line.differs) out.changes.push(line.id);
    if (line.differsBelow) out.opened.push(line.id);
  };

  const walk = (rows: readonly RowDiff[], parent: string | null, section: string, entry: string | undefined): void => {
    for (const row of rows) {
      const differs = row.status !== 'same';
      if (only && !differs && !row.changedBelow) continue;
      const id = `line:${row.key}`;
      const line: CompareLine = { id, parent, section, row, entry: entry ?? id, differs, differsBelow: row.changedBelow };
      // The columns a changed row's cells differ in; its page's properties have no cell to mark.
      const columns = row.properties.filter((p) => !p.column.startsWith('inspector:')).map((p) => p.column);
      draw(line, row.a, row.b, row.status, columns);
      walk(row.children, id, section, entry ?? id);
    }
  };

  for (const section of diff.sections) {
    let parent: string | null = null;
    if (section.a || section.b) {
      const differs = section.status !== 'same';
      const differsBelow = section.rows.some((row) => row.status !== 'same' || row.changedBelow);
      if (only && !differs && !differsBelow) continue;
      parent = `section:${section.key}`;
      draw({ id: parent, parent: null, section: section.key, heading: section, differs, differsBelow }, section.a, section.b, section.status);
      // Each side's heading counts its own file's entries, as that file's table does: not the
      // lines under it, which leave out the entries with no difference and hold the other's gaps.
      if (section.a) out.left.rows[out.left.rows.length - 1]._entryCount = section.rows.filter((row) => row.a).length;
      if (section.b) out.right.rows[out.right.rows.length - 1]._entryCount = section.rows.filter((row) => row.b).length;
    }
    walk(section.rows, parent, section.key, undefined);
  }
  return out;
}
