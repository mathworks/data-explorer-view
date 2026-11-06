// Copyright 2026 The MathWorks, Inc.
//
// The app shell's Search view: a box, and the entries whose names match what is typed in it,
// grouped by the file each is in. From the prototype's search panel, which searched its own
// data model as the user typed; this one searches nothing. What is typed goes out as a request,
// and the app answers with the results, so the same panel serves a page that searches its open
// files in the page (namesOfRows) and one whose folder is indexed in another process (NameIndex),
// and the rule for what matches, and in what order, stays the model's (searchRanked), in one place.
//
// The results are a listbox the box controls, as a combobox's are: the focus stays in the box,
// the arrows move the active row (aria-activedescendant), and Enter opens it, so a user types,
// looks, presses Down twice and Enter without leaving the keyboard or the field.

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { defineElement } from '../../shared/define.js';
import { defineIcon } from '../../shared/dex-icon.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import type { EntryKind } from '../../../model/search/nameExtract.js';
import { MAX_SEARCH_RESULTS, type SearchItem } from '../../../model/search/searchItems.js';

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
 * How long the typing must pause before the box's text is asked for, in ms.
 *
 * A search per keystroke would ask for "K", "Kp" and "Kp_" in the time it takes to type them, and
 * each answer would repaint a list the user is not reading yet. 150 is short enough that the list
 * follows the typing, and long enough that a word typed at speed asks once.
 */
const QUERY_DELAY_MS = 150;

/**
 * A file's icon, by the kind of entry it holds: the ones the folder tree draws for the file
 * (folderHierarchy.ts), so a heading here looks like the file's row there. A model holds both
 * workspace variables and blocks.
 */
const FILE_ICONS: Readonly<Record<EntryKind, string>> = {
  sldd: 'simulink_database',
  mat: 'matlabWorkspaceFile',
  workspace: 'simulink',
  block: 'simulink',
};

/** The ids the box and the list refer to each other by, inside the shadow root. */
const LIST_ID = 'results';
const optionId = (index: number): string => `result-${index}`;

/** One file's results, as drawn: its heading, then its rows, each with its place in the list. */
interface FileGroup {
  uri: string;
  label: string;
  iconId: string;
  rows: { item: SearchItem; index: number }[];
}

/**
 * Where a result is inside its file, beyond the file's name its heading already says: a block's
 * path through the model, when it adds something to the name (searchItem's rule for the
 * description), and nothing for any other entry. Read from the record, not cut out of the
 * description, whose words are the app's to choose and whose separator a file's name may hold;
 * the description stays whole in the row's tooltip.
 */
function whereInFile(item: SearchItem): string {
  const path = item.entry.blockPath ?? '';
  return path && path !== item.entry.name ? path : '';
}

