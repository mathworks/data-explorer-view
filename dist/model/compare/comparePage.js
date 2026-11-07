import { cellTextOf } from './cellText.js';
import { diffSummary } from './diff.js';
/** What an array compared only as far as its element rows go says on its page (DiffOptions' `partial`). */
const PARTIAL_NOTE = 'Only the elements the table lists were compared.';
/** A read-only text row of the page. */
const property = (name, value) => ({ name, value, editable: false, type: 'text' });
/** A side's text as the page shows it: an empty one said, so a cleared value reads as cleared. */
const shown = (text) => (text === '' ? '(empty)' : text);
/** A row's cells in the compared columns that say something, each under its heading. */
function cellsOf(row, columnLabels) {
    const out = [];
    for (const [column, label] of Object.entries(columnLabels)) {
        const text = cellTextOf(row, column);
        if (text !== '')
            out.push(property(label, text));
    }
    return out;
}
/** The inspector's page for a compare's selected line (InspectorFeed's page); no line, no groups. */
export function comparePage(line, names, columnLabels) {
    if (!line)
        return { groups: [] };
    if (line.heading) {
        return { rowId: line.id, groups: [{ title: line.heading.label, properties: [property('Entries', diffSummary(line.heading.counts))] }] };
    }
    const row = line.row;
    if (!row)
        return { groups: [] };
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
            return { rowId: line.id, groups: [{ title: `Only in ${names.right}`, properties: cellsOf(row.b, columnLabels) }] };
        case 'removed':
            return { rowId: line.id, groups: [{ title: `Only in ${names.left}`, properties: cellsOf(row.a, columnLabels) }] };
        default:
            return { rowId: line.id, groups: [{ title: 'No differences', properties: [...cellsOf(row.a, columnLabels), ...note] }] };
    }
}
