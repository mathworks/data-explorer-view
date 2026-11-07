// Copyright 2026 The MathWorks, Inc.
//
// The Properties view of a compare: the page `<dex-property-inspector>` shows for the line selected
// in either of the compare's tables (InspectorFeed's page).
//
// The tables show one row's cells each, side by side; this page is where the user reads a change
// whole: each difference as before → after, the inspector properties no column shows among them
// (a configuration set's solver, by its group), and a value too long for its cell. A side that
// has nothing reads "(empty)", so a cleared Description does not look like nothing happened. A row
// only one side has shows its cells from that side; a heading, its entries counted. Every row is
// read-only: the compare edits nothing from here (Copy to Left and Right go through the tables).
//
// Internal to this package, as compareRows.ts is.
import type { PropertyRow } from '../inspector/piBuilder.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { InspectorView } from '../source/tableSource.js';
import { cellTextOf } from './cellText.js';
import type { CompareLine } from './compareRows.js';
import { diffSummary } from './diff.js';

/** What an array compared only as far as its element rows go says on its page (DiffOptions' `partial`). */
const PARTIAL_NOTE = 'Only the elements the table lists were compared.';

/** A read-only text row of the page. */
const property = (name: string, value: string): PropertyRow => ({ name, value, editable: false, type: 'text' });

/** A side's text as the page shows it: an empty one said, so a cleared value reads as cleared. */
const shown = (text: string): string => (text === '' ? '(empty)' : text);

/** A row's cells in the compared columns that say something, each under its heading. */
function cellsOf(row: TreeTableRow, columnLabels: Readonly<Record<string, string>>): PropertyRow[] {
  const out: PropertyRow[] = [];
  for (const [column, label] of Object.entries(columnLabels)) {
    const text = cellTextOf(row, column);
    if (text !== '') out.push(property(label, text));
  }
  return out;
}

/** The inspector's page for a compare's selected line (InspectorFeed's page); no line, no groups. */
export function comparePage(line: CompareLine | undefined, names: { left: string; right: string }, columnLabels: Readonly<Record<string, string>>): InspectorView {
  if (!line) return { groups: [] };
  if (line.heading) {
    return { rowId: line.id, groups: [{ title: line.heading.label, properties: [property('Entries', diffSummary(line.heading.counts))] }] };
  }
  const row = line.row;
  if (!row) return { groups: [] };
  // An array whose elements are not all rows is the same, or changed, only as far as they go.
  const note = row.partial ? [property('Note', PARTIAL_NOTE)] : [];
  switch (row.status) {
    case 'changed':
      return {
        rowId: line.id,
        groups: [
          {
            title: `Differences: ${names.left} → ${names.right}`,
            properties: [
              ...row.properties.map((d) => property(d.group ? `${d.group} › ${d.label}` : d.label, `${shown(d.before)} → ${shown(d.after)}`)),
              ...note,
            ],
          },
        ],
      };
    case 'added':
      return { rowId: line.id, groups: [{ title: `Only in ${names.right}`, properties: cellsOf(row.b!, columnLabels) }] };
    case 'removed':
      return { rowId: line.id, groups: [{ title: `Only in ${names.left}`, properties: cellsOf(row.a!, columnLabels) }] };
    default:
      return { rowId: line.id, groups: [{ title: 'No differences', properties: [...cellsOf(row.a!, columnLabels), ...note] }] };
  }
}
