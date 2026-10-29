import { LitElement, type PropertyValues } from 'lit';
import type { HierarchyItem } from '../../model/hierarchy/folderHierarchy.js';
export type { HierarchyItem };
/** What `dex-hierarchy-selected` carries: the row chosen. */
export interface HierarchySelectedDetail {
    /** The file the row opens (its `id`), or null for a row that is no file: a folder, External Data, a reference no file answers. */
    uri: string | null;
    /** The row's key, as `selectedKey` now holds it. */
    key: string;
    /** The row. */
    item: HierarchyItem;
}
/**
 * A folder's hierarchy as a tree: each project and folder, the files in it, and under each file
 * the files it references, opened a level at a time. The rows are HierarchyItems
 * (`data-explorer-view/model`'s FolderHierarchy makes them); the rows under one are asked of
 * `loadChildren` as it is first opened, and asked again when `items` is replaced. A row reads its
 * file's name and kind, an unresolved reference a warning, a file's mark a badge (a circular
 * reference, unsaved changes), and a notice (a folder of which only the first files are shown) an
 * information mark.
 *
 * A click or Enter chooses a row: it is selected, `dex-hierarchy-selected` says which file it
 * opens, and a row with rows under it opens or closes. The arrow keys move through the rows
 * (Right opens a row or goes into it, Left closes it or goes to its parent), Home and End go to
 * the first and the last. `revealRow` shows a row the app names (the file it has open), and
 * `expandTopLevel` opens the folder's own row on first show. connectHierarchy wires one to a
 * FolderHierarchy.
 *
 * @tagname dex-hierarchy
 */
export declare class DexHierarchy extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The top-level rows. Replacing them asks `loadChildren` again for every open row. Default none. */
    items: HierarchyItem[];
    /**
     * What answers the rows under a row, as it is first opened: a FolderHierarchy's `children`.
     * Null, the default, opens every row onto nothing.
     */
    loadChildren: ((item: HierarchyItem) => Promise<HierarchyItem[]>) | null;
    /**
     * The keys of the open rows. The tree changes it as the user opens and closes rows; a row
     * whose key is here opens as soon as it is shown. Default none.
     */
    expandedKeys: string[];
    /** The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing. */
    selectedKey: string | null;
    /** What a screen reader calls the tree. Default `Files`. Attribute `label`. */
    label: string;
    /**
     * Open each top-level row (a folder's own row, each project's) the first time the tree shows it,
     * by adding its key to `expandedKeys`, as a table opens its sections; after that the row stays
     * as the user leaves it, through new `items` too. Another folder's rows are new rows, and open.
     * Off, the default, a folder opens closed. Attribute `expand-top-level`.
     */
    expandTopLevel: boolean;
    private _children;
    private _previous;
    private _asked;
    private _generation;
    private _focusKey;
    private _focusPending;
    private _open;
    private _openedTop;
    private _scrollKey;
    /**
     * Show a row: open each row of `path` but the last (the rows from a top-level row down to it,
     * as FolderHierarchy's `pathTo` gives them), select the last, and scroll it into view as soon as
     * it is drawn, once the rows above it are read. The keyboard goes on from it. It takes no focus,
     * and a choice of the user's before the row is drawn leaves the scroll undone.
     *
     * Sends nothing, unless `options.choose`: then `dex-hierarchy-selected` for the row, as a click
     * on it sends, without opening or closing it. connectHierarchy's `reveal(uri)` finds the path to
     * a file's row.
     */
    revealRow(path: readonly HierarchyItem[], options?: {
        choose?: boolean;
    }): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _load;
    /** Every row drawn, in order. */
    private _lines;
    private _rowElement;
    private _setOpen;
    private _focus;
    private _choose;
    private _announce;
    private _onKeydown;
    private _onTwisty;
    private _icon;
    private _badge;
    private _row;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-hierarchy>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export declare function defineHierarchy(tag?: string): void;
/**
 * The events `<dex-hierarchy>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface HierarchyEventMap {
    /**
     * A row was chosen, by a click or Enter, and is now the selected one: the file it opens, or
     * null for a row that is no file. Sent again each time a row is chosen.
     */
    'dex-hierarchy-selected': CustomEvent<HierarchySelectedDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-hierarchy': DexHierarchy;
    }
    interface HTMLElementEventMap extends HierarchyEventMap {
    }
    interface DocumentEventMap extends HierarchyEventMap {
    }
    interface WindowEventMap extends HierarchyEventMap {
    }
}
