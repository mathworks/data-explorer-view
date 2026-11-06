import { LitElement, type PropertyValues } from 'lit';
/** The kind of file an open file is, which says under which heading it is listed. */
export type ExplorerGroup = 'model' | 'sldd' | 'mat' | 'project' | 'other';
/** A part of an open file the app can show on its own: a dictionary's Design Data, say. */
export interface ExplorerSection {
    /** What the app knows the section by; unique within its file. */
    id: string;
    /** What its row reads. */
    label: string;
    /** Its icon's id, as `<dex-icon>` takes it. None, the default, draws none. */
    icon?: string;
}
/** An open file, as its row draws it. */
export interface ExplorerFile {
    /** What the app knows the file by (its URI, say); unique among the files. */
    id: string;
    /** What its row reads: the file's name. */
    label: string;
    /** Its icon's id, as `<dex-icon>` takes it. None, the default, draws none. */
    icon?: string;
    /** Under which heading it is listed. */
    group: ExplorerGroup;
    /** Its row's tooltip: the file's path, say. */
    title?: string;
    /** It has changes not saved: its row reads ` *` after the name. */
    dirty?: boolean;
    /** Its sections, drawn under it while it is open. None, or an empty list, gives it no twisty. */
    sections?: ExplorerSection[];
}
/** A row of the explorer, by what it stands for: Root (`fileId` null), a file, or a file's section. */
export interface ExplorerSelection {
    /** The file, or null for Root. */
    fileId: string | null;
    /** The file's section; none for the file itself. */
    sectionId?: string;
}
/** What `dex-explorer-open` carries: the row to open, and whether to open it for good. */
export interface ExplorerOpenDetail {
    /** The file, or null for Root. */
    fileId: string | null;
    /** The file's section; absent for the file itself, and for Root. */
    sectionId?: string;
    /**
     * True for a double-click or Enter: the user means to keep it, as a pinned tab. False for a
     * single click, which an app may show in a preview tab that the next click reuses. A
     * double-click is two clicks first, so it sends two unpinned requests before the pinned one:
     * the preview takes the row, then is pinned.
     */
    pin: boolean;
}
/** What `dex-explorer-menu` carries: the file whose menu to show, and where, in viewport pixels. */
export interface ExplorerMenuDetail {
    /** The file right-clicked. */
    fileId: string;
    /** The pointer's clientX. */
    x: number;
    /** The pointer's clientY. */
    y: number;
}
/**
 * The open files, as the app shell's Explorer lists them: Root first, then each kind of file
 * under a heading of its own (Simulink Models, Data Dictionaries, MAT-Files, Projects, Other,
 * always in that order, and a heading only over files), each file with a twisty that opens it
 * onto its sections.
 *
 * It draws what it is given and asks for the rest. A click on a row sends `dex-explorer-open`
 * for it, unpinned; a double-click or Enter sends it pinned; a right-click on a file sends
 * `dex-explorer-menu`. Which file a row is, what opening it means and which row is the current
 * one are the app's: the row `selected` names is highlighted, and a click changes nothing of it.
 * Which files are open in the tree (their twisty) is the element's own, but for one thing: a
 * `selected` that moves to a section of a closed file opens that file, at once or as soon as the
 * file lists the section, and the row `selected` moves to is scrolled into view. A file that
 * leaves `files` is forgotten, so it comes back closed, and a focused row that leaves passes the
 * focus to the next row.
 *
 * The arrow keys walk the rows (the headings are no rows): Right opens a file or goes into it,
 * Left closes it or goes from a section to its file, Home and End go to the first and the last.
 *
 * @tagname dex-explorer
 */
export declare class DexExplorer extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The open files, in the order each heading lists them. Replacing them keeps open each file
     * still here (by its `id`) and forgets the rest. Default none: Root alone.
     */
    files: ExplorerFile[];
    /**
     * The row to highlight: Root, a file, or a section of a file. Null, the default, highlights
     * none. The app sets it; the element never changes it, and setting it sends nothing. Moved to
     * another row, it scrolls that row into view once it is drawn; moved to a section of a closed
     * file, it opens the file, then or once a later `files` lists the section. The user may close
     * it again, and it stays closed until `selected` next moves to one of its sections.
     */
    selected: ExplorerSelection | null;
    /** What the first row, the one for every open file at once, reads. Default `Root`. Attribute `root-label`. */
    rootLabel: string;
    private _open;
    private _focusKey;
    private _focusPending;
    private _revealing;
    private _scrollKey;
    protected willUpdate(changed: PropertyValues<this>): void;
    private _moved;
    private _reveal;
    private _keepFocus;
    protected updated(): void;
    private _files;
    /** The headings with files under them, in order, each with its rows. */
    private _groups;
    /** Every row drawn, in order, the headings left out: what the arrow keys walk. */
    private _lines;
    private _selectedKey;
    private _rowElement;
    private _setOpen;
    private _focus;
    private _send;
    private _onContextMenu;
    private _onKeydown;
    private _onTwisty;
    private _label;
    private _icon;
    private _row;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-explorer>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export declare function defineExplorer(tag?: string): void;
/**
 * The events `<dex-explorer>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface ExplorerEventMap {
    /**
     * Open this row: Root, a file or a section. Unpinned for a click, pinned for a double-click or
     * Enter. A request: the explorer changes nothing itself, not even `selected`.
     */
    'dex-explorer-open': CustomEvent<ExplorerOpenDetail>;
    /** Show this file's menu at this point of the viewport: a file's row was right-clicked. A request. */
    'dex-explorer-menu': CustomEvent<ExplorerMenuDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-explorer': DexExplorer;
    }
    interface HTMLElementEventMap extends ExplorerEventMap {
    }
    interface DocumentEventMap extends ExplorerEventMap {
    }
    interface WindowEventMap extends ExplorerEventMap {
    }
}
