// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
import {
  defineTreeTable,
  type DexTreeTable,
  type DiffMark,
  type ExpansionChangedDetail,
  type RowSelectedDetail,
  type TableContextMenuDetail,
  type TableScrolledDetail,
  type TreeTableRow,
} from '../tree-table/dex-tree-table.js';

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
 * The events of a compare table the view keeps to itself: each is a document table's in an app (a
 * selection to inspect, a menu to open, a link to follow), and a compare table's is not one. The
 * first four the view answers (it keeps the tables together, and says a selection and a menu in its
 * own events); none reaches outside the view.
 */
const TABLE_EVENTS = [
  'dex-expansion-changed',
  'dex-table-scrolled',
  'dex-row-selected',
  'dex-table-context-menu',
  'dex-request-children',
  'dex-link-clicked',
  'dex-row-drag-start',
  'dex-row-drag-end',
  'dex-row-drop',
  'dex-edit-text-request',
  'dex-edit-completed',
  'dex-add-entry',
  'dex-matrix-open',
] as const;

const stop = (e: Event): void => e.stopPropagation();

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
export class DexCompareView extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
      background: var(--dex-bg-primary, #fff);
    }

    /* The compact toolbar's row: its surface, its line under it, its buttons' size. */
    .header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 32px;
      padding: 2px 8px;
      box-sizing: border-box;
      background: var(--dex-bg-toolbar, #fff);
      border-bottom: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .summary {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      cursor: pointer;
    }

    input[type='checkbox'] {
      margin: 0;
    }

    .steps {
      display: flex;
      gap: 2px;
    }

    .step {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 3px;
      background: none;
      color: inherit;
      cursor: pointer;
    }

    .step:hover:not([aria-disabled='true']) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .step:active:not([aria-disabled='true']) {
      background: var(--dex-bg-active, #e0e0e0);
    }

    /* The icon greyed and not the button, as the toolbar's: the keyboard can stand on a step with
       nowhere to go, and its focus ring stays at full strength. */
    .step[aria-disabled='true'] {
      cursor: default;
    }

    .step[aria-disabled='true'] > * {
      opacity: 0.4;
    }

    /* The two sides, split by a line. Each column's caption is one height, so the two tables' rows
       start level and stay line for line. */
    .sides {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .side {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .side + .side {
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .caption {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
      height: 26px;
      padding: 0 8px;
      box-sizing: border-box;
      background: var(--dex-bg-secondary, #f8f8f8);
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
      font-weight: 600;
      white-space: nowrap;
    }

    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dirty {
      flex: none;
    }

    .tag {
      flex: none;
      padding: 0 6px;
      border-radius: 3px;
      background: var(--dex-tag-bg, #e0e0e0);
      color: var(--dex-tag-fg, #333);
      font-size: 11px;
      font-weight: normal;
      line-height: 16px;
    }

    dex-tree-table {
      flex: 1 1 auto;
      min-height: 0;
    }

    .empty {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: var(--dex-color-text-muted, #666);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    /* The shared rules grey a disabled <button>, which these are not: theirs is aria-disabled. A
       tag's surface goes in forced colours, and its edge says it is one. */
    @media (forced-colors: active) {
      .step[aria-disabled='true'] {
        border-color: GrayText !important;
        color: GrayText !important;
      }

      .tag {
        border: 1px solid CanvasText;
      }
    }
  `];

  /** The left side: its caption and its table's rows. */
  @property({ attribute: false }) left: CompareSide | null = null;
  /** The right side, the same lines as the left. */
  @property({ attribute: false }) right: CompareSide | null = null;
  /** The header's words for what differs ("3 changed, 1 added, 2 removed"), said politely to a screen reader as it changes. */
  @property() summary = '';
  /** The header's checkbox: lines with no difference in or under them are left out (the app gives rows to match). Default true. Attribute `only-differences`. */
  @property({ type: Boolean, attribute: 'only-differences' }) onlyDifferences = true;
  /** Whether there is a change to go to: Previous and Next Change are enabled. Attribute `has-changes`. */
  @property({ type: Boolean, attribute: 'has-changes' }) hasChanges = false;
  /** Said in place of the tables while both have no rows ("No differences"); '' shows the tables. */
  @property() empty = '';
  /** Both tables' style. Attribute `table-style`. */
  @property({ attribute: 'table-style' }) tableStyle: 'normal' | 'light' = 'normal';
  /** Both tables' `storageKey` (their column choices, shared). Default null: kept for the element's life only. Attribute `storage-key`. */
  @property({ attribute: 'storage-key' }) storageKey: string | null = null;

  // The lines open and selected, the two tables': given to both, so they cannot disagree. A new
  // Set or array only when they change, so a table is not handed the same lines again on every
  // render (its setter takes them as a holder's change, and draws again).
  @state() private _expanded: Set<string> = new Set();
  @state() private _selected: string[] = [];

  /** The lines shown open, both tables'; setting it sends nothing. */
  get expandedIds(): Set<string> {
    return new Set(this._expanded);
  }
  set expandedIds(ids: Iterable<string>) {
    this._expanded = new Set(ids);
  }

  /** The selected lines. */
  get selectedIds(): string[] {
    return [...this._selected];
  }

  /** Select these lines in both tables, opening their parents and bringing the first into view; sends nothing. */
  select(lineIds: readonly string[]): void {
    this._selected = [...lineIds];
  }

  /** The keyboard to the left table's grid. */
  override focus(): void {
    this._table('left')?.focusGrid();
  }

  // The tables' own events stop at the view's root: each table's binding below has answered its
  // own first (they run at the table, before the event reaches here).
  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot();
    for (const name of TABLE_EVENTS) root.addEventListener(name, stop);
    return root;
  }

  private _table(which: 'left' | 'right'): DexTreeTable | null {
    // Before the view is first connected it has no render root, and no table.
    return this.renderRoot?.querySelector<DexTreeTable>(`dex-tree-table[data-side="${which}"]`) ?? null;
  }

  private _other(which: 'left' | 'right'): DexTreeTable | null {
    return this._table(which === 'left' ? 'right' : 'left');
  }

  // A line opened or closed in one table, by the user or by the table itself: both show it so.
  private _onExpansion(e: CustomEvent<ExpansionChangedDetail>): void {
    this._expanded = new Set(e.detail.expandedIds);
  }

  // Where each table was scrolled to by the view, as it read back after the scroll (the browser
  // clamps one past the end): the scroll event that follows is that scroll's echo, not the user's.
  private _echo = new Map<DexTreeTable, number>();

  // A scroll of one: the other to the same place, unless it is there already. The other's own
  // scroll event follows a frame later; by then the user may have scrolled the first further, so an
  // echo is told by the place the view scrolled it to, and not by where the first is now (which
  // would pull the first back to where it was a frame ago, against a scroll still going).
  private _onScrolled(which: 'left' | 'right', e: CustomEvent<TableScrolledDetail>): void {
    const from = e.currentTarget as DexTreeTable;
    const echo = this._echo.get(from);
    this._echo.delete(from);
    if (echo === e.detail.top) return;
    const other = this._other(which);
    if (!other || other.bodyScroll.top === e.detail.top) return;
    const before = other.bodyScroll.top;
    other.scrollBodyTo(e.detail.top);
    // A scroll that did not move it (already at the end) sends no event to wait for.
    const after = other.bodyScroll.top;
    if (after !== before) this._echo.set(other, after);
  }

  private _onSelected(e: CustomEvent<RowSelectedDetail>): void {
    this._selected = [...e.detail.rowIds];
    this.dispatchEvent(
      new CustomEvent<CompareSelectedDetail>('dex-compare-selected', {
        detail: { lineIds: [...e.detail.rowIds] },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // A right-click selects its row first, which the table says first (_onSelected), so the lines are
  // that table's selection now.
  private _onMenu(which: 'left' | 'right', e: CustomEvent<TableContextMenuDetail>): void {
    const table = e.currentTarget as DexTreeTable;
    const { x, y, keyboard } = e.detail;
    this.dispatchEvent(
      new CustomEvent<CompareMenuDetail>('dex-compare-menu', {
        detail: { side: which, lineIds: [...table.selectedRowIds], x, y, ...(keyboard ? { keyboard } : {}) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _step(by: 1 | -1): void {
    if (!this.hasChanges) return;
    this.dispatchEvent(new CustomEvent<CompareStepDetail>('dex-compare-step', { detail: { by }, bubbles: true, composed: true }));
  }

  private _onFilter(e: Event): void {
    this.onlyDifferences = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent<CompareFilterChangedDetail>('dex-compare-filter-changed', {
        detail: { onlyDifferences: this.onlyDifferences },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderCaption(side: CompareSide) {
    return html`<div class="caption" title=${side.title ?? side.name}>
      <span class="name">${side.name}</span>
      ${side.dirty ? html`<span class="dirty"><span aria-hidden="true">●</span><span class="sr-only">unsaved</span></span>` : nothing}
      ${side.editable ? nothing : html`<span class="tag">Read-only</span>`}
    </div>`;
  }

  private _renderSide(which: 'left' | 'right', side: CompareSide | null) {
    if (!side) return html`<div class="side"></div>`;
    return html`<div class="side">
      ${this._renderCaption(side)}
      <dex-tree-table
        data-side=${which}
        fixed-rows
        readonly
        keyboard-menu
        grid-label=${side.name}
        table-style=${this.tableStyle}
        .storageKey=${this.storageKey}
        .rows=${side.rows}
        .columns=${side.columns}
        .columnLabels=${side.columnLabels}
        .columnGroups=${side.columnGroups}
        .diffMarks=${side.marks}
        .expandedIds=${this._expanded}
        .selectedRowIds=${this._selected}
        @dex-expansion-changed=${this._onExpansion}
        @dex-table-scrolled=${(e: CustomEvent<TableScrolledDetail>) => this._onScrolled(which, e)}
        @dex-row-selected=${this._onSelected}
        @dex-table-context-menu=${(e: CustomEvent<TableContextMenuDetail>) => this._onMenu(which, e)}
      ></dex-tree-table>
    </div>`;
  }

  override render() {
    const none = !!this.empty && !this.left?.rows.length && !this.right?.rows.length;
    return html`
      <div class="header">
        <span class="summary" role="status" aria-live="polite">${this.summary}</span>
        <label><input type="checkbox" .checked=${this.onlyDifferences} @change=${this._onFilter} />Show only differences</label>
        <div class="steps">
          <button
            type="button"
            class="step"
            aria-label="Previous Change"
            title="Previous Change (Shift+F7)"
            aria-disabled=${this.hasChanges ? nothing : 'true'}
            @click=${() => this._step(-1)}
          ><dex-icon .iconId=${'arrowNavigationNorthUI'} .size=${16}></dex-icon></button>
          <button
            type="button"
            class="step"
            aria-label="Next Change"
            title="Next Change (F7)"
            aria-disabled=${this.hasChanges ? nothing : 'true'}
            @click=${() => this._step(1)}
          ><dex-icon .iconId=${'arrowNavigationSouthUI'} .size=${16}></dex-icon></button>
        </div>
      </div>
      ${none
        ? html`<div class="empty">${this.empty}</div>`
        : html`<div class="sides">${this._renderSide('left', this.left)}${this._renderSide('right', this.right)}</div>`}
    `;
  }
}

/** Registers the widget as `<dex-compare-view>`, or under `tag`, with the icons and the tables it draws. */
export function defineCompareView(tag = 'dex-compare-view'): void {
  defineIcon();
  defineTreeTable();
  defineElement(tag, DexCompareView);
}

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
  interface HTMLElementEventMap extends CompareViewEventMap {}
  interface DocumentEventMap extends CompareViewEventMap {}
  interface WindowEventMap extends CompareViewEventMap {}
}
