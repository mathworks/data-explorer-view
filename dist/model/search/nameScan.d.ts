import { type SourceCache, type SourceFile, type SourceReader } from 'data-explorer-core';
import { type NameRecord } from './nameExtract.js';
/**
 * How this scan reads: the shared cache's own reader, plus the one source the cache has no
 * concept of.
 *
 * `dirtyBytes` is SYNCHRONOUS on purpose. The override has to be decided before anything is
 * read, so that a cached parse is not taken for a file whose buffer disagrees with disk; an
 * async lookup would let the decision land after an `await` and invite exactly that ordering.
 * `null` means "nothing unsaved is open for this file", which is the common case and the one
 * that reaches the cache.
 */
export interface NameReader extends SourceReader {
    dirtyBytes(file: SourceFile): ArrayBuffer | null;
}
/**
 * One file's name records — NAMES ONLY, and nothing about how they resolve.
 *
 * Any read or parse failure contributes nothing: a corrupt or unreadable file is still a file
 * the tree lists and a tab opens, it just has no names to offer. That is why the single `catch`
 * is silent, and it is the same answer an undecodable file could give anyway.
 */
export declare function namesOfFile(cache: SourceCache, reader: NameReader, file: SourceFile): Promise<NameRecord[]>;
