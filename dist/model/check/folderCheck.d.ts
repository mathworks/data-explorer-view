import { type SourceCache, type SourceFile } from 'data-explorer-core';
import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import { type GraphReader } from '../hierarchy/graphSources.js';
/** How a file names another: a model's model reference, its data dictionary, its other external data, or a dictionary's referenced dictionary. */
export type ReferenceRelation = 'model reference' | 'data dictionary' | 'external data' | 'referenced dictionary';
/** One thing a check found. Files are named by their uris (SourceFile.uriString). */
export type CheckFinding = {
    kind: 'unresolved-reference';
    /** The file that names it. */
    file: string;
    relation: ReferenceRelation;
    /** The name it gives, as the file records it (`plant.slx`). */
    reference: string;
} | {
    kind: 'cycle';
    /** Files that reference each other round in a circle, its first again at the end: the shortest circle through the first of them by uri (code-unit order, JavaScript's `<`). */
    files: readonly string[];
} | {
    kind: 'unused';
    file: string;
    /** Its entry's section: 'design' (a dictionary's Design Data), 'workspace' (a model's), '' (a MAT-file's variables). */
    section: string;
    entry: string;
} | {
    kind: 'shadowed';
    /** The model whose workspace defines it. */
    model: string;
    variable: string;
    /** The dictionary or MAT-file whose definition of the same name the workspace's hides from the model's blocks. */
    hidden: string;
} | {
    kind: 'duplicate';
    entry: string;
    /** The dictionaries of one scope (a dictionary and those it references, or the dictionaries a model links) that each define it, by uri in code-unit order (JavaScript's `<`). */
    files: readonly string[];
};
/** What a check finds, by name: CheckFinding's `kind`. */
export type CheckFindingKind = CheckFinding['kind'];
/** The kinds, in the order a check lists them. */
export declare const CHECK_FINDING_KINDS: readonly CheckFindingKind[];
/**
 * Classes whose entries are never `unused`: what a model uses by name where core's usage index does
 * not look. Data types are named in a port's or a signal's data type, which core does not read as a
 * block parameter. A Simulink.Signal is resolved by a signal's name.
 */
export declare const UNUSED_SKIPPED_CLASSES: readonly string[];
/** What a check of a folder found. */
export interface FolderCheck {
    /** In CHECK_FINDING_KINDS order, each kind in the order its rule gives. */
    findings: readonly CheckFinding[];
    /** Data files (dictionaries, MAT-files) that read but that no model of the folder links, directly or through a dictionary: their entries were not looked at for `unused`. In folder order. */
    notChecked: readonly string[];
    /** Files that did not read, and why, in folder order: their entries are in no finding. */
    unreadable: readonly {
        file: string;
        message: string;
    }[];
    /** How many files the folder listed, projects too. */
    files: number;
    /** The listing stopped at a limit (FolderFileList.truncated): only its first files were checked. */
    truncated: boolean;
}
/** What a check reads: what a folder session reads (FolderSessionOptions' files and reader). */
export interface CheckFolderOptions {
    files: FolderFiles;
    reader(files: readonly SourceFile[]): GraphReader;
    /** The cache its reads go through: a folder session's (`session.cache`), so that a folder an app shows is not read twice. Default: one of its own. */
    cache?: SourceCache;
}
/**
 * Check a folder: its files' references (the hierarchy's graph), and their entries against the
 * usage index (the Usage column's). Every data file and model is also opened, whole, one at a
 * time, in a read-only workspace of its own, for its entries' sections and classes. Rejects only
 * when the listing does; a file that does not read is `unreadable`.
 */
export declare function checkFolder(options: CheckFolderOptions): Promise<FolderCheck>;
