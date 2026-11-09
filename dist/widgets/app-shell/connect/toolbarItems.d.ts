import type { ToolbarItem } from '../dex-toolbar.js';
import type { ShellCommand } from './types.js';
/** An editing menu item a toolbar button stands for, as TableHandle.can and run name it. */
export type TableActionId = 'undo' | 'redo' | 'addChild' | 'cut' | 'copy' | 'paste' | 'delete';
/** What the toolbar's buttons depend on. */
export interface ToolbarState {
    /** The host can show a folder (ShellHost.pickFolder): the Folder button is there. */
    canOpenFolder: boolean;
    /**
     * The active tab's document: whether the page edits it (Doc.editable) and whether it holds
     * unsaved edits. Null with no tab active; a tab whose document is not read yet, or a project
     * page, is one the page does not edit.
     */
    active: {
        editable: boolean;
        dirty: boolean;
    } | null;
    /** Any open file holds unsaved edits. */
    anyDirty: boolean;
    /** Whether the active table's editing menu offers `id` now; false with no table. */
    can(id: TableActionId): boolean;
    /** The page runs on macOS: the chords are labelled ⌘S rather than Ctrl+S. */
    mac: boolean;
}
/** The editing menu item a toolbar button (or the command it sends) runs, or none for a command of the shell's. */
export declare function tableActionOf(command: ShellCommand): TableActionId | undefined;
/** The toolbar's buttons for `state`, in the order they are drawn. */
export declare function toolbarItems(state: ToolbarState): ToolbarItem[];
/** A tab, as the toolbar's state reads it: its document's edits, and its table's menu. */
interface StateTab {
    dirty?: boolean;
    doc?: {
        editable: boolean;
    };
    handle?: {
        can(id: string): boolean;
    };
}
/** The toolbar's state over `active` among `tabs`, for a host that shows folders or not, on macOS or not. */
export declare function toolbarStateOf(active: StateTab | undefined, tabs: readonly StateTab[], canOpenFolder: boolean, mac: boolean): ToolbarState;
export {};
