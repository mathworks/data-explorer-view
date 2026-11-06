import type { Doc } from '../../../model/source/workspace.js';
import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexErrorDialog } from '../../error-dialog/dex-error-dialog.js';
import type { DexProjectPage, ProjectOpenDetail } from '../../project-page/dex-project-page.js';
import { type TableHandle } from '../../tree-table/connectTable.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { DexVariableEditor } from '../../variable-editor/dex-variable-editor.js';
import type { DocTab } from '../dex-doc-tabs.js';
import type { FolderView } from './folder.js';
import type { ShellTab } from './tabs.js';
import type { ShellHost } from './types.js';
/** A tab as the shell keeps it: a ShellTab, its table's selection, and its listeners. */
export interface OpenTab extends ShellTab {
    /** The selection its table last said (TableHandle `select`), for the history, the Explorer and the location. */
    selection: readonly string[];
    /** What stops its listeners, when it closes. */
    stops: (() => void)[];
    /**
     * Settles once the tab is opened: its file read and its table connected, or its banner saying why
     * not (or its page drawn). A second open of the file waits for it, so a link's or a search's row
     * is selected in a table that is there.
     */
    ready: Promise<void>;
    /** The bytes its file holds as the shell last read or wrote them: what the relationship graph draws. */
    bytes?: Uint8Array;
}
/** The item a document's table menu ends with: the row's item, or the file's box, in the relationship graph. */
export declare const SHOW_IN_GRAPH: {
    readonly id: "showInGraph";
    readonly label: "Show in Graph";
};
/** Put `text` on the host's clipboard, or the page's for a host without one, asked at each copy. */
export declare function copyText(host: ShellHost, text: string): Promise<void>;
/** How the tab row draws `tab`: its name, its kind's icon, its path as the tooltip, its marks. */
export declare function docTabOf(tab: OpenTab): DocTab;
/** What the status bar says of the active tab: its kind, and `· Modified` while it holds unsaved edits. */
export declare function statusOf(tab: OpenTab | undefined): string;
/**
 * Select no row of `tab`'s table: the file itself. TableHandle.select([]) selects nothing rather
 * than clearing, so the selection goes as a click on no row takes it, the table's own event saying
 * so, which is what connectTable (its `select`, the inspector's feed) hears.
 */
export declare function clearSelection(tab: OpenTab): void;
/** A table in `tab`'s panel, its column choices kept under `storageKey`. */
export declare function newTable(tab: OpenTab, storageKey: string, editable?: boolean): DexTreeTable;
/** The shared parts a document's table is connected with, and the folder it is read against. */
export interface DocumentWiring {
    host: ShellHost;
    editor: DexVariableEditor;
    menu: DexContextMenu;
    dialog: DexErrorDialog;
    /** The folder shown now, if any: its Usage, and the files its tree shows for a link's names. */
    folder(): FolderView | undefined;
}
/** Connect `doc`'s source to a new table in `tab`'s panel, kept under `storageKey`. */
export declare function connectDocument(tab: OpenTab, doc: Doc, storageKey: string, wiring: DocumentWiring): TableHandle;
/**
 * A project's page in `tab`'s panel, drawn from its store as the shown folder's reader answers it.
 * A link on it goes to `follow`, with the project's folder; one that cannot be followed says why
 * on the page.
 */
export declare function newProjectPage(tab: OpenTab, revealIn: string, follow: (root: string, link: ProjectOpenDetail) => Promise<void>): DexProjectPage;
/**
 * Draw `tab`'s project page from `folder`'s store, or say the folder it is in is needed. Resolves to
 * why its store could not be read, which the page says too; undefined when it was drawn.
 */
export declare function paintProject(tab: OpenTab, page: DexProjectPage, folder: FolderView | undefined): Promise<string | undefined>;
/** What a project's page says in the Log. */
type ProjectLog = (level: 'info' | 'error', text: string) => void;
/**
 * Draw again from `folder`'s store each project's page among `tabs`, or only those whose marker is
 * among `uris`; one that could not be read says why in the Log (`log`).
 */
export declare function repaintProjects(tabs: readonly OpenTab[], folder: FolderView, log: ProjectLog, uris?: readonly string[]): void;
/**
 * Show the project of `tab` on its page, drawn from the shown folder's store: a link on it opens
 * its file as a preview (`open`), and one that cannot be followed says why on the page and in the
 * Log, as a store that cannot be read does.
 */
export declare function showProject(tab: OpenTab, on: {
    host: ShellHost;
    folder(): FolderView | undefined;
    open(path: string): Promise<unknown>;
    log: ProjectLog;
}): Promise<void>;
/**
 * Follow a link on a project's page, `link` from the project's folder `root`: a file this app shows
 * opens in a tab (a project on its page), a component row opens the project in its folder, and the
 * rest (a folder, a script) is shown in the OS file manager.
 */
export declare function followProjectLink(root: string, link: ProjectOpenDetail, on: {
    folder(): FolderView | undefined;
    open(path: string): Promise<unknown>;
    reveal(path: string): Promise<void> | undefined;
}): Promise<void>;
export {};
