import { type SourceCache } from 'data-explorer-core';
import type { UsageSource } from '../source/workspace.js';
import { UsageGraphs } from './usageGraphs.js';
import { type UsageRepostTimers } from './usageRepost.js';
/** A file the page has open, as its tab holds it. */
export interface OpenFile {
    /** Its uri: the document's (`Doc.uri`), which the graph's answers name it by. */
    readonly uri: string;
    /** Its path, which decides how it is read: a model, a dictionary, a MAT-file. */
    readonly path: string;
    /** The bytes it holds as the page last read or saved them. Another array is another version; do not write to it. */
    readonly bytes: Uint8Array;
}
/** What an OpenFilesUsage reads, and how it asks for a repaint. */
export interface OpenFilesUsageOptions {
    /** The files open now, each once. Asked at every fill and every `changed()`: keep it cheap. */
    files(): readonly OpenFile[];
    /**
     * Paint these open documents again (`Doc.repaint`), by their uris: their Usage column was last
     * filled over other files than are open now. Each is named once per burst of changes.
     */
    refill(uris: readonly string[]): void;
    /** The trailing window a burst of changes is collapsed into. Default USAGE_REPOST_DEBOUNCE_MS (300 ms). */
    delayMs?: number;
    /** The timers it waits with. Default the global ones. */
    timers?: UsageRepostTimers;
    /** The cache the reads go through. Default: one of its own. */
    cache?: SourceCache;
}
/**
 * A workspace's `usage` over the open files (createWorkspace's, or setUsage's), as connectShell
 * makes one: it is not part of the package's entries.
 */
export interface OpenFilesUsage extends UsageSource {
    /**
     * The graphs it answers from: the queries a folder session's `usage` answers, over the open
     * files, an unresolved parameter unresolved (the dictionary's name is `graphFor`'s, for a cell).
     */
    readonly graphs: UsageGraphs;
    /**
     * The files open may have changed: if they did (a file opened, closed, saved or reloaded), the
     * documents filled over the files before are owed a repaint, once the window is over. Cheap when
     * nothing changed, so an app may call it after anything at all.
     */
    changed(): void;
    /** Stop: a repaint owed is not asked for, nor any after. */
    dispose(): void;
}
/** The Usage column over `options.files()`: a UsageSource, and the repaints a change to them owes. */
export declare function createOpenFilesUsage(options: OpenFilesUsageOptions): OpenFilesUsage;
