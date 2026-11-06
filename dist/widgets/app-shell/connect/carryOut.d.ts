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
    later(): void;
    /** Something could not be done: say so. */
    failed(message: string): void;
}
/**
 * The name New offers for a new dictionary: `untitled.sldd`, or while a tab has that name,
 * `untitled1.sldd` and on, as Simulink names a new model, so two new files are told apart.
 */
export declare function untitledName(taken: readonly string[]): string;
/** Carry out the command `id` on `tab`, the tab active when it was given. */
export declare function carryOut(id: ShellCommand, tab: OpenTab | undefined, on: CarryOutContext): void;
