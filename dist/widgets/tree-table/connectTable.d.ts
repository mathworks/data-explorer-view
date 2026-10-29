import { type ContextMenuItem, type DexContextMenu } from '../context-menu/dex-context-menu.js';
import { type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { type LinkTarget } from '../../model/ids/linkTarget.js';
import type { InspectorFeed, TableSource, TableView } from '../../model/source/tableSource.js';
import type { DexTreeTable, TableBanners, TreeTableRow } from './dex-tree-table.js';
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
     * `dex-table-context-menu` itself.
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
