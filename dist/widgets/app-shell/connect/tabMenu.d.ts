import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { ShellTab } from './tabs.js';
/** What a tab's menu does, on the tab it was shown for. */
export interface TabMenuActions<T extends ShellTab> {
    tabOf(id: string): T | undefined;
    /** The tabs Close Others would close for `tab`: the others of its own pane. */
    others(tab: T): readonly T[];
    close(tab: T): void;
    /** Close the others of `tab`'s pane, asking once about their unsaved edits, and make `tab` the active one. */
    closeOthers(tab: T): void;
    /** Copy Link's item at `tab`, asked at each menu: null without the host's linkFor, else whether it links a file. */
    link(tab: T): {
        enabled: boolean;
    } | null;
    copyLink(tab: T): void;
    /** Whether `tab` is a file a compare reads: its Compare With… is enabled. */
    comparable(tab: T): boolean;
    /** Ask which file to compare `tab`'s with (Compare With…). */
    compareWith(tab: T): void;
    /** For a compare tab, whether it has a difference to go to; null for a file's tab, which has no such items. */
    changes(tab: T): {
        hasChanges: boolean;
    } | null;
    /** Go to the next (1) or previous (-1) difference of the compare tab `tab`. */
    step(tab: T, by: 1 | -1): void;
}
/** Answer the tab rows' `dex-tab-menu` (heard on `docs`, where every pane's row is) with `menu`; returns what stops it. */
export declare function connectTabMenu<T extends ShellTab>(docs: HTMLElement, menu: DexContextMenu, actions: TabMenuActions<T>): () => void;
