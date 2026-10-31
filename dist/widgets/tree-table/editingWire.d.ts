import type { ContextMenuItem } from '../context-menu/dex-context-menu.js';
import type { DexErrorDialog } from '../error-dialog/dex-error-dialog.js';
import type { EditableTableSource, TableChange, TableView } from '../../model/source/tableSource.js';
import type { DexTreeTable } from './dex-tree-table.js';
import { type MenuRow } from './menuItems.js';
/**
 * A plain-text view of the table's document that a row can be shown in (the VS Code extension's
 * JSON dictionary has one): what makes the editing menu offer Location in Text, in its place among
 * the other items, and Cmd/Ctrl+L do what it does.
 */
export interface TableTextView {
    /** Whether the document has one now; a function is asked whenever the menu is built. */
    available: boolean | ((view: TableView | undefined) => boolean);
    /** Show the row's text there. */
    locate(rowId: string): void;
}
/** What the editing half needs of the connected table it is part of. */
export interface EditingHost {
    table: DexTreeTable;
    /** The source's commands, or null for a source that takes none (every gesture is then refused). */
    source: EditableTableSource | null;
    textView?: TableTextView;
    /** Whether the table answers the Undo and Redo chords itself (ConnectTableOptions.undoChords). */
    undoChords?: boolean;
    errorDialog: DexErrorDialog;
    /** Listen on the table until the connection is disposed. */
    listen(type: string, listener: (e: Event) => void, capture?: boolean): void;
    selectedRowIds(): string[];
    rowsNow(): MenuRow[];
    docUri(): string;
    setDocUri(uri: string): void;
    view(): TableView | undefined;
    select(rowIds: readonly string[]): void;
    beginRename(rowId: string): void;
}
/** What connectTable asks of the editing half. */
export interface EditingWire {
    /** A whole paint is about to install its rows: take the editing state it carries. */
    painting(view: TableView): void;
    /** One of the editing changes, handled; false for a change that is not one. */
    change(change: TableChange): boolean;
    /** Whether a right-click opens the menu at all, and on the space under the rows. */
    menuAllowed(rowId: string | null): boolean;
    /** The editing menu for the current selection, anchored at `anchorRowId`. */
    menuFor(anchorRowId: string | null, selection?: readonly string[]): ContextMenuItem[];
    /** A menu item was chosen; false for one that is not the editing menu's. */
    act(actionId: string, anchorRowId: string | null): boolean;
    /** Undo or Redo, as its menu item does, where the document may be edited; false where not. */
    history(action: 'undo' | 'redo'): boolean;
}
/** Whether `ev` is typing in a field of the table's (its search box, a column filter, a cell editor) rather than a gesture on the grid. */
export declare function isTypingInField(ev: KeyboardEvent): boolean;
/** Wire the editing half: the listeners go on through `host.listen`, the state stays in here. */
export declare function wireEditing(host: EditingHost): EditingWire;
