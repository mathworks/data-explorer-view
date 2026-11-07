/** What a compare's row does not carry: what would make it ask its side for more, and its Usage. */
const DROPPED = new Set(['_lazy', '_matrix', '_hasEditText', 'UsedBy']);
/**
 * A cell that follows no link: an object without its `linkTarget`; a block's parameter links with
 * none (an empty target is the table's plain-text form of a parameter, as for one that does not
 * resolve); a list of links as their text, which the table would draw as anchors whatever their
 * targets. The text the table reads of it is the same.
 */
function unlinked(cell) {
    if (cell === null || typeof cell !== 'object' || Array.isArray(cell))
        return cell;
    const { linkTarget: _target, ...rest } = cell;
    if (Array.isArray(rest.links)) {
        const { links, ...plain } = rest;
        return { ...plain, text: links.map((link) => link.text).join(', ') };
    }
    if (Array.isArray(rest.paramLinks))
        return { ...rest, paramLinks: rest.paramLinks.map((link) => ({ ...link, linkTarget: '' })) };
    return 'linkTarget' in cell ? rest : cell;
}
/** A side's row as its compare table shows it, under the line's id. */
function copyOf(row, line) {
    const out = {};
    for (const [key, cell] of Object.entries(row))
        if (!DROPPED.has(key))
            out[key] = unlinked(cell);
    out.ID = line.id;
    out.parent = line.parent;
    return out;
}
/** A blank row where a side has none of a line. */
const gapOf = (line) => ({ ID: line.id, parent: line.parent, Name: { label: '' }, Value: '', DataType: '', Description: '', Status: '' });
/** Lay a diff out as the compare's lines: both tables' rows, their marks, the changes in order, and the lines to open. */
export function compareRows(diff, options = {}) {
    const only = options.onlyDifferences ?? true;
    const out = {
        lines: [],
        byId: new Map(),
        left: { rows: [], marks: new Map() },
        right: { rows: [], marks: new Map() },
        changes: [],
        opened: [],
    };
    const byId = out.byId;
    /** One line, with each side's row (or a gap) and mark. */
    const draw = (line, a, b, status, columns) => {
        out.lines.push(line);
        byId.set(line.id, line);
        out.left.rows.push(a ? copyOf(a, line) : gapOf(line));
        out.right.rows.push(b ? copyOf(b, line) : gapOf(line));
        if (status === 'added') {
            out.left.marks.set(line.id, { kind: 'gap' });
            out.right.marks.set(line.id, { kind: 'added' });
        }
        else if (status === 'removed') {
            out.left.marks.set(line.id, { kind: 'removed' });
            out.right.marks.set(line.id, { kind: 'gap' });
        }
        else if (status === 'changed') {
            out.left.marks.set(line.id, { kind: 'changed', columns: columns ?? [] });
            out.right.marks.set(line.id, { kind: 'changed', columns: columns ?? [] });
        }
        if (line.differs)
            out.changes.push(line.id);
        if (line.differsBelow)
            out.opened.push(line.id);
    };
    const walk = (rows, parent, section, entry) => {
        for (const row of rows) {
            const differs = row.status !== 'same';
            if (only && !differs && !row.changedBelow)
                continue;
            const id = `line:${row.key}`;
            const line = { id, parent, section, row, entry: entry ?? id, differs, differsBelow: row.changedBelow };
            // The columns a changed row's cells differ in; its page's properties have no cell to mark.
            const columns = row.properties.filter((p) => !p.column.startsWith('inspector:')).map((p) => p.column);
            draw(line, row.a, row.b, row.status, columns);
            walk(row.children, id, section, entry ?? id);
        }
    };
    for (const section of diff.sections) {
        let parent = null;
        if (section.a || section.b) {
            const differs = section.status !== 'same';
            const differsBelow = section.rows.some((row) => row.status !== 'same' || row.changedBelow);
            if (only && !differs && !differsBelow)
                continue;
            parent = `section:${section.key}`;
            draw({ id: parent, parent: null, section: section.key, heading: section, differs, differsBelow }, section.a, section.b, section.status);
        }
        walk(section.rows, parent, section.key, undefined);
    }
    return out;
}
