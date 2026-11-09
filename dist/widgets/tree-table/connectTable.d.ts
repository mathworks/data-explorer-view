import { type ContextMenuItem, type DexContextMenu } from '../context-menu/dex-context-menu.js';
import { type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { type DexErrorDialog } from '../error-dialog/dex-error-dialog.js';
import { type LinkTarget } from '../../model/ids/linkTarget.js';
import { type CellEdit, type InspectorFeed, type TableSource, type TableView } from '../../model/source/tableSource.js';
import type { DexTreeTable, TableBanners, TreeTableRow } from './dex-tree-table.js';
import { type DropResult, type EditingRun, type TableDropDecision, type TableTextView } from './editingWire.js';
import type { DragMode } from '../../model/actions/dropDecision.js';
/** What a right-click is on, for the items an app adds to the menu (`menuItems`). */
export interface TableMenuContext {
    /** The row right-clicked, or null for the space under the rows. */
    rowId: string | null;
    /** The selection, which the table has already settled (a click outside it replaces it). */
    selectedRowIds: string[];
    /** The rows the table holds. */
    rows: TreeTableRow[];
}
/** How connectTable wires a table. */
export interface ConnectTableOptions {
    /**
     * The variable editor a matrix glyph opens. Default: one connectTable makes and puts in
     * `<body>`, and takes away again on dispose(). Pass the same one to connectInspector, which
     * otherwise takes this table's, to have one editor for both.
     */
    variableEditor?: DexVariableEditor;
    /**
     * Whether a right-click opens a context menu: by default it does, with Copy Name and Copy
     * Value for the selection, then `menuItems`. False for none, for an app that answers
     * `dex-table-context-menu` itself. The menu the table's `keyboardMenu` keys open takes the
     * keyboard at once, and gives it back to the grid when it closes holding it.
     */
    menu?: boolean;
    /**
     * Items of the app's own to add to the menu, after a separator; choosing one sends the
     * handle's `action`.
     */
    menuItems?: (context: TableMenuContext) => ContextMenuItem[];
    /**
     * The context menu to open. Default: one connectTable makes, in `<body>`, when it is first
     * needed. One menu may serve several tables: a choice is acted on by the table that opened the
     * menu, and a menu dismissed (or opened by another table, or by the app) leaves no table
     * waiting for its next choice.
     */
    contextMenu?: DexContextMenu;
    /**
     * Where the banners go. Default: the table's own strip, above its search bar (`table.banners`).
     * A function draws them elsewhere instead, and is called with all three whenever any changes.
     */
    banners?: (banners: TableBanners) => void;
    /**
     * Where Copy Name and Copy Value put their text, for an app with a clipboard of its own
     * (Electron's, a host's). A throw or a rejected promise is a copy that failed: the table says
     * so in its error banner, and the handle sends `copyFailed`. Default: the page's clipboard,
     * `navigator.clipboard.writeText`, which a page without one, or one that refuses (an unfocused
     * page, a permission policy), fails the same way.
     */
    copy?: (text: string) => Promise<void> | void;
    /**
     * Which of the source's columns the table has (`table.columns`, the ones its Columns menu
     * offers), chosen again on every whole paint: the keys in a list, or those a test passes, asked
     * of each column with the paint (`TableView`). For a column nothing fills in this document, such
     * as Usage in a dictionary opened where no workspace fills it. Default: every column the source
     * paints. A paint that names no columns leaves the table its built-in set, as without this
     * option.
     */
    columns?: readonly string[] | ((column: string, view: TableView) => boolean);
    /**
     * The file a link opens, for an app that knows where the files a link names are: asked of each
     * link the table follows, but one into the table's own document, with that document's uri
     * (`fromUri`). A uri is the file the link opens: a link to an entry of this table's own
     * document then selects it here, as a Data Type link does, and any other link goes to
     * `navigate` with the uri as its `uri`. Null, undefined, or a throw leaves the link to the
     * table's own rule, as without this option.
     *
     * A FolderHierarchy's `resolveLink` is one, so a table's links open the files a folder's tree
     * shows for the names they hold: `resolveLink: (link, fromUri) => hierarchy.resolveLink(link,
     * fromUri)`. Default: none; the table selects a Data Type link's row, and sends every other link
     * to `navigate`.
     */
    resolveLink?: (link: LinkTarget, fromUri: string) => string | null | undefined | Promise<string | null | undefined>;
    /**
     * Wire the table to edit, through the source's commands (an EditableTableSource's): a cell edit,
     * the Add gallery, a row drag and drop, and a context menu of editing items (Copy, Cut, Paste,
     * Add Child, Delete, Undo, Redo) with their chords, in place of Copy Name and Copy Value. A
     * refused edit opens the error dialog. Whether a document may be edited is still its view's
     * `editable`: a read-only one gets no menu, no cell editor, no `+ Add` and no row drag. A source
     * that takes no edits (isEditable false) is wired as a read-only document. Default false.
     */
    editing?: boolean;
    /**
     * With `editing`: a plain-text view of the document a row can be shown in. The editing menu then
     * offers Location in Text, in its place among the other items, and Cmd/Ctrl+L does what it does.
     */
    textView?: TableTextView;
    /**
     * With `editing`: the table answers Cmd/Ctrl+Z with Undo and Shift+Cmd/Ctrl+Z (and Ctrl+Y off
     * macOS) with Redo, as the editing menu labels them, outside its fields and where the document may
     * be edited. Default false: the VS Code extension's own keybindings undo, and a table that answered
     * too would undo twice. `handle.undo()` and `redo()` do the same for an app's Edit menu either way.
     */
    undoChords?: boolean;
    /**
     * With `editing`: the table answers '+' (with Shift or without, as the layout types it) with Add
     * Child, on the selected row, outside its fields and where the editing menu offers the item, which
     * then labels it. Default false: the VS Code extension's table has no such chord.
     */
    addChildChord?: boolean;
    /**
     * With `editing`: the dialog a refused edit is shown in. Default: one connectTable makes, in
     * `<body>`, and takes away again on dispose().
     */
    errorDialog?: DexErrorDialog;
    /**
     * With `editing`: a document whose view is not `editable` gets the menu a table wired without
     * `editing` has (Copy Name and Copy Value for the selection, then `menuItems`), so `editing: true`
     * is right for every document a page opens. Default false: such a document has no menu, as the
     * VS Code extension's read-only views have none.
     */
    readOnlyMenu?: boolean;
    /**
     * With `editing`: the editing menu ends with Copy Name and Copy Value for the selection, after a
     * separator, which put its names (or values) as text through `copy`, as a read-only table's do.
     * They add no chord: Cmd/Ctrl+C stays the editing menu's Copy. Default false.
     */
    copyText?: boolean;
    /**
     * With `editing`: rows are dragged out of the table onto other parts of the page that take them
     * (the app shell's Explorer, which drops them onto an open file through that file's handle:
     * `dropDecision` and `drop`). The table's `dragOut` is set: its box at the pointer follows a row
     * drag over the page. And a document that may not be edited lets its rows be dragged out too, as a
     * copy alone, where its source can put them in the drag register (an editable source, or a read-only
     * one with `dragStart` and `dragEnd`, as a workspace's read-only documents have). Default false: a
     * document that may not be edited drags nothing, as the VS Code extension's read-only views.
     */
    dragOut?: boolean;
    /**
     * The pages an inspector following this table (its handle) is sent past the first selected
     * row's properties: the file's own page while no row is selected (what it is, where, whether it
     * holds edits, and the open files it references and is referenced by, as links), a section
     * heading's (its entries counted by type), a selection of several rows' ("3 selected"), and a
     * row's Usage links as a group of their own. Default false: the first row's properties alone,
     * and nothing for no row or a section heading, as the VS Code extension's inspector shows them.
     */
    inspectorPages?: boolean;
    /**
     * With `inspectorPages`: what the file's page says of where the file is (its File row), the host's
     * words for its path where its paths mean nothing to the user (the browser host's are its own
     * making: ShellHost.pathTitle). Default the path the document's uri names.
     */
    inspectorFileTitle?: string;
    /**
     * With `editing`: the inspector's rows are editable where the document takes an edit of the
     * property, and a change of one (`dex-property-changed`, which connectInspector hands to
     * `handle.edit`) is written back as a cell edit is, a refusal shown in the table's dialog. Not
     * where the document may not be edited. Default false: every row is read-only.
     */
    inspectorEditing?: boolean;
}
/** A link the table does not answer itself: a row of another document, or a file. */
export interface NavigateRequest {
    /** The link's target, as the row carries it. */
    target: string;
    /** What it points at. */
    link: LinkTarget;
    /**
     * The uri of the file the link opens, as connectTable's `resolveLink` named it: open this one,
     * rather than the file `link` names. Absent without a `resolveLink`, or when it named none.
     */
    uri?: string;
}
/** A copy that did not reach the clipboard (the handle's `copyFailed`). */
export interface CopyFailure {
    /** What was to be copied: the names or values, one a line. */
    text: string;
    /** Why, as the clipboard or the app's `copy` said it. */
    message: string;
}
/** A menu item the app added (`menuItems`) was chosen. */
export interface TableAction {
    actionId: string;
    /** The row right-clicked, or null for the space under the rows. */
    rowId: string | null;
    /** The selection when it was chosen. */
    rowIds: string[];
}
/** What a connected table tells its app, by event (TableHandle.on). */
export interface TableHandleEventMap {
    /**
     * The selection changed: by the user, by select() or selectByName() or a link, or to nothing
     * because every selected row went in a repaint (a task later, so a repaint followed by a
     * selection reads as one change).
     */
    select: string[];
    /** A link the table does not answer itself: open what it points at. */
    navigate: NavigateRequest;
    /** One of the app's menu items was chosen. */
    action: TableAction;
    /**
     * Copy Name or Copy Value did not reach the clipboard. The table's error banner says so too,
     * until a copy succeeds or the table repaints.
     */
    copyFailed: CopyFailure;
    /**
     * A whole paint is drawn: the source's answer to open() (the first paint, and one asked again)
     * or a `replaceAll`, the view it drew. Sent once its rows are in the table and `view` is it, so
     * what an app reads off the handle (`view`, `can()`) is the paint's: for a toolbar to be enabled
     * as the file stands from its first paint, before any selection or change. Not for a repaint of
     * one entry, nor a selection. (A listener of any event that throws is said on the console, and
     * the table goes on.)
     */
    painted: TableView;
    /**
     * The source's answer to open() was an error, which the table's error banner says (the detail
     * is its message): no `painted` answers that open(), though a later `replaceAll` may still paint.
     * For an app that waits on a paint (the app shell's openAt, to select the entry a link names) to
     * stop waiting. Not for a source closed while it was asked, which has nothing to show and no
     * banner to say it in.
     */
    failed: string;
    /**
     * With `editing`: an editing menu item's gesture was handed to the source, from the menu, its
     * chord, `run()` or `undo()`/`redo()`, with the rows it carried and how many it acted on: for an
     * app to say "Copied to clipboard" or "2 entries deleted". Told a task later, and not at all where
     * the source refused it or said an error meanwhile, as a source in the page does before then; a
     * source across a channel (the VS Code extension's) answers later, and its gesture is told before
     * any refusal arrives. A disabled item hands nothing, and tells nothing.
     */
    ran: EditingRun;
}
/** A table wired to a source: what connectTable returns. */
export interface TableHandle extends InspectorFeed {
    readonly table: DexTreeTable;
    readonly source: TableSource;
    /** The variable editor this table's matrix glyphs open. */
    readonly variableEditor: DexVariableEditor;
    /** The last whole paint, or undefined until the first. */
    readonly view: TableView | undefined;
    /** Hear an event, until the returned function is called. */
    on<K extends keyof TableHandleEventMap>(type: K, listener: (detail: TableHandleEventMap[K]) => void): () => void;
    /**
     * Select these rows: now, when they are all in the table, else as soon as a repaint brings the
     * rest (a full paint gives up waiting). For a host that says what is selected after an edit.
     */
    select(rowIds: readonly string[]): void;
    /**
     * Select the row named `name`, an entry rather than a row nested under one where both have the
     * name, else a block row whose key it is: now, or when a repaint brings it. For a link from
     * another document, once this one is open.
     */
    selectByName(name: string): void;
    /** Open the Name editor on `rowId`, now or when a repaint brings the row. */
    beginRename(rowId: string): void;
    /**
     * The Add gallery, as if its `+ Add` button were clicked: it opens, or closes if it is open,
     * and nothing happens on a table that cannot add. For a keyboard accelerator of the app's.
     */
    toggleAddGallery(): void;
    /**
     * With `editing`: the editing menu for the current selection (or `selection`), anchored at
     * `anchorRowId` (null for no row), as a right-click there would show it. For a chord of the
     * app's to do exactly what its item would, when it is enabled. Without `editing`, none.
     */
    menuFor(anchorRowId: string | null, selection?: readonly string[]): ContextMenuItem[];
    /**
     * With `editing`: whether the editing menu's item `actionId` ('copy', 'cut', 'paste', 'delete',
     * 'addChild', 'undo', 'redo', …) is offered and enabled for the current selection, anchored at its
     * first row as the chords are. For an app's toolbar button to be enabled exactly when that item
     * is. It is asked, not told: the answer moves with the selection (`select`) and with what the
     * source says (its clipboard, a repaint, and where its undo stack stands: its `history`, whose
     * `onChange` says when Undo and Redo move). False where the document may not be edited, for Copy
     * Name and Copy Value (`copyText`) and the items the app added (`menuItems`), which are not the
     * editing menu's own, and without `editing`.
     */
    can(actionId: string): boolean;
    /**
     * With `editing`: do what that item does, as its chord would, on the current selection; false
     * (nothing done) when `can` is false. For an app's toolbar button.
     */
    run(actionId: string): boolean;
    /**
     * Commit a cell editor still open in the table (a Name or Value editor) as Enter would, and settle
     * once the source has the edit, so that a save after it holds it: for an app's Save, and before it
     * closes a document. With no editor open, and without `editing`, it settles at once. An edit the
     * source refuses settles too; the table shows why, as for any refused edit. A source that relays
     * the edit (a webview's, to its host) has it once it is sent, so the host's save is to follow the
     * message.
     */
    commitEdit(): Promise<void>;
    /**
     * With `editing`: Undo (or Redo) the document's last edit, as the editing menu's item does, for an
     * app's Edit menu. Nothing where the document may not be edited, where its source's `history` says
     * there is nothing to undo (or redo), or without `editing`.
     */
    undo(): void;
    redo(): void;
    /**
     * With `editing` and `inspectorEditing`: write back a change of an inspector's editable row, as
     * a cell edit of `rowId` is (connectInspector calls it); a refusal is shown in the table's
     * dialog, and the page is sent again either way, so a field the source refused shows what the
     * document holds. `commitEdit()` waits for it. Nothing without the options, or where the
     * document may not be edited.
     */
    edit(edit: CellEdit): void;
    /**
     * With `editing`: what a drop of the row drag in flight would do on `rowId` of this table's
     * document, as the table predicts a drop on its own row there (its cursor and its tooltip), with
     * the row it lands on; `rowId` null is the document as a whole, which lands in the section every
     * dragged entry came from where the document has it and it takes them, else the first section that
     * takes them (a MAT-file, which is one target, in itself: ''). For a part of the page outside the
     * table that drops onto its document, such as an app's list of its open files, so that it invites
     * exactly the drops the table's rows would take, though the table is not on screen. A no-op (a move
     * back into the section every entry came from) says so (`noop`). Null where no drop can be
     * predicted: no drag in flight, a document that may not be edited, a row whose section takes no
     * drop, and without `editing`.
     */
    dropDecision(rowId: string | null, mode: DragMode): TableDropDecision | null;
    /**
     * With `editing`: drop the row drag in flight onto `rowId` (a row `dropDecision` named), as a drop
     * on that row of the table does: the source's `drop`, so it is one edit of this document, undone by
     * its Undo, and a move takes the entries out of the document they came from. Handed over at once,
     * where `dropDecision` allows it; call it while the drag is on (from the `drop` event), since its
     * end lets the entries go. Settles once the source is done with it, with whether it refused it and
     * why, for the app to say (the table's banner says it too): a task after the promise the source's
     * `drop` returns (a workspace's documents return one, a JSON dictionary's settling only when the
     * edits queued before it are done), or a task after the call for a source that returns none (one
     * across a channel), which has refused it by then or is taken to have dropped it. Anything the
     * source refuses meanwhile counts against it, as a refusal does not say what it was about. It is no
     * editing menu item, and tells no `ran`.
     */
    drop(rowId: string, mode: DragMode): Promise<DropResult>;
    /**
     * With `editing`: `drop(rowId, 'copy')` with the entries of `replacing` (rows of this table's
     * document) taken out first in the same edit (the source's `dropReplacing`): one edit of this
     * document, undone by one Undo. Until core can paste in place, the copy goes last in its section.
     * Judged and settled as `drop` is (dropDecision first, then the
     * source's promise and a task). A source without `dropReplacing` refuses it:
     * `{ dropped: false, count, reason: '<file> does not replace entries.' }`. No `ran` is told.
     */
    dropReplacing(rowId: string, replacing: readonly string[]): Promise<DropResult>;
    /**
     * Ask the source for the inspector's page again, for a change the table does not hear of: that
     * the document now holds edits, or none, on the file's page (`inspectorPages`). A listener is sent
     * it only if it is not the page last sent.
     */
    refreshInspector(): void;
    /** Stop: the table keeps what it shows and hears nothing more. */
    dispose(): void;
}
/**
 * Wire `table` to `source`: show what it answers, and answer what the table asks. Returns the
 * handle that says what the app is to do (`on`), and through which it selects.
 *
 * The table is left to the app in what it is (`readonly`, `canAdd`, `rowDrag`, `storageKey`):
 * connectTable sets `loading` until the first paint, `expandTopLevel`, and what each paint says.
 */
export declare function connectTable(table: DexTreeTable, source: TableSource, options?: ConnectTableOptions): TableHandle;