/**
 * The app shell's Search panel: a search box, the scope it searches under it, and the matches
 * grouped by file (each group headed by the file's name and how many it holds, each row an
 * entry's icon, its name with the match marked, where it is in the file, and what it is where its
 * result says: SearchItem's `type`). It asks and
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
export class DexSearchPanel extends LitElement {
  static override styles = [hiddenStyles, highContrastStyles, css`
    /* A column as tall as the view it is in: the box stays put and the results scroll under it. */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    .box {
      flex-shrink: 0;
      padding: 8px;
    }

    /* Drawn as the table's search bar is (dex-filter-bar.ts), since the two sit side by side: the
       same border, surface and accent edge while it has the focus. */
    .input {
      display: block;
      width: 100%;
      height: 26px;
      padding: 2px 8px;
      box-sizing: border-box;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 3px;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font: inherit;
      font-size: 12px;
      outline: none;
    }

    .input::placeholder {
      color: var(--dex-input-placeholder-fg, #767676);
    }

    .input:focus {
      border-color: var(--dex-color-accent, #0078d4);
    }

    .scope {
      margin-top: 4px;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    /* Always in the page, empty or not: a live region added with its text in it is not read out
       by every screen reader, and one that is there all along is. */
    .status {
      flex-shrink: 0;
      padding: 0 8px 4px;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    .results {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 0 4px 8px;
    }

    .file,
    .row {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 4px;
      white-space: nowrap;
      user-select: none;
    }

    .file {
      font-weight: 600;
      cursor: default;
    }

    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    /* At the heading's far end, so the names line up and the counts do too. */
    .file-count {
      flex-shrink: 0;
      margin-left: auto;
      padding: 0 6px;
      border-radius: 8px;
      background: var(--dex-bg-badge, rgba(128, 128, 128, 0.18));
      font-size: 11px;
      font-weight: normal;
      line-height: 16px;
      color: var(--dex-color-text-secondary, #555);
    }

    /* Indented under the file's icon, as a file's sections sit under it in the explorer. */
    .row {
      padding-left: 24px;
      border-radius: 3px;
      cursor: pointer;
    }

    .row:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The active row is the selection the keyboard is on: the selection's surface and ink, as the
       table's selected row and the explorer's. */
    .row[aria-selected='true'] {
      background: var(--dex-color-accent-bg, #cde4f7);
      color: var(--dex-selection-fg, #333);
    }

    dex-icon {
      flex-shrink: 0;
    }

    /* The name gives way last: the place in the file is smaller and muted, and its ellipsis comes
       first. */
    .label {
      flex-shrink: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .where {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    /* What the entry is, at the row's far end as a file's count is at its heading's, so the names
       and the types each line up. It gives way before the name, with its own ellipsis. */
    .type {
      flex-shrink: 1;
      min-width: 0;
      margin-left: auto;
      padding-left: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    mark {
      background: var(--dex-match-highlight-bg, rgba(234, 92, 0, 0.33));
      color: inherit;
      border-radius: 2px;
    }

    /* Forced colours repaint every surface alike: the system's own selection and mark colours keep
       the active row and the match apart. */
    @media (forced-colors: active) {
      .row[aria-selected='true'] {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
      }

      mark {
        forced-color-adjust: none;
        background: Mark;
        color: MarkText;
      }
    }
  `];

  /**
   * The matches to show for the query in the box, in the order the app gives them (searchRanked's
   * items: the best match first). They are drawn grouped by file, each file where its first
   * result is. Shown only while the box holds a query. Default none. Property only.
   */
  @property({ attribute: false }) results: SearchItem[] = [];

  /**
   * What the box holds. The user's typing sets it (and asks for it, once the typing pauses); an
   * app that sets it, to restore a search, asks for nothing, and sets `results` itself. Default
   * empty. Attribute `query`.
   */
  @property({ type: String }) query = '';

  /**
   * Whether the app is still working out the results of the query: "Searching…" stands in for
   * the count, and the list is marked busy. Default false. Attribute `searching`.
   */
  @property({ type: Boolean }) searching = false;

  /**
   * What the search covers, said under the box: "Open files and the folder", say. Default
   * empty, which draws no line. Attribute `scope`.
   */
  @property({ type: String }) scope = '';

  // The row the keyboard is on, as a place in the list as drawn; -1 for none.
  @state() private _active = -1;
  // The results by file, and as one list in the order they are drawn, which is the order the
  // arrows walk. Worked out once per `results`, before the render that draws them.
  private _groups: FileGroup[] = [];
  private _rows: SearchItem[] = [];
  // The query waiting for the typing to pause, if one is.
  private _timer: ReturnType<typeof setTimeout> | undefined;
  // Whether the active row has moved since it was last scrolled into view.
  private _reveal = false;

  /** Puts the focus in the box, its text selected so the next keystroke types over it. */
  focusInput(): void {
    void this.updateComplete.then(() => {
      const input = this._input();
      input?.focus();
      input?.select();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // A panel taken off the page asks nothing more: whoever would answer may be gone with it.
    this._cancel();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('results')) {
      this._group();
      // The best match first, as a combobox's list opens: Enter straight after typing takes it.
      // And in view: the list may still be scrolled to where the arrows took the last results.
      this._active = this._rows.length > 0 ? 0 : -1;
      this._reveal = this._active === 0;
    }
  }

  protected override updated(): void {
    if (!this._reveal) return;
    this._reveal = false;
    this.renderRoot.querySelector<HTMLElement>(`#${optionId(this._active)}`)?.scrollIntoView?.({ block: 'nearest' });
  }

  private _input(): HTMLInputElement | null {
    return this.renderRoot.querySelector('input');
  }

  /** Whether the box holds something to search for: what the results are shown for. */
  private _searchingFor(): boolean {
    return this.query.trim() !== '';
  }

  // By file, in the order each file's first result comes, and within it in the app's order: the
  // app's order says what it thinks comes first, and the file whose best match is first comes
  // first. By uri, not by name: two folders may each hold a params.sldd.
  private _group(): void {
    const results = Array.isArray(this.results) ? this.results : [];
    const byUri = new Map<string, FileGroup>();
    for (const item of results) {
      const uri = item.entry.sourceUri;
      let group = byUri.get(uri);
      if (!group) {
        group = { uri, label: item.entry.sourceLabel, iconId: FILE_ICONS[item.entry.kind] ?? 'typeGeneric', rows: [] };
        byUri.set(uri, group);
      }
      group.rows.push({ item, index: -1 });
    }
    this._groups = [...byUri.values()];
    this._rows = [];
    for (const group of this._groups) {
      for (const row of group.rows) {
        row.index = this._rows.length;
        this._rows.push(row.item);
      }
    }
  }

  private _ask(query: string): void {
    this.dispatchEvent(new CustomEvent<SearchQueryDetail>('dex-search-query', {
      detail: { query },
      bubbles: true,
      composed: true,
    }));
  }

  private _cancel(): void {
    if (this._timer !== undefined) clearTimeout(this._timer);
    this._timer = undefined;
  }

  private _onInput(e: Event): void {
    this.query = (e.target as HTMLInputElement).value;
    this._cancel();
    this._timer = setTimeout(() => {
      this._timer = undefined;
      this._ask(this.query);
    }, QUERY_DELAY_MS);
  }

  private _open(index: number): void {
    const item = this._rows[index];
    if (!item) return;
    this._active = index;
    this.dispatchEvent(new CustomEvent<SearchOpenDetail>('dex-search-open', {
      detail: { sourceUri: item.entry.sourceUri, revealName: item.revealName },
      bubbles: true,
      composed: true,
    }));
  }

  private _onKeydown(e: KeyboardEvent): void {
    // A chord is the app's (the shell's own shortcuts), and Shift with an arrow selects text in
    // the box: neither moves the list nor opens anything.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const shown = this._searchingFor() ? this._rows.length : 0;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (shown === 0) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        // Clamped rather than wrapping, as the add gallery's tiles are: the list has a top and a
        // bottom, and Down at the last result stays on it rather than jumping back to the first.
        this._active = Math.min(Math.max(this._active + step, 0), shown - 1);
        this._reveal = true;
        return;
      }
      case 'Enter':
        // Typed faster than the pause: the results drawn are an older query's, so the active one
        // may not be what the box now asks for. Ask for this query now, and open nothing.
        if (this._timer !== undefined) {
          e.preventDefault();
          this._cancel();
          this._ask(this.query);
          return;
        }
        // The app is still working out this query's results: the rows drawn are the last ones,
        // for the same reason. The key is kept, so it does nothing else either.
        if (this.searching) {
          e.preventDefault();
          return;
        }
        if (shown === 0 || this._active < 0) return;
        e.preventDefault();
        this._open(this._active);
        return;
      case 'Escape':
        // Nothing to clear: the key is the page's (a shell may take it back to the editor).
        if (this.query === '') return;
        // Kept from the page, which would otherwise act on the same press a second time.
        e.preventDefault();
        e.stopPropagation();
        this._cancel();
        this.query = '';
        this._ask('');
        return;
    }
  }

  // The first place the query is in the name, marked; a name it is not in (it matched on its
  // file or its path) is drawn as it is. Only where lower-casing keeps the name's length, so the
  // cut falls between the same characters in the name as in its lower case.
  private _label(name: string) {
    const query = this.query.trim().toLowerCase();
    const lower = name.toLowerCase();
    const at = query && lower.length === name.length ? lower.indexOf(query) : -1;
    if (at < 0) return name;
    return html`${name.slice(0, at)}<mark>${name.slice(at, at + query.length)}</mark>${name.slice(at + query.length)}`;
  }

  private _status(): string {
    if (!this._searchingFor()) return '';
    if (this.searching) return 'Searching…';
    const count = this._rows.length;
    if (count === 0) return 'No matches';
    // At the cap the list stopped, so there may be more than it holds.
    if (count >= MAX_SEARCH_RESULTS) return `${MAX_SEARCH_RESULTS}+ results, first ${MAX_SEARCH_RESULTS} shown`;
    return count === 1 ? '1 result' : `${count} results`;
  }

  private _row(item: SearchItem, index: number) {
    const where = whereInFile(item);
    return html`
      <div
        class="row"
        role="option"
        id=${optionId(index)}
        aria-selected=${index === this._active ? 'true' : 'false'}
        title=${item.description}
        @click=${() => this._open(index)}
      >
        <dex-icon .iconId=${item.iconId} size="16"></dex-icon>
        <span class="label">${this._label(item.label)}</span>
        ${where ? html`<span class="where">${where}</span>` : nothing}
        ${item.type ? html`<span class="type">${item.type}</span>` : nothing}
      </div>
    `;
  }

  override render() {
    // A press anywhere in the list keeps the focus in the box (its mousedown), on a row, a file's
    // heading or the space under the last row, so the arrows go on from the row clicked; nothing
    // in the list is focusable, the list included (Chromium makes a scrolling box a Tab stop).
    const groups = this._searchingFor() ? this._groups : [];
    const active = groups.length > 0 && this._active >= 0 ? optionId(this._active) : undefined;
    return html`
      <div class="box">
        <input
          class="input"
          type="search"
          placeholder="Search entry names"
          aria-label="Search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls=${LIST_ID}
          aria-expanded=${groups.length > 0 ? 'true' : 'false'}
          aria-activedescendant=${active ?? nothing}
          autocomplete="off"
          spellcheck="false"
          .value=${live(this.query)}
          @input=${this._onInput}
          @keydown=${this._onKeydown}
        />
        ${this.scope ? html`<div class="scope">${this.scope}</div>` : nothing}
      </div>
      <div class="status" role="status">${this._status()}</div>
      <div
        class="results"
        id=${LIST_ID}
        role="listbox"
        aria-label="Search results"
        aria-busy=${this.searching ? 'true' : 'false'}
        tabindex="-1"
        @mousedown=${(e: MouseEvent) => e.preventDefault()}
      >
        ${groups.map(
          (group) => html`
            <div role="group" aria-label=${group.label}>
              <div class="file" aria-hidden="true" title=${group.uri}>
                <dex-icon .iconId=${group.iconId} size="16"></dex-icon>
                <span class="file-name">${group.label}</span>
                <span class="file-count">${group.rows.length}</span>
              </div>
              ${group.rows.map(({ item, index }) => this._row(item, index))}
            </div>
          `,
        )}
      </div>
    `;
  }
}

/** Registers the widget as `<dex-search-panel>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export function defineSearchPanel(tag = 'dex-search-panel'): void {
  defineIcon();
  defineElement(tag, DexSearchPanel);
}

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
  interface HTMLElementEventMap extends SearchPanelEventMap {}
  interface DocumentEventMap extends SearchPanelEventMap {}
  interface WindowEventMap extends SearchPanelEventMap {}
}
