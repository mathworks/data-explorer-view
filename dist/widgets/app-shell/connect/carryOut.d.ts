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
    save(tab: OpenTab, as?: boolean): Promise<boolean>;
    /** Close `tab`, asking first about unsaved edits. */
    close(tab: OpenTab): void;
    /** Another tab is active: everything that follows the active tab follows it. */
    shown(): void;
    later(): void;
    /** Something could not be done: say so. */
    failed(message: string): void;
}
/** Carry out the command `id` on `tab`, the tab active when it was given. */
export declare function carryOut(id: ShellCommand, tab: OpenTab | undefined, on: CarryOutContext): void;
