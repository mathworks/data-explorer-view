import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { ShellTab } from './tabs.js';
/** What a tab's menu does, on the tab it was shown for. */
export interface TabMenuActions<T extends ShellTab> {
    tabOf(id: string): T | undefined;
    /** Every open tab, pane by pane. */
    tabs(): readonly T[];
    close(tab: T): void;
    /** Close every tab but `tab`, asking once about their unsaved edits. */
    closeOthers(tab: T): void;
    /** Copy Link's item at `tab`, asked at each menu: null without the host's linkFor, else whether it links a file. */
    link(tab: T): {
        enabled: boolean;
    } | null;
    copyLink(tab: T): void;
}
/** Answer the tab rows' `dex-tab-menu` (heard on `docs`, where every pane's row is) with `menu`; returns what stops it. */
export declare function connectTabMenu<T extends ShellTab>(docs: HTMLElement, menu: DexContextMenu, actions: TabMenuActions<T>): () => void;
