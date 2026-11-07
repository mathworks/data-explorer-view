// Copyright 2026 The MathWorks, Inc.
//
// Two documents compared row by row: which row of one is which row of the other, how each stands,
// what differs, and in what order the lines come. What the compare tab draws, and what the
// command line's `diff` prints, from two sides read by readDiffSide (readSide.ts).
//
// MATCHING
//
// A row is known by its section and its name path: an entry by its name in its section, a struct
// field or a bus element by its names from its entry down, a model's block by its path through the
// model (`_blockPath`: two blocks named Gain in two subsystems are two blocks). Row ids are no use
// for it: they embed the document's uri, which two versions of one file do not share. Where one
// name is held by more than one row among siblings (a dictionary may hold an entry of one name in
// two of its data sources, MATLAB's own compare lists them as two), the rows are paired by class
// first, so an entry that stayed a Simulink.Parameter is compared with the Simulink.Parameter, and
// then in their order; what is left over on one side was added or removed.
//
// ORDER
//
// The lines come in a's order, so the left table reads as a's file does; a row only b has goes
// right after the line of the row b has it after (its nearest preceding sibling that is in both),
// which keeps it beside its neighbours in the right table too. Sections the same way.
//
// WHAT IS COMPARED
//
// The text each compared column shows (cellText.ts: the table's own reading, numbers by value),
// and with `properties` the entries' inspector pages, which hold what no column shows (a
// configuration set's solver, a bus's settings). Not compared unless asked: the Name, which is
// what the rows are matched by; Usage, which says what the folder around the file holds; Status,
// Kind and the stamps, which every save and every edit rewrite.
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import { cellTextOf, sameCellText } from './cellText.js';
import type { DiffSide } from './readSide.js';

/** How a row or an entry stands: only in b, only in a, in both with a difference, in both alike. */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'same';

/** One difference of a row: a column its table shows, or (with `properties`) a property of its inspector page. */
export interface PropertyDiff {
  /** The column's key ('Value', 'DataType', 'Min', …), or `inspector:<group>/<name>` for an inspector property. */
  column: string;
  /** What the user reads it as: the column's heading ('Data Type'), or the property's name ('StopTime'). */
  label: string;
  /** An inspector property's group title ('Solver'); absent for a column. */
  group?: string;
  /** Its text in a (cellTextOf, or the page's value); '' where a has none. */
  before: string;
  /** Its text in b; '' where b has none. */
  after: string;
}

/** A row of either document, matched with the other's by its section and its name path. */
export interface RowDiff {
  /**
   * Unique in the diff, and the same in a diff of the two documents after an edit while the row's
   * path holds: for a view to key its lines by. Only `[A-Za-z0-9%~/._!*'()-]`.
   */
  key: string;
  /** The names it is matched by, from its entry down: each row's Name, a block's path (`Controller/Gain`). */
  path: readonly string[];
  /** Its own cells' (and with `properties` an entry's page's) standing; a difference under it is `changedBelow`. */
  status: DiffStatus;
  /** Its row in a; absent for an added row. */
  a?: TreeTableRow;
  /** Its row in b; absent for a removed row. */
  b?: TreeTableRow;
  /** What differs, columns first in DocumentDiff.columns' order, then page properties; empty unless `changed`. */
  properties: readonly PropertyDiff[];
  /** The rows under it, matched the same way, in the same order rule. */
  children: readonly RowDiff[];
  /** Whether a row under it is not `same`. */
  changedBelow: boolean;
  /**
   * An array whose Value is a summary (`<1x20000 double>`, `_hasEditText`) on either side with fewer
   * element rows under it than elements (core makes at most 10,000): compared only as far as its rows go.
   */
  partial?: true;
}

/** Entries counted: a row right under a section heading, or a top-level row of a document with no sections. */
export interface DiffCounts {
  added: number;
  removed: number;
  /** In both, the entry's own cells or a row under it differing. */
  changed: number;
  same: number;
}

