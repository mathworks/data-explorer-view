import type { TableSource } from '../source/tableSource.js';
import { type DiffOptions, type DocumentDiff } from './diff.js';
import { type ReadSideOptions } from './readSide.js';
/** A file to compare, as its bytes. */
export interface DiffFile {
    /** Its content (kept: not written to afterwards). */
    bytes: Uint8Array | ArrayBuffer;
    /** Its name, by which its kind is told ('plant.sldd'). */
    name: string;
    /** Its path, for the uri it is read under (`sourceUri(path)`). Default '/' + name. */
    path?: string;
}
/** Compare the documents two sources show (a page's open documents: `doc.table`): readDiffSide of each, then diffSides. */
export declare function diffDocuments(a: TableSource, b: TableSource, options?: DiffOptions & Pick<ReadSideOptions, 'maxRows' | 'maxPages'>): Promise<DocumentDiff>;
/**
 * Compare two files given as bytes, each read in a read-only workspace of its own (createWorkspace(),
 * no page and no DOM: Node, Electron's main process, a worker), so two versions of one file, even
 * under one path, never share a session; both workspaces are disposed before it settles. Rejects with
 * the table's banner text for a file that cannot be read ("Failed to parse plant.sldd: …"), and for a
 * project or a file of no kind this package opens.
 */
export declare function diffFiles(a: DiffFile, b: DiffFile, options?: DiffOptions & Pick<ReadSideOptions, 'maxRows' | 'maxPages'>): Promise<DocumentDiff>;
