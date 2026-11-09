import { type CompareRows } from '../../../model/compare/compareRows.js';
import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { InspectorFeed } from '../../../model/source/tableSource.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { DexCompareView } from '../dex-compare-view.js';
import type { OpenTab } from './documents.js';
/** What a compare tab is connected with. */
export interface CompareWiring {
    /** The table style setting's, now. */
    tableStyle(): DexTreeTable['tableStyle'];
    /** Where the compare tables keep their column choices: `${shell key}:compare`. */
    storageKey: string;
    /** What a tooltip says of a path: ShellHost.pathTitle's, or the path. */
    titleOf(path: string): string;
    /** The selection changed: the history and everything that follows the active tab. */
    selected(lineIds: readonly string[]): void;
    /** Say something: a toast and its line in the Log. */
    say(level: 'info' | 'warning' | 'error', text: string, ms?: number): void;
    /** The shared context menu, for a line's menu. */
    menu: DexContextMenu;
    /** Show `tab` with `rowId` selected: the line's Show in <file>. */
    showIn(tab: OpenTab, rowId: string): void;
}
/** A compare tab's connection: its two files' tabs, its view, and what it answers. */
export interface CompareConnection {
    readonly left: OpenTab;
    readonly right: OpenTab;
    readonly view: DexCompareView;
    /** What the inspector shows while the tab is active: the selected line's page (comparePage). */
    readonly feed: InspectorFeed;
    /** Its two tables, which the table style setting rules too. */
    readonly tables: readonly DexTreeTable[];
    /** The lines as last drawn. */
    readonly rows: CompareRows | undefined;
    /** Whether there is a change to go to. */
    readonly hasChanges: boolean;
    /** Whether it compares `tab`. */
    involves(tab: OpenTab): boolean;
    /** Select the changed line after (1) or before (-1) the selection's first, wrapping round, in both tables. */
    step(by: 1 | -1): void;
    /** Select these lines (the history's place). */
    select(lineIds: readonly string[]): void;
    /** Read both sides again and draw them; one at a time, a change heard during one making one more after it. */
    refresh(): Promise<void>;
    /**
     * Copy the entries of these lines into `to`'s file from the other's (Copy to Right: `to` 'right'),
     * each line standing for its entry, lines the source lacks left out: per section, the source's
     * entries dragged (`doc.table.dragStart`), dropped on the target's section through its tab's handle
     * (`dropReplacing` with the target's rows of the entries it has, else `drop(…, 'copy')`), the drag
     * ended; one undo step per section in the target. Said as a toast. Nothing into a side that may not be edited.
     */
    copy(lineIds: readonly string[], to: 'left' | 'right'): Promise<void>;
    dispose(): void;
}
/** Draw `left` against `right` in `tab`'s panel (a `<dex-compare-view>` put in it), and keep it drawn as either changes. */
export declare function connectCompare(tab: OpenTab, left: OpenTab, right: OpenTab, wiring: CompareWiring): CompareConnection;