/** A section of either document, matched by its key. */
export interface SectionDiff {
  /** Its key, as its heading row's id holds it (`section:design` → 'design'); '' for a MAT-file's variables, which have no heading. */
  key: string;
  /** Its heading as the table reads it ('Design Data'); '' for a MAT-file's. */
  label: string;
  /** 'added': only b has the heading; 'removed': only a; 'same': both (whatever its rows hold). */
  status: 'added' | 'removed' | 'same';
  /** Its heading row in a, if a has one. */
  a?: TreeTableRow;
  /** Its heading row in b, if b has one. */
  b?: TreeTableRow;
  /** Its entries, each with the rows under it. */
  rows: readonly RowDiff[];
  counts: DiffCounts;
}

/** Two documents compared: the result of diffSides, diffDocuments and diffFiles. */
export interface DocumentDiff {
  /** a's uri (DiffSide.docUri). */
  a: string;
  /** b's uri. */
  b: string;
  /** The column keys compared, a's order then b's own (DiffOptions.columns, or every column but DIFF_SKIPPED_COLUMNS). */
  columns: readonly string[];
  /** Each compared column's heading, a's over b's. */
  columnLabels: Readonly<Record<string, string>>;
  /** Whether entries' pages were compared: asked (`properties`) and read on both sides. */
  propertiesCompared: boolean;
  /** The sections, a's order, b's own after their nearest preceding match (the row order rule). */
  sections: readonly SectionDiff[];
  /** Every section's counts, summed. */
  counts: DiffCounts;
}

/** How two sides are compared. */
export interface DiffOptions {
  /** The column keys compared. Default: every column either side's table has, but DIFF_SKIPPED_COLUMNS. */
  columns?: readonly string[];
  /** Compare entries' inspector pages too (the sides must be read with `properties`); a property a compared column shows is not compared twice. Default false. */
  properties?: boolean;
  /** Two numbers this close are the same (sameCellText). Default 0. */
  tolerance?: number;
  /** Only the sections whose key or label is one of these, ignoring case (the CLI's `--section`). Default every one. */
  sections?: readonly string[];
}

/** What a compare does not compare by default: the key (Name), what the folder says (Usage), what a save says (Status), what the class says (Kind), and the stamps every edit rewrites. */
export const DIFF_SKIPPED_COLUMNS: readonly string[] = ['Name', 'UsedBy', 'Status', 'Kind', 'lastModified', 'lastModifiedBy'];

/** A Value shown as a summary for its size: `<1x20000 double>`, `<3x4x2 int8>`. */
const SUMMARY = /^<\d+(x\d+)+ [\w.]+>$/;

/** The classes whose Value is an array of elements, each a row of its own under it (`v(3)`, `c{2}`). */
const ARRAY_CLASSES = new Set([
  'double', 'single', 'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64', 'logical', 'char', 'string', 'cell',
]);

/** A side's rows by the row they are under (null for the top level), each list in the side's order: read once. */
type Below = ReadonlyMap<string | null, readonly TreeTableRow[]>;

function belowOf(side: DiffSide): Below {
  const below = new Map<string | null, TreeTableRow[]>();
  for (const row of side.rows) {
    const list = below.get(row.parent);
    if (list) list.push(row);
    else below.set(row.parent, [row]);
  }
  return below;
}

const NONE: readonly TreeTableRow[] = [];

/** The name a row is matched by among its siblings: a block's path through its model, else its Name. */
function nameOf(row: TreeTableRow): string {
  return typeof row._blockPath === 'string' && row._blockPath !== '' ? row._blockPath : (row.Name?.label ?? '');
}

/** What tells two rows of one name apart: their class, or for a row with none (a bus element) its type. */
const classOf = (row: TreeTableRow): string => cellTextOf(row, 'Class') || cellTextOf(row, 'DataType');

/** One line of two lists of siblings: the one of a, the one of b, or both. */
interface Pair<T> {
  a?: T;
  b?: T;
}

/** Each item's place, by its name: the places of the items of one name, in order. */
function placesByName<T>(items: readonly T[], name: (item: T) => string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  items.forEach((item, i) => {
    const key = name(item);
    const list = out.get(key);
    if (list) list.push(i);
    else out.set(key, [i]);
  });
  return out;
}

