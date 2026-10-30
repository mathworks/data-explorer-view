/** What the file on disk holds, entry by entry, for one document's Status column. */
export declare class EntryBaseline {
    private baseline;
    /** Capture the model's entries as the last-saved baseline. */
    capture(model: any): void;
    /**
     * The names of the entries whose serialization differs from the baseline (or that it has no
     * entry for: newly added). Empty when no baseline was ever captured.
     */
    modified(model: any): Set<string>;
    /**
     * Whether ONE entry differs from the baseline: what an entry-scoped repaint asks, which must not
     * serialize every entry of the dictionary to answer about one. False with no baseline.
     */
    isModified(entry: any): boolean;
    /** Drop the baseline (the last view of the document closed). */
    clear(): void;
}
/**
 * What a text-backed document knows about where its baseline came from — which is what decides
 * when a repaint has to take a new one.
 *
 * The baseline is the file ON DISK, and a TextDocument only says it reads what the file says at a
 * few moments: when it is clean as a view opens, when it turns clean (a save, a revert), and when a
 * reload from disk is found to have left it equal to the file. Each of those records the version
 * (`cleanAt`), and the next wide repaint that reads exactly that version — it parses the text
 * anyway — captures from it.
 */
export interface BaselineSource {
    /** Whether a baseline has been captured for the document at all. */
    captured: boolean;
    /** A baseline is being read from the file on disk (a document already dirty when opened). */
    pending: boolean;
    /** The document version the baseline was captured at; -1 when it came from the disk bytes. */
    version: number;
    /** The newest document version known to read what the file on disk says; -1 for none. */
    cleanAt: number;
}
/**
 * Whether a repaint that read the document at `versionRead` has to capture the baseline from what
 * it read: when there is none yet and none is on its way from the disk, and when this is a version
 * known to read what the file says that the baseline is not already of. While the disk read is
 * pending, only the second.
 */
export declare function baselineOwed(source: BaselineSource, versionRead: number): boolean;
/**
 * Whether the file's bytes, read for a document opened dirty, may still become its baseline:
 * `cleanAtBefore` is what `cleanAt` was when the read began. Not once a baseline has been taken,
 * and not once the document turned clean in that time even if none was.
 */
export declare function diskBaselineUsable(source: BaselineSource, cleanAtBefore: number): boolean;
/** What a file's stat says about its bytes without reading them. */
export interface DiskStamp {
    mtime: number;
    size: number;
}
/**
 * Whether the file is as it was when `known` was taken — so a change to a document that read the
 * same as it then cannot have been a reload of it. An unknown stamp proves nothing.
 */
export declare function sameDiskStamp(known: DiskStamp | null, now: DiskStamp): boolean;
