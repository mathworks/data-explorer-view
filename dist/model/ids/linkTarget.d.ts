/** What a link points at. `source` is a core source id (`srcIdToUriString` turns it into a uri). */
export type LinkTarget = 
/** The entry or variable `name` in the document `source`: a Data Type, Used By or parameter link. */
{
    kind: 'entry';
    name: string;
    source: string;
}
/** A block of the model `source`, by its SID (by its name in a file older than SIDs). */
 | {
    kind: 'block';
    block: string;
    source: string;
}
/** The parameter `name` in the model workspace of `source`. */
 | {
    kind: 'workspace';
    name: string;
    source: string;
}
/** A file to open, with no row in it to select (a Model Reference or External Data link). */
 | {
    kind: 'file';
    file: string;
};
/**
 * Where a target's source begins: after the first `@` that a uri follows, else after the last
 * `@`; -1 for a target with none. See the header.
 */
export declare function sourceAt(target: string): number;
/** Read a link target: `name@source`, `blocks:<sid>@source`, `workspace:<name>@source`, or a file. */
export declare function parseLinkTarget(target: string): LinkTarget;
/**
 * The name of the row a link selects in the document `docUri` itself, or null when the link points
 * elsewhere: a Data Type link, which core builds from the document its entry lives in, so its row
 * is in this table.
 *
 * Narrow on purpose, as the VS Code extension's table has it. A block or model-workspace target
 * names something a table cannot select by that spelling, and a name with a colon is not a whole
 * entry name; both are for whoever opens documents to resolve. So is everything before a table
 * knows its document (`docUri` empty).
 */
export declare function localLinkName(target: string, docUri: string): string | null;
