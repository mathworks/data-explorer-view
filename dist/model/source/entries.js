// Copyright 2026 The MathWorks, Inc.
//
// A document's sections and their entries, read off the rows its table shows: what the app's
// command line lists for a file (`info`: its sections, with their entries counted), and what a
// folder check reads of each file it looks at (check/folderCheck.ts: a dictionary's Design Data, a
// model's workspace, a MAT-file's variables, each entry by name and class).
//
// An ENTRY is a row right under a section heading, or, in a MAT-file, which has no heading, a row
// at the top level. Not a row below one: a struct's field, a bus's element and a matrix's cell are
// rows of the table too, and a reader that took every row would count each as an entry of its own.
//
// FROM THE TABLE, so the sections are the ones the user sees, in the order and under the headings
// the table draws, and a reader of a file needs nothing of core's node tree. A paint that holds rows
// back (`_lazy`) holds back what lies under the entries, never the entries themselves (lazyRows.ts:
// the top level of a row plan comes whole), so the view alone almost always has them all. A heading
// whose entries a source did hold back is asked for them once, and nothing below an entry is ever
// asked for: those rows are not entries, and a large file's would cost the whole read again.
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
/**
 * A document's sections and their entries: from `shown` (a view the caller already read) or from
 * `open()`, and for a heading held back (`_lazy`) none of whose rows the paint holds, `children()`
 * once. Nothing below an entry is read. Rejects as `open()` does (the table's banner text). DOM-free.
 */
export async function readEntries(source, shown) {
    const view = shown ?? (await source.open());
    // Each heading's entries, by its id, in the view's order: one pass over the rows rather than one
    // per heading, as a model's view holds a row for every block and every one of its parameters.
    const under = new Map();
    for (const row of view.rows) {
        if (typeof row.parent !== 'string' || !isSectionRowId(row.parent))
            continue;
        const entries = under.get(row.parent);
        if (entries)
            entries.push(row);
        else
            under.set(row.parent, [row]);
    }
    const sections = [];
    // The top-level rows that are no heading: a MAT-file's variables, its one section, placed where
    // the first of them is.
    let loose;
    for (const row of view.rows) {
        if ((row.parent ?? null) !== null)
            continue;
        if (isSectionRowId(row.ID)) {
            let entries = under.get(row.ID) ?? [];
            // A heading the paint held back whole: its rows, fetched, are its entries and possibly what
            // lies under them (a source may answer more than one level), of which only the first counts.
            if (entries.length === 0 && row._lazy)
                entries = (await source.children(row.ID)).rows.filter((r) => r.parent === row.ID);
            sections.push({ key: sectionNameFromRowId(row.ID), label: row.Name?.label ?? '', heading: row, entries });
        }
        else if (loose) {
            loose.push(row);
        }
        else {
            loose = [row];
            sections.push({ key: '', label: '', entries: loose });
        }
    }
    return sections;
}
