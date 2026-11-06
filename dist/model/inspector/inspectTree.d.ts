import type { RawTree } from '../raw/rawOfRow.js';
import type { InspectOptions, InspectorView } from '../source/tableSource.js';
/** The open documents' trees, as core's session lists them: whom a file references, and who references it. */
export interface OpenSources {
    getDataSourceIds(): string[];
    getDataSource(srcId: string): unknown;
}
/** A document's tree, as `inspectTree` reads it: the Raw pane's (RawTree), and what a file's page says besides. */
export interface InspectedTree extends RawTree {
    /** The file's name (`params.sldd`). Default: the last segment of its uri (`fileIds[0]`). */
    readonly name?: string;
    /**
     * The session the document's tree is registered in, which every open document of its workspace
     * shares: the files its page lists as open. Absent: it lists none open, and no file as
     * referencing it.
     */
    readonly sources?: OpenSources;
    /** Whether the document holds edits its file does not. Absent: it never does (a read-only document). */
    dirty?(): boolean;
}
/** The inspector's page for `selection` of the document `tree` is of: see the head of this file. Never throws. */
export declare function inspectTree(tree: InspectedTree, selection: string | readonly string[], options?: InspectOptions): InspectorView;
