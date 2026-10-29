// Copyright 2026 The MathWorks, Inc.
//
// What a link in a row points at, read out of its target (`dex-link-clicked`'s `target`, a
// row's `linkTarget`) as core and the row builders write it.
//
// WHERE THE NAME ENDS. A source can hold an `@`: a raw path's uri (`file:///u/me@corp/x.sldd`).
// So can one kind of name: a block target names a block of a model older than SIDs by its name,
// and Simulink lets a block's name hold one (`blocks:Gain@1@…`). An entry's or a model-workspace
// parameter's name is a MATLAB identifier, which cannot.
//
//   - An entry or workspace target splits at the first `@`, as core's own resolver of an entry
//     link does (DataModel.ts splitLinkTarget): the name cannot hold one, so the first is the end
//     of the name, whatever the source holds.
//   - A block target splits at the first `@` that a uri follows (a scheme: `file:`, `untitled:`,
//     `vscode-file:`, `binedit:`), and when no `@` is followed by one (a source spelled as a bare
//     file name, `blocks:A@B@x.sldd`), at the last.
//
// The VS Code extension's uris spell an `@` as `%40`, so on every target it writes both read what
// its own last-`@` split reads; for a raw path, and a pre-SID block's name, they read it right.
//
// The name half of a block or model-workspace target carries its kind as a prefix with a colon,
// which an entry or variable name cannot contain.
import { srcIdToUriString } from './srcId.js';
const BLOCKS = 'blocks:';
const WORKSPACE = 'workspace:';
/** A uri's scheme, at the start of what follows an `@`: what tells a source from more of a name. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
/**
 * Where a target's source begins: for a block target, after the first `@` that a uri follows,
 * else after the last `@`; for any other, after the first `@`. -1 for a target with none. See
 * the header.
 */
export function sourceAt(target) {
    if (!target.startsWith(BLOCKS))
        return target.indexOf('@');
    for (let at = target.indexOf('@'); at >= 0; at = target.indexOf('@', at + 1)) {
        if (SCHEME.test(target.slice(at + 1)))
            return at;
    }
    return target.lastIndexOf('@');
}
/** Read a link target: `name@source`, `blocks:<sid>@source`, `workspace:<name>@source`, or a file. */
export function parseLinkTarget(target) {
    const at = sourceAt(target);
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
