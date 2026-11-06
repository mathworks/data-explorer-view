import type { KeyValueStore } from '../../../model/shell/settings.js';
import type { DexDocTabs, DocTab } from '../dex-doc-tabs.js';
import { type DexShellDocs } from './dex-shell-docs.js';
import type { OpenTab } from './documents.js';
import type { TabList } from './tabs.js';
/** The group of the panes' rows: rows of one group take each other's tabs, so a tab moves to the other pane by a drop on its row. */
export declare const PANE_ROWS = "panes";
/**
 * Put each tab's panel in its pane's slot of the documents' area, and show only the tab each pane
 * shows, while documents are shown (`shown`: not at Root, and some tab open); every other panel is
 * hidden, and so is every panel at Root, where the graph fills the area.
 */
export declare function slotPanels(tabs: TabList<OpenTab>, shown: boolean): void;
/** The rows of tabs of the panes, left to right, in the documents' area. */
export declare class PaneRows {
    private readonly docs;
    private readonly list;
    /** Rows for `docs`, whose first pane's row is `first` (in its `tabs` slot already). */
    constructor(docs: DexShellDocs, first: DexDocTabs);
    /** The rows, left to right: the first pane's, and the second's while there is a second pane. */
    get rows(): readonly DexDocTabs[];
    /** The pane of the row `target` (its index in `rows`), or -1 for anything else. */
    paneOf(target: EventTarget | null): number;
    /**
     * Draw the panes' rows as `tabs` holds them, each tab as `drawn` says, a row made or taken away
     * for the panes there are. Hidden while no document is shown (`shown` false: Root, or nothing
     * open), when no tab is marked active either. The row of the pane not focused is dimmed. A row
     * taken away with the keyboard on it gives it to the focused pane's active tab.
     */
    paint(tabs: TabList<OpenTab>, shown: boolean, drawn: (tab: OpenTab) => DocTab): void;
    /** Whether the keyboard is on a row: one about to be hidden, at Root, must give it somewhere. */
    holdsFocus(): boolean;
    /** Take the keyboard off the row that has it. */
    blur(): void;
}
/** The documents' split kept with the layout under `key` in `store` (none, or none readable: the half). */
export declare function keptSplit(store: KeyValueStore | null, key: string): number;
/**
 * Keep the documents' split `ratio` with the layout under `key` in `store`, the sides kept there
 * as they were. A page with no storage, or none left, keeps it for this page alone.
 */
export declare function keepSplit(store: KeyValueStore | null, key: string, ratio: number): void;
