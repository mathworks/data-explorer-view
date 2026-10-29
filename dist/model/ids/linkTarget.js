// Copyright 2026 The MathWorks, Inc.
//
// What a link in a row points at, read out of its target (`dex-link-clicked`'s `target`, a
// row's `linkTarget`) as core and the row builders write it.
//
// Split at the FIRST `@`, as core's own split is: a name may hold one only where core escapes
// it, and a uri certainly may, so reading the last would point the link at another document.
// The name half of a block or model-workspace target carries its kind as a prefix with a colon,
// which an entry or variable name cannot contain.
import { srcIdToUriString } from './srcId.js';
const BLOCKS = 'blocks:';
const WORKSPACE = 'workspace:';
/** Read a link target: `name@source`, `blocks:<sid>@source`, `workspace:<name>@source`, or a file. */
export function parseLinkTarget(target) {
    const at = target.indexOf('@');
    if (at < 0)
        return { kind: 'file', file: target };
    const name = target.slice(0, at);
    const source = target.slice(at + 1);
    if (name.startsWith(BLOCKS))
        return { kind: 'block', block: name.slice(BLOCKS.length), source };
    if (name.startsWith(WORKSPACE))
        return { kind: 'workspace', name: name.slice(WORKSPACE.length), source };
    return { kind: 'entry', name, source };
}
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
export function localLinkName(target, docUri) {
    if (!docUri)
        return null;
    const link = parseLinkTarget(target);
    if (link.kind !== 'entry' || link.name === '' || link.name.includes(':'))
        return null;
    return srcIdToUriString(link.source) === docUri ? link.name : null;
}
