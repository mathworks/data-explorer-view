import type { Doc } from '../../../model/source/workspace.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { TableHandle } from '../../tree-table/connectTable.js';
import type { DexProjectPage } from '../../project-page/dex-project-page.js';
/** One open file: its tab, its panel, and what the panel shows it with. */
export interface ShellTab {
    /** What the tab row, the Explorer and the history name the tab by. Unique for the session. */
    readonly id: string;
    /** The file's path, as it was opened. */
    path: string;
    /** The tab's label: the file's name, or a project's by its folder. */
    name: string;
    /** The panel in the documents' area the tab shows. */
    panel: HTMLElement;
    /** The table its file is shown in, once there is one: a project has none, and a file that could not be read one with the reason. */
    table?: DexTreeTable;
    /** Its document in the shell's workspace, once its file is read. */
    doc?: Doc;
    /** Its table, connected to the document's source. */
    handle?: TableHandle;
    /** A project's page, in place of a table. */
    page?: DexProjectPage;
    /** Its document holds edits its file does not. */
    dirty?: boolean;
    /** A preview tab, which the next file opened by a click in the folder, a search or a link replaces. */
    preview?: boolean;
}
/** One pane, as `TabList.panes` lists it: its tabs, in the order of its row, and the one it shows. */
export interface TabPane<T> {
    /** Its tabs, in the order of its row. */
    readonly items: readonly T[];
    /** The tab it shows: at Root too, the one it shows again once the documents are. None only in a pane with no tabs. */
    readonly shown: T | undefined;
}
/** The side of the pane there is that `split` puts a tab on, in a pane of its own. */
export type PaneSide = 'left' | 'right';
/** The most panes the documents' area is split into. */
export declare const MAX_PANES = 2;
/**
 * The open tabs, the panes they are in, left to right, and which one is active: the tab the
 * focused pane shows, or none at the Explorer's Root. DOM-free.
 */
export declare class TabList<T> {
    private panesNow;
    private focusedNow;
    private root;
    private all;
    /** Every tab, pane by pane, each pane's in the order of its row. */
    get items(): readonly T[];
    /** The active tab: the one the focused pane shows; none with nothing open, or at the Explorer's Root. */
    get active(): T | undefined;
    /** Where the active tab is in `items`, or -1 for none. */
    get activeIndex(): number;
    /** The panes, left to right: one, or two once a tab has been split out of the first. */
    get panes(): readonly TabPane<T>[];
    /** Which pane is focused, by its index in `panes`. */
    get focused(): number;
    /** The first tab `pred` holds for. */
    find(pred: (item: T) => boolean): T | undefined;
    /** The pane `item` is in, by its index in `panes`, or -1 for a tab not in the list. */
    paneOf(item: T): number;
    /** Add at the end of the focused pane and make it active. */
    add(item: T): void;
    /** Make `item` the active tab, its pane focused; whether it was not already (false too for a tab not in the list). */
    activate(item: T): boolean;
    /** Make none active (the Explorer's Root), keeping every tab, and the one each pane shows; whether one was. */
    deactivate(): boolean;
    /**
     * Focus the pane at `index`, which then shows the tab it showed (at Root, the documents are
     * shown again). Whether the active tab changed: false for a pane there is not, or one with no tabs.
     */
    focus(index: number): boolean;
    /**
     * Remove; the tab to its right is shown in its pane in its place, or the new last one. A pane
     * left with no tabs goes, unless it is the only one, and the other is focused.
     */
    remove(item: T): boolean;
    /**
     * Move `item` so that it is at `index` of its pane once moved: taken out, then put in at
     * `index`, as `dex-tab-move` means it (clamped to the row). The active tab stays the active tab.
     * Whether anything moved.
     */
    move(item: T, index: number): boolean;
    /**
     * Move `item` into the pane at `pane`, at `index` there (clamped; its end with none), where it is
     * then shown, that pane focused: a tab dropped on the other pane's row or its documents. The
     * pane it left shows the tab to its right in its place, and goes if it is left with none. Into
     * its own pane: moved along the row to `index`, or with none, only shown. Whether anything
     * changed.
     */
    moveTo(item: T, pane: number, index?: number): boolean;
    /** The side of `item`'s pane the other pane is on, or would be made on: the right of the first, the left of the second. */
    otherSide(item: T): PaneSide;
    /** Whether `split(item, side)` would move it: there is another tab beside it to leave behind, or another pane on that side. */
    splits(item: T, side: PaneSide): boolean;
    /**
     * Put `item` in a pane of its own on `side` of the pane there is, where it is shown, that pane
     * focused: a tab dropped on a side of the documents, or Split Right. With two panes already, it
     * goes into the one on that side instead (moveTo). Nothing moves for a tab with no other beside
     * it, which would leave an empty pane behind, nor for one already in the pane on that side.
     * Whether it moved.
     */
    split(item: T, side: PaneSide): boolean;
    /**
     * Move the active tab by `step` along the focused pane's row, wrapping around; from none active,
     * forward to the first and back to the last. Whether the active tab changed: with one tab,
     * active, there is nowhere to go.
     */
    cycle(step: number): boolean;
    private dropEmpty;
    private changed;
}
