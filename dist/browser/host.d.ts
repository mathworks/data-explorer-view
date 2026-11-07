import type { ShellHost, ShellLink, ShellLinkRequest } from '../widgets/app-shell/connect/types.js';
import { type BrowserFile, type BrowserSource } from './files.js';
import type { FilePickers, UserActivation } from './fsAccess.js';
import { type BrowserDir } from './walk.js';
/**
 * The least time between two looks at a shown folder, in milliseconds. A window shown again is
 * often focused too, and each look reads every listed file's size and date; a look asked sooner
 * waits for the rest of the time rather than being dropped, so no change goes untold.
 */
export declare const LOOK_EVERY_MS = 3000;
/**
 * The files a browser host has, by the paths it made for them: what an app may do with them beside
 * the shell. A path is the host's own and opaque: an app opens the paths the host gives, and builds
 * or parses none of its own.
 */
export interface BrowserFiles {
    /**
     * Add a file of the app's own, bytes it fetched, say, as a pick of it alone: the path to open it
     * by (the shell's `openPaths`). A handle to a file the host has a path for already keeps that path.
     */
    addPicked(name: string, source: BrowserSource): Promise<string>;
    /**
     * Add files of the app's own to the group named `group` (any name the app chooses: `'samples'`):
     * the paths to open them by, in order. A group is one folder, made when its first file comes, and
     * every file added to it later sits beside the ones it has, so files fetched at different times
     * still find each other (a model's link to a dictionary, which names it alone). Two groups, and
     * every pick, are folders apart. A group holds one file of a name: a file of a name it has takes
     * that file's place, at its path, and a tab open on it takes the new file as it takes a change on
     * disk (through `onChanged`). The same file again (equal bytes, or a File of the same size and
     * date) changes nothing; still, a page adds a file once and keeps the paths it is answered, to
     * open again. A handle to a file the host has a path for already keeps that path.
     */
    addToGroup(group: string, files: readonly BrowserFile[]): Promise<string[]>;
    /** The file at `path`, or undefined for a path the host never made. */
    get(path: string): BrowserFile | undefined;
    /** Whether the host made `path`. */
    has(path: string): boolean;
    /** The web address the file at `path` was fetched from (fetchUrls), as it was first given; undefined for any other file. */
    urlOf(path: string): string | undefined;
}
/** What browserHost runs over. Each is the page's own unless given (a test gives fakes). */
export interface BrowserHostOptions {
    /** The pickers, and the window whose `focus` makes the host look at its folder again. Default `window`. */
    window?: FilePickers & Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
    /** Where file inputs and download links are made, and whose `visibilitychange` and title the host uses. Default `document`. */
    document?: Document;
    /** Whether a click or a key press led to a dialog, the clipboard, and whether the browser is online. Default `navigator`. */
    navigator?: UserActivation & {
        clipboard?: Pick<Clipboard, 'writeText'>;
        onLine?: boolean;
    };
    /**
     * Show the folder served on `port` as `root`: the shell's `showFolder`. Absent: the host shows no
     * folders; it has no `pickFolder` (the shell then offers no Folder button), a dropped folder is
     * passed over, and `openFolder` does nothing.
     */
    onFolder?(root: string, port: MessagePort): void;
    /** An open file changed on disk: the shell's `fileChanged`. Absent: open files are not watched. */
    onChanged?(path: string): void;
    /** The page's fetch, for web addresses. Default the page's own (called as `fetch(url, init)`). */
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    /** The page's origin, whose `http:` addresses are fetched too. Default `location.origin`. */
    origin?: string;
    /**
     * Give the shell Open from URL… (the host's `fetchUrl`), for a page whose Content-Security-Policy
     * lets it fetch from `https:` (`connect-src https:`). Default false.
     */
    openFromUrl?: boolean;
    /** The page's links to its files (Copy Link), answered as the host's `linkFor`. Absent: no Copy Link. */
    linkFor?(request: ShellLinkRequest): ShellLink;
}
/** What fetchUrls answers. */
export interface FetchedUrls {
    /** The path to open each address's file by, in the addresses' order; null for one not fetched. */
    paths: (string | null)[];
    /** Why each null is, one line each, in the same order ("https://x/a.sldd could not be fetched: 404 Not Found"). */
    problems: string[];
}
/** The browser's ShellHost, and what a page drives it by beside connectShell. */
export interface BrowserHost extends ShellHost {
    /** The files the host has, by the paths it gave them. */
    readonly files: BrowserFiles;
    /**
     * Serve `dir` and show it (through `onFolder`), in place of a folder shown before. Resolves once
     * the folder has been looked at, for the next look to tell what changed since.
     */
    openFolder(dir: BrowserDir): Promise<void>;
    /**
     * Take what was dropped: its files, as one pick, resolve to the paths to open (the shell's
     * `openPaths`), and its first folder is shown, the paths not waiting for the folder to be looked
     * at. Call it from the drop's listener, before anything is awaited (a drop can be read only
     * then), as `installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)))` does.
     */
    openDropped(data: DataTransfer): Promise<string[]>;
    /**
     * Fetch the files at these web addresses (urlTargetOf's rules) and add each to the group of its
     * address's folder, so a model and its dictionary from one repo folder link. Each address (by the
     * URL fetched) is fetched once: asked again, it answers the path it has; one that failed is
     * fetched afresh. The files are bytes the page holds, so a Save downloads. Never rejects.
     */
    fetchUrls(urls: readonly string[]): Promise<FetchedUrls>;
    /** Whether a file has unsaved edits, as the shell last said: for `beforeunload` to ask. */
    readonly edited: boolean;
    /** Stop watching, looking and serving, and take the host's listeners away. */
    dispose(): void;
}
/**
 * A ShellHost for a browser page: Open File and Open Folder through Chromium's pickers or file
 * inputs, New through its save picker or as a file the page keeps, reads and saves through WebFiles
 * (in place where the browser gives a handle, a download where it does not), open files watched, a
 * folder served in the page, and drops. The shell gets its folder and its files' changes back
 * through `onFolder` and `onChanged`; docs/browser-host.md says what works in which browser.
 */
export declare function browserHost(options?: BrowserHostOptions): BrowserHost;
