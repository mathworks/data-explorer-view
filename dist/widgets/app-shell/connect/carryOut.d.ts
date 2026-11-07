import type { OpenTab } from './documents.js';
import type { ShellNavigation } from './navigation.js';
import type { TabList } from './tabs.js';
import type { ShellCommand, ShellHost } from './types.js';
/** What the commands are carried out with. */
export interface CarryOutContext {
    host: ShellHost;
    tabs: TabList<OpenTab>;
    nav: ShellNavigation;
    openPaths(paths: readonly string[]): Promise<void>;
    /** Open a new data dictionary at `path`, where the host's New said it goes. */
    openNew(path: string): Promise<void>;
    save(tab: OpenTab, as?: boolean): Promise<boolean>;
    /** Close `tab`, asking first about unsaved edits. */
    close(tab: OpenTab): void;
    /** Another tab is active: everything that follows the active tab follows it. */
    shown(): void;
    /** Root is shown: the keyboard to the Explorer's Root row, or to what fills the center. */
    keyboardToRoot(): void;
    /**
     * Move a tab between the panes by `change` (true if it moved): shown where it went, the keyboard
     * going with it from a tab row that had it.
     */
    rearrange(change: () => boolean): void;
    /** Go to the pane at `index` (0 the left): focused, the keyboard on its active tab. Nothing for a pane there is not. */
    goToPane(index: number): void;
    later(): void;
    /** Something could not be done: say so. */
    failed(message: string): void;
    /** The Folder view's moves: the folder above made the workspace folder, and the folder read again (folderNav.ts). */
    folder: {
        up(): void;
        refresh(): void;
    };
    /** Ask for a web address (Open from URL…): the address, or null. */
    askUrl(): Promise<string | null>;
    /** Copy Link at `tab`'s selection (the active tab; none at Root). */
    copyLink(tab: OpenTab | undefined): void;
}
/**
 * Show Root (`show`), which hides the active tab's `panel`. A browser drops a focus inside the panel
 * (a table's, Show Graph's chord or Show in Graph used there) to the page's body: that one goes to
 * `toRoot`, where the tab row's does as Root shows. Read before the panel hides, by the shadow host
 * the focus is in, which :focus-within matches the panel by; and let go of first, as the tab row's
 * is, so a graph still being drawn takes it once it is.
 */
export declare function showRootFrom(panel: HTMLElement | undefined, show: () => void, toRoot: () => void): void;
/**
 * The name New offers for a new dictionary: `untitled.sldd`, or while a tab has that name,
 * `untitled1.sldd` and on, as Simulink names a new model, so two new files are told apart.
 */
export declare function untitledName(taken: readonly string[]): string;
/** Carry out the command `id` on `tab`, the tab active when it was given. */
export declare function carryOut(id: ShellCommand, tab: OpenTab | undefined, on: CarryOutContext): void;
