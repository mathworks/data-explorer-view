import { LitElement } from 'lit';
import { type DiffMark, type TreeTableRow } from '../tree-table/dex-tree-table.js';
/** One side of a compare as the view draws it: its caption and its table's rows. */
export interface CompareSide {
    /** The file's name, over its table ('plant.sldd'). */
    name: string;
    /** What the caption's tooltip says of the file: its path, as the host says it. */
    title?: string;
    /** Whether a copy can go into it; false draws "Read-only" after the name. */
    editable: boolean;
    /** It holds unsaved edits: ● after the name, "unsaved" for a screen reader. */
    dirty?: boolean;
    /** One row per line, the line's id its ID (the same ids, in the same order and tree, on both sides). */
    rows: TreeTableRow[];
    columns: string[];
    columnLabels: Record<string, string>;
    columnGroups: Record<string, string>;
    /** Each marked line's mark on this side. */
    marks: ReadonlyMap<string, DiffMark>;
}
/** What `dex-compare-selected` carries: the lines selected now, in both tables. */
export interface CompareSelectedDetail {
    lineIds: string[];
}
/**
 * What `dex-compare-menu` carries: the side whose row the menu was asked for, the lines it is for
 * (that table's selection), where it opens (viewport pixels), and `keyboard` where a key opened it,
 * so the menu takes the keyboard.
 */
export interface CompareMenuDetail {
    side: 'left' | 'right';
    lineIds: string[];
    x: number;
    y: number;
    keyboard?: true;
}
/** What `dex-compare-step` carries: to the previous change (-1) or the next (+1). */
export interface CompareStepDetail {
    by: 1 | -1;
}
/** What `dex-compare-filter-changed` carries: whether lines with no difference are left out now. */
export interface CompareFilterChangedDetail {
    onlyDifferences: boolean;
}
/**
 * Two files compared line by line: a header (what differs, "Show only differences", Previous and
 * Next Change) over two read-only tables side by side, whose rows share ids line for line. A row
 * opened, scrolled to or selected in one is in the other; a line one file lacks is a gap row there.
 *
 * The app gives each side its rows, a row per line under the line's id, the same ids in the same
 * order and tree on both, with a blank row where a file lacks the line, and each line's mark on
 * that side; and it lays them out again when "Show only differences" is toggled
 * (`dex-compare-filter-changed`) or a file changes. The view keeps the two tables one picture: a
 * line opened in one is opened in the other, a scroll of one scrolls the other to the same place,
 * and a selection in one is the other's, said in `dex-compare-selected`. The tables keep their rows
 * as given (a sort or a search on one side alone would break the lines) and take no edit; a row's
 * menu is asked for in `dex-compare-menu`, with the side it was asked on, for the app to offer Copy
 * to Left or Right. Only vertical scroll follows: each table keeps its own column widths and
 * choices, so the same sideways scroll would put different columns under each other. Previous and
 * Next Change send `dex-compare-step` for the app to say which line that is (`select`). The tables'
 * own events stay inside the view.
 *
 * It fills the box it is given, a column: the header, then the two sides, each a caption (the
 * file's name, ● while it is unsaved, "Read-only" where no copy can go into it) over its table.
 *
 * @tagname dex-compare-view
 */
export declare class DexCompareView extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The left side: its caption and its table's rows. */
    left: CompareSide | null;
    /** The right side, the same lines as the left. */
    right: CompareSide | null;
    /** The header's words for what differs ("3 changed, 1 added, 2 removed"), said politely to a screen reader as it changes. */
    summary: string;
    /** The header's checkbox: lines with no difference in or under them are left out (the app gives rows to match). Default true. Attribute `only-differences`. */
    onlyDifferences: boolean;
    /** Whether there is a change to go to: Previous and Next Change are enabled. Attribute `has-changes`. */
    hasChanges: boolean;
    /** Said in place of the tables while both have no rows ("No differences"); '' shows the tables. */
    empty: string;
    /** Both tables' style. Attribute `table-style`. */
    tableStyle: 'normal' | 'light';
    /** Both tables' `storageKey` (their column choices, shared). Default null: kept for the element's life only. Attribute `storage-key`. */
    storageKey: string | null;
    private _expanded;
    private _selected;
    /** The lines shown open, both tables'; setting it sends nothing. */
    get expandedIds(): Set<string>;
    set expandedIds(ids: Iterable<string>);
    /** The selected lines. */
    get selectedIds(): string[];
    /** Select these lines in both tables, opening their parents and bringing the first into view; sends nothing. */
    select(lineIds: readonly string[]): void;
    /** The keyboard to the left table's grid. */
    focus(): void;
    protected createRenderRoot(): HTMLElement | DocumentFragment;
    private _table;
    private _other;
    private _onExpansion;
    private _echo;
    private _onScrolled;
    private _onSelected;
    private _onMenu;
    private _step;
    private _onFilter;
    private _renderCaption;
    private _renderSide;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-compare-view>`, or under `tag`, with the icons and the tables it draws. */
export declare function defineCompareView(tag?: string): void;
/**
 * The events `<dex-compare-view>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this
 * map, and a listener on an element, the document or the window is typed. Its tables' own events
 * reach none of them.
 */
export interface CompareViewEventMap {
    /** The selection changed, in either table: both select `lineIds` now. */
    'dex-compare-selected': CustomEvent<CompareSelectedDetail>;
    /** A row's menu was asked for (right-click, Shift+F10, ContextMenu key), the right-clicked row selected first. */
    'dex-compare-menu': CustomEvent<CompareMenuDetail>;
    /** Previous (-1) or Next (+1) Change was pressed. */
    'dex-compare-step': CustomEvent<CompareStepDetail>;
    /** "Show only differences" was toggled; `onlyDifferences` follows it already. */
    'dex-compare-filter-changed': CustomEvent<CompareFilterChangedDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-compare-view': DexCompareView;
    }
    interface HTMLElementEventMap extends CompareViewEventMap {
    }
    interface DocumentEventMap extends CompareViewEventMap {
    }
    interface WindowEventMap extends CompareViewEventMap {
    }
}
