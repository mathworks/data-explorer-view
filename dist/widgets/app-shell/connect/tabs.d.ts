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
/** The open tabs, in order, and which one is active. DOM-free. */
export declare class TabList<T> {
    private list;
    private current;
    /** The tabs, in the order of the row. */
    get items(): readonly T[];
    /** The active tab, or none (nothing open, or the Explorer's Root). */
    get active(): T | undefined;
    /** Where the active tab is in `items`, or -1 for none. */
    get activeIndex(): number;
    /** The first tab `pred` holds for. */
    find(pred: (item: T) => boolean): T | undefined;
    /** Add at the end and make it active. */
    add(item: T): void;
    /** Make `item` the active tab; whether it was not already (false too for a tab not in the list). */
    activate(item: T): boolean;
    /** Make none active (the Explorer's Root), keeping every tab; whether one was. */
    deactivate(): boolean;
    /** Remove; the tab to its right becomes active, or the new last one. */
    remove(item: T): boolean;
    /**
     * Move `item` so that it is at `index` once moved: taken out, then put in at `index`, as
     * `dex-tab-move` means it (clamped to the row). The active tab stays the active tab. Whether
     * anything moved.
     */
    move(item: T, index: number): boolean;
    /**
     * Move the active tab by `step`, wrapping around; from none active, forward to the first and back
     * to the last. Whether the active tab changed: with one tab, active, there is nowhere to go.
     */
    cycle(step: number): boolean;
}