/**
 * Two lists of siblings as lines, by the matching and order rules above: a name once on each side
 * is a pair whatever the class; a name repeated on either side pairs the k-th of each class in a
 * with the k-th of that class in b, then the rows left over k-th with k-th. Lines in a's order;
 * a row only in b right after the line of its nearest preceding sibling in b that is paired (after
 * the ones put there before it), or before every line where none precedes it.
 */
function align<T>(as: readonly T[], bs: readonly T[], name: (item: T) => string, kind: (item: T) => string): Pair<T>[] {
  const partnerOfA = new Array<number>(as.length).fill(-1);
  const partnerOfB = new Array<number>(bs.length).fill(-1);
  const pair = (i: number, j: number): void => {
    partnerOfA[i] = j;
    partnerOfB[j] = i;
  };
  const bPlaces = placesByName(bs, name);
  for (const [key, aList] of placesByName(as, name)) {
    const bList = bPlaces.get(key);
    if (!bList) continue;
    if (aList.length === 1 && bList.length === 1) {
      pair(aList[0], bList[0]);
      continue;
    }
    // By class first: the k-th of a class with the k-th of the same class. (Places in bList.)
    const bOfKind = placesByName(bList, (j) => kind(bs[j]));
    const taken = new Map<string, number>();
    for (const i of aList) {
      const k = kind(as[i]);
      const n = taken.get(k) ?? 0;
      const place = bOfKind.get(k)?.[n];
      if (place === undefined) continue;
      taken.set(k, n + 1);
      pair(i, bList[place]);
    }
    // Then what is left of the name, in order.
    const aLeft = aList.filter((i) => partnerOfA[i] < 0);
    const bLeft = bList.filter((j) => partnerOfB[j] < 0);
    for (let n = 0; n < Math.min(aLeft.length, bLeft.length); n++) pair(aLeft[n], bLeft[n]);
  }

  // b's rows of no pair, by the a line they follow (-1: before every line), in b's order.
  const after = new Map<number, number[]>();
  let last = -1;
  bs.forEach((_, j) => {
    if (partnerOfB[j] >= 0) {
      last = partnerOfB[j];
      return;
    }
    const list = after.get(last);
    if (list) list.push(j);
    else after.set(last, [j]);
  });
  const lines: Pair<T>[] = [];
  for (const j of after.get(-1) ?? []) lines.push({ b: bs[j] });
  as.forEach((item, i) => {
    lines.push(partnerOfA[i] >= 0 ? { a: item, b: bs[partnerOfA[i]] } : { a: item });
    for (const j of after.get(i) ?? []) lines.push({ b: bs[j] });
  });
  return lines;
}

/** A name as one step of a key: its own characters a uri keeps, but `~`, which keys a repeated name's place. */
const enc = (s: string): string => encodeURIComponent(s).replace(/~/g, '%7E');

/** What every row of one compare is compared by: both sides, as read once, and the options. */
interface Compare {
  aBelow: Below;
  bBelow: Below;
  aPages?: ReadonlyMap<string, readonly PropertyGroup[]>;
  bPages?: ReadonlyMap<string, readonly PropertyGroup[]>;
  columns: readonly string[];
  columnLabels: Readonly<Record<string, string>>;
  /** The labels of either side's columns: a page property under one is a column's, compared there or skipped there. */
  shownLabels: ReadonlySet<string>;
  tolerance: number;
}

/** An inspector page's properties, by `inspector:<group>/<name>`, in its order; the first of a key twice. */
function pagePropertiesOf(groups: readonly PropertyGroup[], compare: Compare): Map<string, { label: string; group: string; value: string }> {
  const out = new Map<string, { label: string; group: string; value: string }>();
  for (const group of groups) {
    for (const property of group.properties) {
      if (property.name === 'Name' || compare.shownLabels.has(property.name)) continue;
      const key = `inspector:${group.title}/${property.name}`;
      if (!out.has(key)) out.set(key, { label: property.name, group: group.title, value: property.value ?? '' });
    }
  }
  return out;
}

