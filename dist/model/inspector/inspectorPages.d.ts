import type { GraphBox, RelationshipGraph } from '../graph/graphTypes.js';
import type { PropertyGroup, PropertyRow } from './piBuilder.js';
/** What a file's page calls the kind of file `name` is; empty for a kind the inspector does not name. */
export declare function fileKindOf(name: string): string;
/** Another file, as a file's page lists it among its references: its name, where a click goes, and its state. */
export interface FileLink {
    /** The file's name, as the page shows it. */
    name: string;
    /**
     * What a click on it asks to open (`dex-property-navigate`'s target): the file's uri where it is
     * known, else its name as the referencing file wrote it, which a link to a file resolves as a
     * Model Reference row's does (beside that file, or where a folder shown has it).
     */
    target: string;
    /** What the row says of it: whether it is open ('Open', 'Not open'), or was found at all ('Not found'). */
    state: string;
}
/** What a file's page says of the file. */
export interface FileFacts {
    /** Its name (`params.sldd`). */
    name: string;
    /** Where it is, as the host names it; empty where there is no file to name (a reference never found). */
    path: string;
    /** Whether it holds edits its file does not; absent for a file that is not open, which holds none. */
    modified?: boolean;
    /** Its own rows, after its name and kind: core's facts of it (a dictionary's release, format and size). */
    more?: PropertyRow[];
    /** The files it references, in the order it names them. */
    references: readonly FileLink[];
    /** The files that reference it. */
    referencedBy: readonly FileLink[];
}
/**
 * A file's page: General (its name, kind, core's facts of it, where it is and whether it holds
 * edits), then References and Referenced By, each file a link to it, where it has any.
 */
export declare function filePropertyGroups(facts: FileFacts): PropertyGroup[];
/**
 * The rows of a file's root node core describes it by, past its name: a dictionary's release, file
 * format and number of entries, a model's release. Not a fact core has no value for (a .mdl's
 * release, which its text may not say). Read-only: none is an edit of the document.
 */
export declare function rootRows(root: any, rows: (node: any) => PropertyGroup[]): PropertyRow[];
/**
 * A section heading's page: its name, the file it is a section of and how many entries it holds,
 * then its entries counted by type (a block by its block type), where it holds any.
 */
export declare function sectionPropertyGroups(section: any, fileName: string): PropertyGroup[];
/**
 * The page of a selection of `count` rows: how many are selected, and those of them that are
 * entries (`nodes`: a section heading is none) counted by type.
 */
export declare function selectionPropertyGroups(nodes: readonly unknown[], count: number): PropertyGroup[];
/**
 * A table row's Usage cell (`UsedBy`) as a group of the inspector's, its links the cell's: for a
 * block's row, what its parameters read ("Uses": each parameter, its value a link to the variable,
 * or core's own cell before a usage graph filled it); for any other, who uses it ("Used By": each
 * block a link to it, with its path and model, or core's own list of links). Null for a cell with
 * nothing in it, which the page leaves out.
 */
export declare function usedByGroup(row: {
    UsedBy?: unknown;
    _isBlockRow?: boolean;
} | undefined): PropertyGroup | null;
/**
 * The files a file's root node names, as it names them, each once: a model's data dictionary, its
 * External Data and its Model References (core completes a reference's extension); a dictionary's
 * references. None for a MAT-file, which names no file.
 */
export declare function fileReferences(root: any): string[];
/**
 * Whether the reference `ref` names the file `name`: by its name in any case, as core resolves a
 * reference (refBasename), and a model by its name without the extension (a model reference names
 * `.slx` where the file is `.mdl`, modelNameOf).
 */
export declare function namesFile(ref: string, name: string): boolean;
/**
 * The page of the file a relationship graph's box stands for, `id` the box or an item in it: what
 * the graph knows of the file (it need not be open: the graph draws a folder's files too), its
 * References and Referenced By the boxes its edges between files reach, each a link to its file (a
 * ghost, a file referenced and not found, by the name it was referenced by). `open` says whether a
 * file is open, and holding edits. Null for an id the graph does not draw.
 */
export declare function graphFilePage(graph: RelationshipGraph, id: string, open: (uri: string) => {
    dirty: boolean;
} | undefined): {
    box: GraphBox;
    groups: PropertyGroup[];
} | null;
