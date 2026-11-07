import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexExplorer } from '../dex-explorer.js';
import type { ShellTab } from './tabs.js';
import type { ShellCommand } from './types.js';
/** The menu's label of the chord of `command`, read at each menu as the platform says it (a tab's menu's too). */
export declare const shortcutOf: (command: ShellCommand) => {
    shortcut?: string;
};
/** What the menu's items do, on the tab they were shown for. */
export interface FileMenuActions<T extends ShellTab> {
    /** The open tab of an Explorer file id, if it is still open. */
    tabOf(fileId: string): T | undefined;
    save(tab: T, as: boolean): void;
    close(tab: T): void;
}
/** Answer `explorer`'s file menus with `menu`; returns what stops it. */
export declare function connectFileMenu<T extends ShellTab>(explorer: DexExplorer, menu: DexContextMenu, actions: FileMenuActions<T>): () => void;