/** What differs between two matched rows: the compared columns' texts, then (where both sides have one) their entry's page. */
function differencesOf(a: TreeTableRow, b: TreeTableRow, compare: Compare): PropertyDiff[] {
  const out: PropertyDiff[] = [];
  for (const column of compare.columns) {
    const before = cellTextOf(a, column);
    const after = cellTextOf(b, column);
    if (!sameCellText(before, after, compare.tolerance)) out.push({ column, label: compare.columnLabels[column] ?? column, before, after });
  }
  const aPage = compare.aPages?.get(a.ID);
  const bPage = compare.bPages?.get(b.ID);
  if (aPage && bPage) {
    const before = pagePropertiesOf(aPage, compare);
    const after = pagePropertiesOf(bPage, compare);
    // a's order, then what only b's page has, in its order. A property one page lacks reads ''
    // there, so one the other page holds empty is no difference the user could see.
    for (const key of unionOf([...before.keys()], [...after.keys()])) {
      const x = before.get(key);
      const y = after.get(key);
      const { label, group } = (x ?? y)!;
      const was = x?.value ?? '';
      const is = y?.value ?? '';
      if (!sameCellText(was, is, compare.tolerance)) out.push({ column: key, label, group, before: was, after: is });
    }
  }
  return out;
}

/** The product of a shape's dimensions, from a row's `_matrix` or its summary (`<1x20000 double>`); undefined for neither. */
function elementCountOf(row: TreeTableRow, value: string, summary: boolean): number | undefined {
  const dims = row._matrix?.dims ?? (summary ? value.slice(1).split(' ')[0].split('x').map(Number) : undefined);
  return dims?.reduce((n, d) => n * d, 1);
}

/** Whether a row is an array shown as a summary, with fewer element rows under it than it has elements. */
function isPartial(row: TreeTableRow | undefined, below: Below): boolean {
  if (!row) return false;
  const value = cellTextOf(row, 'Value');
  const summary = SUMMARY.test(value);
  if (!summary && (row as { _hasEditText?: unknown })._hasEditText !== true) return false;
  if (!ARRAY_CLASSES.has(cellTextOf(row, 'Class'))) return false;
  const elements = elementCountOf(row, value, summary);
  if (elements === undefined) return false;
  const shown = (below.get(row.ID) ?? NONE).filter((child) => child.Name?.element === true).length;
  return shown < elements;
}

/** Two lists of sibling rows matched, each line with the rows under it, keyed under `prefix` and named under `path`. */
function diffRows(as: readonly TreeTableRow[], bs: readonly TreeTableRow[], prefix: string, path: readonly string[], compare: Compare): RowDiff[] {
  const lines = align(as, bs, nameOf, classOf);
  // A name held by more than one row on either side is keyed by its place among its lines.
  const aCount = placesByName(as, nameOf);
  const bCount = placesByName(bs, nameOf);
  const repeated = (name: string): boolean => (aCount.get(name)?.length ?? 0) > 1 || (bCount.get(name)?.length ?? 0) > 1;
  const seen = new Map<string, number>();
  return lines.map(({ a, b }) => {
    const name = nameOf((a ?? b)!);
    let step = enc(name);
    if (repeated(name)) {
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      step = `${step}~${n}`;
    }
    const key = `${prefix}/${step}`;
    const here = [...path, name];
    const children = diffRows(a ? (compare.aBelow.get(a.ID) ?? NONE) : NONE, b ? (compare.bBelow.get(b.ID) ?? NONE) : NONE, key, here, compare);
    const properties = a && b ? differencesOf(a, b, compare) : [];
    const status: DiffStatus = !b ? 'removed' : !a ? 'added' : properties.length > 0 ? 'changed' : 'same';
    const row: RowDiff = {
      key,
      path: here,
      status,
      ...(a ? { a } : {}),
      ...(b ? { b } : {}),
      properties,
      children,
      changedBelow: children.some((child) => child.status !== 'same' || child.changedBelow),
    };
    if (isPartial(a, compare.aBelow) || isPartial(b, compare.bBelow)) row.partial = true;
    return row;
  });
}

