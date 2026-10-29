import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import type { GraphReader } from '../hierarchy/graphSources.js';
import type { TablePort } from './wire.js';
/** A folder read across a channel: what folderReader returns. */
export interface FolderReader extends FolderFiles, GraphReader {
    /** Hear the host say the folder changed (its FolderServer's `changed()`), until the returned function is called. */
    onChange(listener: () => void): () => void;
    /** Stop listening, and reject what is still waiting. */
    dispose(): void;
}
/**
 * A folder whose files are read by a host across `port` (serveFolder), in the wire format
 * (wire.ts): its `list()` and its reads (`version`, `bytes`, `projectStore`) are questions to the
 * host, and a call rejects with the host's message when its listing or its reader threw. It reads
 * the files of the host's last listing, whichever `files` it is given, so one reader serves every
 * build of a hierarchy:
 *
 * ```ts
 * const folder = folderReader(port);
 * const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
 * folder.onChange(() => hierarchy.rebuild());
 * ```
 *
 * `dispose()` stops listening, and rejects what is still waiting.
 */
export declare function folderReader(port: TablePort): FolderReader;
