import { LitElement, type PropertyValues } from 'lit';
import { type SearchItem } from '../../../model/search/searchItems.js';
/** What `dex-search-query` carries: the text to search for. */
export interface SearchQueryDetail {
    /** What the box holds, as typed; empty when the user cleared it. */
    query: string;
}
/** What `dex-search-open` carries: the result to open. */
export interface SearchOpenDetail {
    /** The file it is in: its entry's `sourceUri`. */
    sourceUri: string;
    /** The name to reveal it by in that file's table (`selectByName`): its `revealName`, a block's key. */
    revealName: string;
}
/**
 * The app shell's Search panel: a search box, the scope it searches under it, and the matches
 * grouped by file (each group headed by the file's name and how many it holds, each row an
 * entry's icon, its name with the match marked, and where it is in the file). It asks and
 * draws: a pause in the typing sends `dex-search-query`, the app sets `results` in answer, and
 * Enter or a click on a result sends `dex-search-open`.
 *
 * The focus stays in the box: Down and Up move the active result through the rows as drawn,
 * stopping at the ends, and the results are a listbox the box names its active row of. Each new
 * `results` makes the first row the active one, scrolled into view. Enter opens nothing while
 * `searching`, nor before the pause (it asks at once instead). Escape empties the box and asks
 * for the empty query at once; on an empty box it is the page's. A count says how many results
 * there are, and when the list stopped at its cap (MAX_SEARCH_RESULTS); "No matches" when a query
 * has none, and "Searching…" while `searching`.
 *
 * @tagname dex-search-panel
 */
export declare class DexSearchPanel extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The matches to show for the query in the box, in the order the app gives them (searchEntries'
     * items: by name, then by file). They are drawn grouped by file, each file where its first
     * result is. Shown only while the box holds a query. Default none. Property only.
     */
    results: SearchItem[];
    /**
     * What the box holds. The user's typing sets it (and asks for it, once the typing pauses); an
     * app that sets it, to restore a search, asks for nothing, and sets `results` itself. Default
     * empty. Attribute `query`.
     */
    query: string;
    /**
     * Whether the app is still working out the results of the query: "Searching…" stands in for
     * the count, and the list is marked busy. Default false. Attribute `searching`.
     */
    searching: boolean;
    /**
     * What the search covers, said under the box: "Open files and the folder", say. Default
     * empty, which draws no line. Attribute `scope`.
     */
    scope: string;
    private _active;
    private _groups;
    private _rows;
    private _timer;
    private _reveal;
    /** Puts the focus in the box, its text selected so the next keystroke types over it. */
    focusInput(): void;
    disconnectedCallback(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _input;
    /** Whether the box holds something to search for: what the results are shown for. */
    private _searchingFor;
    private _group;
    private _ask;
    private _cancel;
    private _onInput;
    private _open;
    private _onKeydown;
    private _label;
    private _status;
    private _row;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-search-panel>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export declare function defineSearchPanel(tag?: string): void;
/**
 * The events `<dex-search-panel>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface SearchPanelEventMap {
    /**
     * Search for this: the typing paused (150 ms), Escape emptied the box, or Enter came before the
     * pause. Answer by setting `results` (and `searching` while they are worked out). An empty
     * query asks for none. A request.
     */
    'dex-search-query': CustomEvent<SearchQueryDetail>;
    /** Open this result: reveal `revealName` in the file `sourceUri`. Enter or a click. A request. */
    'dex-search-open': CustomEvent<SearchOpenDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-search-panel': DexSearchPanel;
    }
    interface HTMLElementEventMap extends SearchPanelEventMap {
    }
    interface DocumentEventMap extends SearchPanelEventMap {
    }
    interface WindowEventMap extends SearchPanelEventMap {
    }
}
