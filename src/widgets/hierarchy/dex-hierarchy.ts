// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { styleProps } from '../shared/styleProps.js';
import { DECORATIONS } from '../../model/hierarchy/health.js';
import type { HierarchyItem } from '../../model/hierarchy/folderHierarchy.js';

export type { HierarchyItem };

/** What `dex-hierarchy-select` carries: the row chosen. */
export interface HierarchySelectDetail {
  /** The file the row opens (its `id`), or null for a row that is no file: a folder, External Data, a reference no file answers. */
  uri: string | null;
  /** The row's key, as `selectedKey` now holds it. */
  key: string;
  /** The row. */
  item: HierarchyItem;
}

/** One row as drawn: the item, where it sits, and whether it is open. */
interface Line {
  item: HierarchyItem;
  level: number;
  setSize: number;
  posInSet: number;
  parent: string | null;
  open: boolean;
  /** Open, with its rows not here yet. */
  loading: boolean;
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
 * A click or Enter chooses a row: it is selected, `dex-hierarchy-select` says which file it opens,
 * and a row with rows under it opens or closes. The arrow keys move through the rows (Right opens
 * a row or goes into it, Left closes it or goes to its parent), Home and End go to the first and
 * the last. `revealRow` shows a row the app names (the file it has open), and `expandTopLevel`
 * opens the folder's own row on first show. connectHierarchy wires one to a FolderHierarchy.
 *
 * @tagname dex-hierarchy
 */
export class DexHierarchy extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: block;
      overflow: auto;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    [role='tree'] {
      outline: none;
      padding: 2px 0;
    }

    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      height: var(--dex-row-height, 28px);
      padding: 0 8px 0 4px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      outline: none;
    }

    .row:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The selection's surface and its ink together, as the table's selected row. */
    .row[aria-selected='true'] {
      background: var(--dex-color-accent-bg, #cde4f7);
      color: var(--dex-selection-fg, #333);
    }

    .row:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    .indent {
      flex-shrink: 0;
    }

    .twisty {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      font-size: 9px;
      color: var(--dex-color-text-secondary, #555);
      flex-shrink: 0;
    }

    .twisty.empty {
      visibility: hidden;
    }

    /* Open, with its rows still being read. Dimmed rather than animated, as the table's. */
    .twisty.loading {
      opacity: 0.5;
    }

    dex-icon,
    .warning,
    .info {
      flex-shrink: 0;
    }

    .warning,
    .info {
      width: 16px;
      height: 16px;
    }

    .warning {
      fill: var(--dex-color-warning, #d83b01);
    }

    /* A row that says something of the folder (that only its first files are shown). */
    .info {
      fill: var(--dex-color-text-secondary, #555);
    }

    .notice .label {
      color: var(--dex-color-text-muted, #666);
    }

    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .description {
      color: var(--dex-color-text-muted, #666);
      font-size: 0.92em;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex-shrink: 1000;
    }

    .badge {
      margin-left: auto;
      padding-left: 8px;
      flex-shrink: 0;
    }

    .health-cycle .label,
    .health-cycle .badge {
      color: var(--dex-color-warning, #d83b01);
    }

    .health-modified .label,
    .health-modified .badge {
      color: var(--dex-color-modified, #b45309);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    @media (forced-colors: active) {
      .row[aria-selected='true'] {
        background: Highlight;
        color: HighlightText;
      }

      .row:focus-visible {
        outline: 2px solid CanvasText;
        outline-offset: -2px;
      }

      .warning,
      .info {
        fill: CanvasText;
      }
    }
  `];

  /** The top-level rows. Replacing them asks `loadChildren` again for every open row. Default none. */
  @property({ attribute: false }) items: HierarchyItem[] = [];
  /**
   * What answers the rows under a row, as it is first opened: a FolderHierarchy's `children`.
   * Null, the default, opens every row onto nothing.
   */
  @property({ attribute: false }) loadChildren: ((item: HierarchyItem) => Promise<HierarchyItem[]>) | null = null;
  /**
   * The keys of the open rows. The tree changes it as the user opens and closes rows; a row
   * whose key is here opens as soon as it is shown. Default none.
   */
  @property({ attribute: false }) expandedKeys: string[] = [];
  /** The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing. */
  @property({ attribute: false }) selectedKey: string | null = null;
  /** What a screen reader calls the tree. Default `Files`. Attribute `label`. */
  @property({ type: String }) label = 'Files';
  /**
   * Open each top-level row (a folder's own row, each project's) the first time the tree shows it,
   * by adding its key to `expandedKeys`, as a table opens its sections; after that the row stays
   * as the user leaves it, through new `items` too. Another folder's rows are new rows, and open.
   * Off, the default, a folder opens closed. Attribute `expand-top-level`.
   */
  @property({ type: Boolean, attribute: 'expand-top-level' }) expandTopLevel = false;

  // The rows under each open row, by its key, for the items there are now; and those for the
  // items there were, drawn while the new ones are read, so an open row does not blink shut.
  @state() private _children = new Map<string, HierarchyItem[]>();
  private _previous = new Map<string, HierarchyItem[]>();
  private _asked = new Set<string>();
  private _generation = 0;
  @state() private _focusKey: string | null = null;
  private _focusPending = false;
  private _open = new Set<string>();
  // The top-level rows expandTopLevel has opened once, by key: from then on they are the user's.
  private _openedTop = new Set<string>();
  // The row revealRow() is to scroll into view once it is drawn.
  private _scrollKey: string | null = null;

  /**
   * Show a row: open each row of `path` but the last (the rows from a top-level row down to it,
   * as FolderHierarchy's `pathTo` gives them), select the last, and scroll it into view as soon as
   * it is drawn, once the rows above it are read. The keyboard goes on from it. It takes no focus,
   * and a choice of the user's before the row is drawn leaves the scroll undone.
   *
   * Sends nothing, unless `options.choose`: then `dex-hierarchy-select` for the row, as a click on
   * it sends, without opening or closing it. connectHierarchy's `reveal(uri)` finds the path to a
   * file's row.
   */
  revealRow(path: readonly HierarchyItem[], options: { choose?: boolean } = {}): void {
    const row = path[path.length - 1];
    if (!row) return;
    const closed = path.slice(0, -1).map((item) => item.key).filter((key) => !this.expandedKeys.includes(key));
    if (closed.length > 0) this.expandedKeys = [...this.expandedKeys, ...closed];
    this.selectedKey = row.key;
    this._focusKey = row.key;
    this._scrollKey = row.key;
    if (options.choose) this._announce(row);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    let opened = false;
    if (changed.has('items') && this.expandTopLevel && Array.isArray(this.items)) {
      const fresh = this.items.filter((i) => i.collapsible === 'collapsed' && !this._openedTop.has(i.key)).map((i) => i.key);
      for (const key of fresh) this._openedTop.add(key);
      const closed = fresh.filter((key) => !this.expandedKeys.includes(key));
      if (closed.length > 0) {
        this.expandedKeys = [...this.expandedKeys, ...closed];
        opened = true;
      }
    }
    if (changed.has('expandedKeys') || opened) this._open = new Set(this.expandedKeys);
    if (changed.has('items') || changed.has('loadChildren')) {
      this._generation++;
      // Only an open row's: a closed one is asked again when it is opened, and draws nothing meanwhile.
      this._previous = new Map([...this._previous, ...this._children].filter(([key]) => this._open.has(key)));
      this._children = new Map();
      this._asked = new Set();
    }
  }

  protected override updated(): void {
    for (const line of this._lines()) if (line.loading) this._load(line.item);
    if (this._focusPending) {
      this._focusPending = false;
      this._rowElement(this._focusKey)?.focus();
    }
    const reveal = this._rowElement(this._scrollKey);
    if (reveal) {
      this._scrollKey = null;
      reveal.scrollIntoView?.({ block: 'nearest' });
    }
  }

  private _load(item: HierarchyItem): void {
    if (this._asked.has(item.key)) return;
    this._asked.add(item.key);
    const generation = this._generation;
    const load = this.loadChildren;
    // A read that fails, or throws, opens the row onto nothing, as a row with nothing under it.
    void Promise.resolve()
      .then(() => (load ? load(item) : []))
      .catch(() => [])
      .then((children) => {
        if (generation !== this._generation) return;
        this._previous.delete(item.key);
        this._children = new Map(this._children).set(item.key, Array.isArray(children) ? children : []);
      });
  }

  /** Every row drawn, in order. */
  private _lines(): Line[] {
    const out: Line[] = [];
    const walk = (items: readonly HierarchyItem[], level: number, parent: string | null): void => {
      items.forEach((item, i) => {
        const open = item.collapsible === 'collapsed' && this._open.has(item.key);
        const children = open ? (this._children.get(item.key) ?? this._previous.get(item.key)) : undefined;
        out.push({ item, level, setSize: items.length, posInSet: i + 1, parent, open, loading: open && !this._children.has(item.key) });
        if (children) walk(children, level + 1, item.key);
      });
    };
    walk(Array.isArray(this.items) ? this.items : [], 1, null);
    return out;
  }

  private _rowElement(key: string | null): HTMLElement | undefined {
    if (key === null) return undefined;
    return [...this.renderRoot.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((el) => el.dataset.key === key);
  }

  private _setOpen(item: HierarchyItem, open: boolean): void {
    if (item.collapsible !== 'collapsed' || this._open.has(item.key) === open) return;
    this.expandedKeys = open ? [...this.expandedKeys, item.key] : this.expandedKeys.filter((k) => k !== item.key);
  }

  private _focus(key: string): void {
    this._focusKey = key;
    this._focusPending = true;
    this._scrollKey = null;
  }

  // A click or Enter: the row is selected, says so, and opens or closes.
  private _choose(item: HierarchyItem): void {
    this._scrollKey = null;
    this.selectedKey = item.key;
    this._focusKey = item.key;
    this._announce(item);
    this._setOpen(item, !this._open.has(item.key));
  }

  private _announce(item: HierarchyItem): void {
    this.dispatchEvent(
      new CustomEvent<HierarchySelectDetail>('dex-hierarchy-select', {
        detail: { uri: item.id ?? null, key: item.key, item },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onKeydown(e: KeyboardEvent): void {
    const lines = this._lines();
    if (lines.length === 0) return;
    const at = Math.max(0, lines.findIndex((l) => l.item.key === this._focusKey));
    const line = lines[at]!;
    const go = (to: Line | undefined): void => {
      if (to) this._focus(to.item.key);
    };
    switch (e.key) {
      case 'ArrowDown':
        go(lines[at + 1]);
        break;
      case 'ArrowUp':
        go(lines[at - 1]);
        break;
      case 'Home':
        go(lines[0]);
        break;
      case 'End':
        go(lines[lines.length - 1]);
        break;
      case 'ArrowRight':
        if (line.item.collapsible !== 'collapsed') break;
        if (!line.open) this._setOpen(line.item, true);
        else if (lines[at + 1]?.parent === line.item.key) go(lines[at + 1]);
        break;
      case 'ArrowLeft':
        if (line.open) this._setOpen(line.item, false);
        else go(lines.find((l) => l.item.key === line.parent));
        break;
      case 'Enter':
        this._choose(line.item);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private _onTwisty(e: Event, item: HierarchyItem): void {
    // The twisty opens and closes, and chooses nothing.
    e.stopPropagation();
    this._focusKey = item.key;
    this._setOpen(item, !this._open.has(item.key));
  }

  private _icon(item: HierarchyItem) {
    if (item.kind === 'notice') {
      return html`<svg class="info" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.3a5.7 5.7 0 1 1 0 11.4A5.7 5.7 0 0 1 8 2.3zM7.3 7h1.4v4.5H7.3V7zM8 4.3a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z"/></svg>`;
    }
    if (item.kind === 'missing') {
      return html`<svg class="warning" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 1.5a.7.7 0 0 0-1.2 0L.6 13.6a.7.7 0 0 0 .6 1h13.6a.7.7 0 0 0 .6-1L8.6 1.5zM7.3 5.5h1.4l-.2 5H7.5l-.2-5zM8 11.5a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/></svg>`;
    }
    return item.icon ? html`<dex-icon .iconId=${item.icon} size="16"></dex-icon>` : nothing;
  }

  private _badge(item: HierarchyItem) {
    const health = item.health;
    if (!health || !Object.hasOwn(DECORATIONS, health)) return nothing;
    const { badge, tooltip } = DECORATIONS[health];
    return html`<span class="badge" title=${tooltip} aria-hidden="true">${badge}</span><span class="sr-only">${tooltip}</span>`;
  }

  private _row(line: Line, tabbable: boolean) {
    const { item, level, open, loading } = line;
    const twisty = item.collapsible === 'collapsed';
    return html`
      <div
        class="row ${item.health ? `health-${item.health}` : ''} ${item.kind === 'notice' ? 'notice' : ''}"
        role="treeitem"
        data-key=${item.key}
        aria-level=${level}
        aria-setsize=${line.setSize}
        aria-posinset=${line.posInSet}
        aria-expanded=${twisty ? String(open) : nothing}
        aria-selected=${String(item.key === this.selectedKey)}
        aria-busy=${loading ? 'true' : nothing}
        tabindex=${tabbable ? '0' : '-1'}
        title=${item.tooltip ?? nothing}
        @click=${() => this._choose(item)}
        @focus=${() => (this._focusKey = item.key)}
      >
        <span class="indent" ${styleProps({ width: `${(level - 1) * 16}px` })}></span>
        <span
          class="twisty ${twisty ? '' : 'empty'} ${loading ? 'loading' : ''}"
          aria-hidden="true"
          @click=${twisty ? (e: Event) => this._onTwisty(e, item) : nothing}
          >${twisty ? (open ? '▼' : '▶') : ''}</span
        >
        ${this._icon(item)}
        <span class="label">${item.label}</span>
        ${item.description ? html`<span class="description">${item.description}</span>` : nothing}
        ${this._badge(item)}
      </div>
    `;
  }

  override render() {
    const lines = this._lines();
    // One row takes the Tab key: the one the keyboard was on, else the selected one, else the first.
    const tabbable =
      [this._focusKey, this.selectedKey].find((key) => key !== null && lines.some((l) => l.item.key === key)) ??
      lines[0]?.item.key;
    return html`
      <div role="tree" aria-label=${this.label} @keydown=${this._onKeydown}>
        ${lines.map((line) => this._row(line, line.item.key === tabbable))}
      </div>
    `;
  }
}

/** Registers the widget as `<dex-hierarchy>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export function defineHierarchy(tag = 'dex-hierarchy'): void {
  defineIcon();
  defineElement(tag, DexHierarchy);
}

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
  'dex-hierarchy-select': CustomEvent<HierarchySelectDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-hierarchy': DexHierarchy;
  }
  interface HTMLElementEventMap extends HierarchyEventMap {}
  interface DocumentEventMap extends HierarchyEventMap {}
  interface WindowEventMap extends HierarchyEventMap {}
}
