import { type FolderEntry } from '../hierarchy/folderEntries.js';
import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import type { GraphReader } from '../hierarchy/graphSources.js';
import type { TablePort } from './wire.js';
/** A folder read across a channel: what folderReader returns. */
export interface FolderReader extends FolderFiles, GraphReader {
    /**
     * Hear the host say the folder changed (its FolderServer's `changed()`), until the returned
     * function is called. `uris`, when the host sent them, are the files the change touched, by
     * their uriString as the listing has them: a hint, which does not say whether each was created,
     * deleted or saved (list the folder again for that). Absent: something changed.
     */
    onChange(listener: (uris?: readonly string[]) => void): () => void;
    /** One level of `dir`, sorted (sortEntries); null when the host lists no entries (an older host). A host's error rejects. */
    entries(dir: string): Promise<readonly FolderEntry[] | null>;
    /** Stop listening, and reject what is still waiting. */
    dispose(): void;
}
/**
 * A folder whose files are read by a host across `port` (serveFolder), in the wire format
 * (wire.ts): its `list()`, its reads (`version`, `bytes`, `projectStore`) and a folder's
 * `entries(dir)` are questions to the host, and a call rejects with the host's message when its
 * listing, its reader or its listing of a folder threw. It reads
 * the files of the host's last listing, whichever `files` it is given, so one reader serves every
 * build of a hierarchy:
 *
 * ```ts
 * const folder = folderReader(portFromMessagePort(port));
 * const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
 * folder.onChange(() => hierarchy.rebuild());
 * ```
 *
 * `dispose()` stops listening, and rejects what is still waiting.
 */
export declare function folderReader(port: TablePort): FolderReader;
