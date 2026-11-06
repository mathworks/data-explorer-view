import { type BrowserDir } from './walk.js';
/**
 * What reads a file: a handle, which reads the file as it is now; a File, a reference to the file
 * whose lastModified and size are as they were when it was picked, and which the browser may
 * refuse to read once another program has written the file (Chromium does); or bytes the page holds.
 */
export type BrowserSource = {
    kind: 'handle';
    handle: FileSystemFileHandle;
} | {
    kind: 'file';
    file: File;
} | {
    kind: 'bytes';
    bytes: Uint8Array;
};
/** A file the page has: its name (the tab's), and what reads it. */
export interface BrowserFile {
    /** The file's name, with its extension: what its tab says, and how its kind is told. */
    name: string;
    /** What reads it. */
    source: BrowserSource;
}
/**
 * What a tooltip says of the file at `path`: what the path means to the user rather than the path
 * made up for it. A pick's folder, `/files/<n>/`, is the page's own, so a pick's file is its name; a
 * shown folder's file is its place in the folder (`plant/models/ctrlA.slx`), the root's slash being
 * the page's too.
 */
export declare function titleOfPath(path: string): string;
/**
 * When the file of `source` was last written and how long it is, without reading it: a handle's as
 * of now, a File's as it was picked. Null for bytes the page holds, or a handle whose file is gone.
 */
export declare function statOf(source: BrowserSource): Promise<{
    lastModified: number;
    size: number;
} | null>;
/** The version of `source` a change shows in, `lastModified:size`, or null (statOf). */
export declare function stampOf(source: BrowserSource): Promise<string | null>;
/**
 * The browser host's registry of the files a page has, by the paths the page made for them. One per
 * host, inside it: an app sees only `host.files` (BrowserFiles: addPicked, get and has), so the path
 * scheme, the folder roots and the reads stay the host's to change.
 */
export declare class WebFiles {
    private readonly entries;
    private readonly folders;
    /** The pick folder of each group an app named (addToGroup), by its name. */
    private readonly groups;
    private picks;
    /** A file picked on its own: `/files/<n>/<name>`, so two `a.sldd` from two picks differ. */
    addPicked(name: string, source: BrowserSource): Promise<string>;
    /**
     * The files of one pick, beside each other in its folder `/files/<n>/` as they were on disk, so a
     * model's link to a dictionary picked with it, which names it alone, finds it. A name the pick
     * already has (files dropped from two folders) starts the next pick's folder. A handle to a file
     * the page has a path for already (picked before, or in a shown folder) keeps that path, so the
     * file opens in the tab it has; Files cannot be told apart, and each takes a path of its own.
     */
    addPick(picked: readonly BrowserFile[]): Promise<string[]>;
    /**
     * Files of the app's own into the group named `group`: a folder `/files/<n>/` made the first time
     * the name has a file, which every later file of the group joins, so a link from one to another
     * finds it whenever each was added. A group is one folder, so it holds one file of a name: a file
     * of a name the group has takes that file's place, its path then reading the new source (as a
     * file copied into a folder replaces the one of its name there), and its path is in `replaced`.
     * The same file again (sameFile) replaces nothing: a page that fetches its samples again has
     * changed none of them. A handle to a file the page has a path for already keeps that path,
     * wherever it is, as in a pick.
     */
    addToGroup(group: string, added: readonly BrowserFile[]): Promise<{
        paths: string[];
        replaced: string[];
    }>;
    /** The path of a file read through a handle to the file `handle` is to, if the page has one. */
    pathOf(handle: FileSystemFileHandle): Promise<string | undefined>;
    /**
     * The root a shown folder takes: `/<name>`, or `/<name> (2)` and on when another folder of that
     * name took it before, so a tab open on a file of one never reads or saves the other's. The same
     * directory shown again takes its root back, and its files their paths.
     */
    folderRoot(dir: BrowserDir): Promise<string>;
    /** A file of the folder shown at `root`, by its `/`-separated path `rel` in it. */
    addInFolder(root: string, rel: string, source: BrowserSource): string;
    /** The file at `path`, or undefined for a path the page never made. */
    get(path: string): BrowserFile | undefined;
    /** Whether the page made `path`. */
    has(path: string): boolean;
    /**
     * Read `path` from what holds it now, into a buffer of its own that nothing here keeps. A path the
     * page never made rejects, as a missing file does; a File written since it was picked says to open
     * the file again, which gives the browser's leave to read it as it is now.
     */
    bytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
    /** statOf the file at `path`; null for a path the page never made. */
    stat(path: string): Promise<{
        lastModified: number;
        size: number;
    } | null>;
    /** stampOf the file at `path`; null for a path the page never made. */
    stamp(path: string): Promise<string | null>;
    /** Read `path` from `source` from now on, under the name it has (or its path's last part). */
    replace(path: string, source: BrowserSource): void;
}
