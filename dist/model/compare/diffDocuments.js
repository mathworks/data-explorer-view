// Copyright 2026 The MathWorks, Inc.
//
// Two documents compared, from wherever they are: two sources a page has open (diffDocuments), or
// two files given as their bytes, with no page at all (diffFiles), which is what the command
// line's `diff`, Electron's main process or a worker has.
//
// diffFiles reads each file in a workspace of its own. Two versions of one file are the usual
// thing to compare, and they share a name and often a path: in one workspace (one core session)
// the second would be refused as already open, or worse, read against the first's registered
// tree. Two workspaces share nothing, and both are disposed before the compare settles, so a
// compare leaves nothing behind in any session.
import { docKindOf } from '../source/readDocument.js';
import { sourceUri } from '../source/sourceUri.js';
import { createWorkspace } from '../source/workspace.js';
import { diffSides } from './diff.js';
import { readDiffSide } from './readSide.js';
/** How each side is read for a compare, from what the compare was asked. */
const readOptionsOf = (options) => ({
    properties: !!options.properties,
    ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
    ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
});
/** Both sides read, or the first side's failure once both have settled. */
async function bothOf(a, b) {
    const [x, y] = await Promise.allSettled([a, b]);
    if (x.status === 'rejected')
        throw x.reason;
    if (y.status === 'rejected')
        throw y.reason;
    return [x.value, y.value];
}
/** Compare the documents two sources show (a page's open documents: `doc.table`): readDiffSide of each, then diffSides. */
export async function diffDocuments(a, b, options = {}) {
    const read = readOptionsOf(options);
    const [x, y] = await bothOf(readDiffSide(a, read), readDiffSide(b, read));
    return diffSides(x, y, options);
}
/** Why a file is not one diffFiles reads, or undefined for one it reads. */
function refusalOf(name) {
    const kind = docKindOf(name);
    if (kind === undefined)
        return `${name} is not a file compare reads: it compares data dictionaries (.sldd), models (.slx, .mdl) and MAT-files (.mat).`;
    if (kind === 'project')
        return `${name} is a project, which opens on a page: compare compares data files.`;
    return undefined;
}
/** One file read as a side, in a read-only workspace of its own, disposed once read. */
async function sideOfFile(file, options) {
    const ws = createWorkspace();
    try {
        const doc = await ws.open(file.bytes, file.name, sourceUri(file.path ?? `/${file.name}`));
        return await readDiffSide(doc.table, options);
    }
    finally {
        ws.dispose();
    }
}
/**
 * Compare two files given as bytes, each read in a read-only workspace of its own (createWorkspace(),
 * no page and no DOM: Node, Electron's main process, a worker), so two versions of one file, even
 * under one path, never share a session; both workspaces are disposed before it settles. Rejects with
 * the table's banner text for a file that cannot be read ("Failed to parse plant.sldd: …"), and for a
 * project or a file of no kind this package opens.
 */
export async function diffFiles(a, b, options = {}) {
    // Both names first, so a file of no kind is refused before the other is read.
    const refusal = refusalOf(a.name) ?? refusalOf(b.name);
    if (refusal)
        throw new Error(refusal);
    const read = readOptionsOf(options);
    const [x, y] = await bothOf(sideOfFile(a, read), sideOfFile(b, read));
    return diffSides(x, y, options);
}
