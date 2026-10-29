import type { GraphSource } from './graphModel.js';
import { type SlxStructure, type SourceCache, type SourceFile, type SourceReader } from 'data-explorer-core';
/** A project's structure, keyed by store-relative POSIX path: what core's `readProjectStore` reads. */
export type ProjectStore = Record<string, string>;
/**
 * One file to shape, and what has already been extracted for it.
 *
 * NO BYTES, deliberately. Every relationship field here is an ARTIFACT the caller already
 * holds — which is the whole reason the tree reads the cache, since it must not hold a 20 MB
 * dictionary again to learn what it references. A caller that has only bytes runs the same
 * extraction the cheap tier runs (`extractSlxStructure`, `scanSldd`) and passes the result; see
 * the header for what re-deriving it in here cost.
 *
 * Every field is optional and absence is never an error: a file the cache has no artifact for
 * — oversized, unreadable, gone between the listing and the read — is still a node, because it is
 * still in the folder. It just draws no edges.
 */
export interface RawFile {
    uriString: string;
    path: string;
    projectFiles?: ProjectStore;
    structure?: SlxStructure;
    slddRefs?: readonly string[];
}
/**
 * How the tree reads: the shared cache's own reader, plus the one source the cache has no
 * concept of.
 *
 * A project is FETCHED, never cached (core's sourceCache.ts says why: for a `.prj` the store is a
 * directory tree beside the marker file, and the marker's `mtime:size` cannot key it — a
 * `matlab.toml` could be keyed, but one text file read per build is not worth a second rule
 * here). So the definition arrives here, per build, from the consumer that wants one — the
 * same layering a name index uses for the other thing the cache must not hold, unsaved bytes.
 */
export interface GraphReader extends SourceReader {
    /** A project's store, or `null` when it cannot be reached. */
    projectStore(file: SourceFile): Promise<ProjectStore | null>;
}
export declare function buildGraphSource(file: RawFile): GraphSource;
/**
 * Every file's `GraphSource`, over the shared cheap tier.
 *
 * ONE artifact per file per content change, whoever asked for it: a folder the usage plan or
 * the name index has already passed over costs a `stat` per file here and no reads at all, and
 * a folder this pass reads is one the next consumer gets for free. That is the whole of what
 * this function adds — the shaping below is `buildGraphSource`'s.
 *
 * EVERY file in `files` yields a source, including the ones the cache has no artifact for:
 * oversized, unreadable, gone between the listing and the read, or a project. A file the tree
 * dropped would vanish from the view the user is looking at, which is a worse failure than any
 * missing edge — the file IS in the folder. So the walk is over `files`, never over the cheap
 * map, and a file with no artifact gets the empty node it has always had.
 *
 * In `files` order (mapLimited writes by index), because that order is folder order and folder
 * order decides which of two same-named files a reference resolves to.
 */
export declare function graphSourcesOf(cache: SourceCache, reader: GraphReader, files: readonly SourceFile[]): Promise<GraphSource[]>;