/** A side's sections: each heading with its entries, and a document's top-level rows that are no heading as the section '' (a MAT-file's). */
interface SideSection {
  key: string;
  heading?: TreeTableRow;
  entries: readonly TreeTableRow[];
}

function sectionsOf(below: Below): SideSection[] {
  const out: SideSection[] = [];
  let loose: { key: string; entries: TreeTableRow[] } | undefined;
  for (const row of below.get(null) ?? NONE) {
    const key = isSectionRowId(row.ID) ? sectionNameFromRowId(row.ID) : null;
    if (key !== null) {
      out.push({ key, heading: row, entries: below.get(row.ID) ?? NONE });
      continue;
    }
    if (!loose) out.push((loose = { key: '', entries: [] }));
    loose.entries.push(row);
  }
  // A document with no headings has its one section even when it holds nothing (an empty
  // MAT-file), so that what the other side holds there reads as added to it, not as a section.
  if (out.length === 0) out.push({ key: '', entries: NONE });
  return out;
}

/** A section's entries counted: an entry in both is changed when it or a row under it differs. */
function countsOf(rows: readonly RowDiff[]): DiffCounts {
  const counts: DiffCounts = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const row of rows) {
    if (row.status === 'added') counts.added++;
    else if (row.status === 'removed') counts.removed++;
    else if (row.status === 'changed' || row.changedBelow) counts.changed++;
    else counts.same++;
  }
  return counts;
}

/** Each list's items once, the first list's order then what only the later ones add. */
const unionOf = (...lists: (readonly string[])[]): string[] => [...new Set(lists.flat())];

/** Compare two read sides. Synchronous and pure: the same sides give the same diff. */
export function diffSides(a: DiffSide, b: DiffSide, options: DiffOptions = {}): DocumentDiff {
  const columns = options.columns ? unionOf(options.columns) : unionOf(a.columns, b.columns).filter((c) => !DIFF_SKIPPED_COLUMNS.includes(c));
  const columnLabels: Record<string, string> = {};
  for (const column of columns) columnLabels[column] = a.columnLabels[column] ?? b.columnLabels[column] ?? column;
  const propertiesCompared = !!options.properties && !!a.pages && !!b.pages;
  const compare: Compare = {
    aBelow: belowOf(a),
    bBelow: belowOf(b),
    ...(propertiesCompared ? { aPages: a.pages, bPages: b.pages } : {}),
    columns,
    columnLabels,
    shownLabels: new Set([...Object.values(a.columnLabels), ...Object.values(b.columnLabels)]),
    tolerance: options.tolerance ?? 0,
  };
  const wanted = options.sections && new Set(options.sections.map((s) => s.toLowerCase()));

  const sections: SectionDiff[] = [];
  for (const { a: x, b: y } of align(sectionsOf(compare.aBelow), sectionsOf(compare.bBelow), (s) => s.key, () => '')) {
    const heading = x?.heading ?? y?.heading;
    const key = (x ?? y)!.key;
    const label = heading ? cellTextOf(heading, 'Name') : '';
    if (wanted && !wanted.has(key.toLowerCase()) && !wanted.has(label.toLowerCase())) continue;
    const rows = diffRows(x?.entries ?? NONE, y?.entries ?? NONE, enc(key), [], compare);
    sections.push({
      key,
      label,
      status: !y ? 'removed' : !x ? 'added' : 'same',
      ...(x?.heading ? { a: x.heading } : {}),
      ...(y?.heading ? { b: y.heading } : {}),
      rows,
      counts: countsOf(rows),
    });
  }
  const counts: DiffCounts = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const section of sections) {
    counts.added += section.counts.added;
    counts.removed += section.counts.removed;
    counts.changed += section.counts.changed;
    counts.same += section.counts.same;
  }
  return { a: a.docUri, b: b.docUri, columns, columnLabels, propertiesCompared, sections, counts };
}

/** "3 changed, 1 added, 2 removed": the counts that are not 0, in that order; "No differences" for none. */
export function diffSummary(counts: DiffCounts): string {
  const { changed, added, removed } = counts;
  return [changed && `${changed} changed`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ') || 'No differences';
}
