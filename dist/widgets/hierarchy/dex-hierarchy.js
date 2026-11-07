// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { isMacPlatform } from '../shared/dragMode.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { styleProps } from '../shared/styleProps.js';
import { DECORATIONS } from '../../model/hierarchy/health.js';
// The keys that ask for a row's menu with `rowMenu`, as aria-keyshortcuts names them (the table's).
const MENU_KEYS = 'Shift+F10 ContextMenu';
/**
 * A folder's hierarchy as a tree: each project and folder, the files in it, and under each file
 * the files it references, opened a level at a time. The rows are HierarchyItems
 * (`data-explorer-view/model`'s FolderHierarchy makes them); the rows under one are asked of
 * `loadChildren` as it is first opened, and asked again when `items` is replaced. A row reads its
 * file's name and kind, an unresolved reference a warning, a file's mark a badge (a circular
 * reference, unsaved changes), and a notice (a folder of which only the first files are shown) an
 * information mark.
 *
 * For a folder drawn as a file browser draws it (FolderTree's rows), a `dimmed` row is a file the
 * app does not open, in the muted ink, disabled for a screen reader and opening nothing; a row's
 * `relation` says after its name what it is to the row above it; and `marks` mark each file's rows
 * as its tab stands (open, active, unsaved, a preview). With `rowMenu`, a right click, Shift+F10 or
 * the ContextMenu key asks for a row's menu (`dex-hierarchy-menu`), which the app draws. Rows
 * without these fields, a tree without marks and one without `rowMenu` draw and answer as they
 * always have.
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
export class DexHierarchy extends LitElement {
    constructor() {
        super(...arguments);
        /** The top-level rows. Replacing them asks `loadChildren` again for every open row. Default none. */
        this.items = [];
        /**
         * What answers the rows under a row, as it is first opened: a FolderHierarchy's `children`.
         * Null, the default, opens every row onto nothing.
         */
        this.loadChildren = null;
        /**
         * The keys of the open rows. The tree changes it as the user opens and closes rows; a row
         * whose key is here opens as soon as it is shown. Default none.
         */
        this.expandedKeys = [];
        /**
         * How each file's rows stand in the tabs, by the file's uri (a row's `id`): open, the active
         * tab, unsaved, a preview. Setting it redraws the rows; it sends nothing. Default none.
         */
        this.marks = new Map();
        /** The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing. */
        this.selectedKey = null;
        /**
         * Whether a row's menu is the app's: a right click on a row, or Shift+F10 or the ContextMenu key
         * on the focused row, sends `dex-hierarchy-menu`, the browser's own menu kept away and both keys
         * spent, and the tree names the keys (`aria-keyshortcuts`). False, the default, leaves the right
         * click and both keys to the browser, as they always were. Attribute `row-menu`.
         */
        this.rowMenu = false;
        /** What a screen reader calls the tree. Default `Files`. Attribute `label`. */
        this.label = 'Files';
        /**
         * Open each top-level row (a folder's own row, each project's) the first time the tree shows it,
         * by adding its key to `expandedKeys`, as a table opens its sections; after that the row stays
         * as the user leaves it, through new `items` too. Another folder's rows are new rows, and open.
         * Off, the default, a folder opens closed. Attribute `expand-top-level`.
         */
        this.expandTopLevel = false;
        /**
         * Cmd+click (macOS) or Ctrl+click takes a row into the selection, or out of it, without opening it:
         * `selectedKeys` holds every selected row and `dex-hierarchy-selection-changed` says so. A plain
         * click or Enter selects that row alone, as before. Default false: one row at a time. Attribute `multi-select`.
         */
        this.multiSelect = false;
        /** With `multiSelect`: the keys of every selected row, `selectedKey` (the last taken in) among them. Property only. */
        this.selectedKeys = [];
        // The rows under each open row, by its key, for the items there are now; and those for the
        // items there were, drawn while the new ones are read, so an open row does not blink shut.
        this._children = new Map();
        this._previous = new Map();
        this._asked = new Set();
        this._generation = 0;
        this._focusKey = null;
        this._focusPending = false;
        this._open = new Set();
        // The top-level rows expandTopLevel has opened once, by key: from then on they are the user's.
        this._openedTop = new Set();
        // The row revealRow() is to scroll into view once it is drawn.
        this._scrollKey = null;
        // A menu the keyboard asked for, whose own contextmenu event (which the browser sends for the
        // same key, after its keydown or its keyup) is not a second ask. A pointer's press lets go of it
        // (a right click always has one), and so does a task after the key's keyup: a contextmenu with no
        // pointer after that (an assistive technology's "show menu") is an ask of its own. So does the
        // keyboard leaving the tree: a menu shown with focusFirst takes it before the key is let go, and
        // the keyup lands there.
        this._keyMenu = false;
    }
    static { this.styles = [hiddenStyles, css `
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

    /* A file the app does not open: the muted ink at full opacity (4.5:1 in every theme), before
       the selected row's rule, so a selected one reads in the selection's ink. */
    .row.dimmed {
      color: var(--dex-color-text-muted, #666);
      cursor: default;
    }

    /* The active tab's row, when it is not the tree's selection: a lighter fill than the selection's
       (the hover's, a step darker under the pointer), its name and description in the selection's
       ink, which clears 4.5:1 on either fill in every theme. */
    .row.active {
      background: var(--dex-bg-hover, #e8e8e8);
      color: var(--dex-selection-fg, #333);
    }

    /* Only while it is not the selection: bare, (0,3,0) would outrank the selection's rule below
       and grey an active, selected row under the pointer, whatever their order. */
    .row.active:not([aria-selected='true']):hover {
      background: var(--dex-bg-active, #e0e0e0);
    }

    /* The selection's surface and its ink together, as the table's selected row. */
    .row[aria-selected='true'] {
      background: var(--dex-color-accent-bg, #cde4f7);
      color: var(--dex-selection-fg, #333);
    }

    /* On either, the name and the description are in the selection's ink, over the colours a row's
       own state gives them (the muted ink, a mark's), which do not clear 4.5:1 on these fills. The
       badge keeps its colour: a glyph clears the 3:1 a mark needs. */
    .row.active .label,
    .row.active .description,
    .row[aria-selected='true'] .label,
    .row[aria-selected='true'] .description {
      color: var(--dex-selection-fg, #333);
    }

    .row:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* Open in a tab: a bar at the left edge, and the focus ring beside it rather than over it. */
    .row.open {
      box-shadow: inset 2px 0 0 var(--dex-color-accent, #0078d4);
    }

    .row.open:focus-visible {
      box-shadow: inset 2px 0 0 var(--dex-color-accent, #0078d4), inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* A preview tab's file, as the tab's own label is. */
    .preview .label {
      font-style: italic;
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
      /* Before the selection's, as in the base rules: a selected file the app does not open reads
         in HighlightText. */
      .row.dimmed {
        color: GrayText;
      }

      /* The active tab's row, not selected: no fill (forced colours have one for the selection
         alone), a Highlight outline inside it; the focus ring is drawn over it. */
      .row.active {
        outline: 1px solid Highlight;
        outline-offset: -1px;
      }

      .row[aria-selected='true'] {
        background: Highlight;
        color: HighlightText;
      }

      .row[aria-selected='true'] .label,
      .row[aria-selected='true'] .description {
        color: HighlightText;
      }

      /* Forced colours drop a shadow: the open bar is a border there, the row's padding given up for
         it, and on the selection's Highlight in HighlightText. */
      .row.open {
        border-left: 2px solid Highlight;
        padding-left: 2px;
      }

      .row.open[aria-selected='true'] {
        border-left-color: HighlightText;
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
  `]; }
    /** The items of `selectedKeys` among the rows loaded, in the tree's order. */
    get selectedItems() {
        const wanted = new Set(this.selectedKeys);
        const out = [];
        const walk = (items) => {
            for (const item of items) {
                if (wanted.has(item.key))
                    out.push(item);
                const children = this._children.get(item.key) ?? this._previous.get(item.key);
                if (children)
                    walk(children);
            }
        };
        walk(Array.isArray(this.items) ? this.items : []);
        return out;
    }
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
    revealRow(path, options = {}) {
        const row = path[path.length - 1];
        if (!row)
            return;
        const closed = path.slice(0, -1).map((item) => item.key).filter((key) => !this.expandedKeys.includes(key));
        if (closed.length > 0)
            this.expandedKeys = [...this.expandedKeys, ...closed];
        this.selectedKey = row.key;
        this._focusKey = row.key;
        this._scrollKey = row.key;
        if (options.choose)
            this._announce(row);
    }
    willUpdate(changed) {
        let opened = false;
        if (changed.has('items') && this.expandTopLevel && Array.isArray(this.items)) {
            const fresh = this.items.filter((i) => i.collapsible === 'collapsed' && !this._openedTop.has(i.key)).map((i) => i.key);
            for (const key of fresh)
                this._openedTop.add(key);
            const closed = fresh.filter((key) => !this.expandedKeys.includes(key));
            if (closed.length > 0) {
                this.expandedKeys = [...this.expandedKeys, ...closed];
                opened = true;
            }
        }
        if (changed.has('expandedKeys') || opened)
            this._open = new Set(this.expandedKeys);
        // A row the app selects (revealRow, or `selectedKey` set) is the selection, alone, as a click on
        // it would make it: so the row drawn as selected is the one it says.
        if (this.multiSelect && changed.has('selectedKey') && this.selectedKey !== null && !this.selectedKeys.includes(this.selectedKey)) {
            this.selectedKeys = [this.selectedKey];
        }
        if (changed.has('items') || changed.has('loadChildren')) {
            this._generation++;
            // Only an open row's: a closed one is asked again when it is opened, and draws nothing meanwhile.
            this._previous = new Map([...this._previous, ...this._children].filter(([key]) => this._open.has(key)));
            this._children = new Map();
            this._asked = new Set();
        }
    }
    updated() {
        for (const line of this._lines())
            if (line.loading)
                this._load(line.item);
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
    _load(item) {
        if (this._asked.has(item.key))
            return;
        this._asked.add(item.key);
        const generation = this._generation;
        const load = this.loadChildren;
        // A read that fails, or throws, opens the row onto nothing, as a row with nothing under it.
        void Promise.resolve()
            .then(() => (load ? load(item) : []))
            .catch(() => [])
            .then((children) => {
            if (generation !== this._generation)
                return;
            this._previous.delete(item.key);
            this._children = new Map(this._children).set(item.key, Array.isArray(children) ? children : []);
        });
    }
    /** Every row drawn, in order. */
    _lines() {
        const out = [];
        const walk = (items, level, parent) => {
            items.forEach((item, i) => {
                const open = item.collapsible === 'collapsed' && this._open.has(item.key);
                const children = open ? (this._children.get(item.key) ?? this._previous.get(item.key)) : undefined;
                out.push({ item, level, setSize: items.length, posInSet: i + 1, parent, open, loading: open && !this._children.has(item.key) });
                if (children)
                    walk(children, level + 1, item.key);
            });
        };
        walk(Array.isArray(this.items) ? this.items : [], 1, null);
        return out;
    }
    _rowElement(key) {
        if (key === null)
            return undefined;
        return [...this.renderRoot.querySelectorAll('[role="treeitem"]')].find((el) => el.dataset.key === key);
    }
    _setOpen(item, open) {
        if (item.collapsible !== 'collapsed' || this._open.has(item.key) === open)
            return;
        this.expandedKeys = open ? [...this.expandedKeys, item.key] : this.expandedKeys.filter((k) => k !== item.key);
    }
    _focus(key) {
        this._focusKey = key;
        this._focusPending = true;
        this._scrollKey = null;
    }
    // A click or Enter: the row is selected, alone, says so, and opens or closes.
    _choose(item) {
        this._scrollKey = null;
        this.selectedKey = item.key;
        this._focusKey = item.key;
        if (this.multiSelect) {
            this.selectedKeys = [item.key];
            this._selectionChanged();
        }
        this._announce(item);
        this._setOpen(item, !this._open.has(item.key));
    }
    // A row's click: with `multiSelect` and the platform's Mod key held (Command on macOS, Control
    // elsewhere, read at each press), the row taken into the selection or out of it, opening nothing;
    // else the row chosen, as ever.
    _onClick(e, item) {
        const mod = isMacPlatform(navigator.platform || navigator.userAgent || '') ? e.metaKey : e.ctrlKey;
        if (!this.multiSelect || !mod)
            return this._choose(item);
        this._scrollKey = null;
        this._focusKey = item.key;
        const had = this.selectedKeys.includes(item.key);
        this.selectedKeys = had ? this.selectedKeys.filter((key) => key !== item.key) : [...this.selectedKeys, item.key];
        this.selectedKey = had ? (this.selectedKeys[this.selectedKeys.length - 1] ?? null) : item.key;
        this._selectionChanged();
    }
    _selectionChanged() {
        const items = this.selectedItems;
        // In the tree's order; a selected row not loaded now (under a row read again) after them.
        const keys = [...items.map((i) => i.key), ...this.selectedKeys.filter((key) => !items.some((i) => i.key === key))];
        this.dispatchEvent(new CustomEvent('dex-hierarchy-selection-changed', { detail: { keys, items }, bubbles: true, composed: true }));
    }
    _announce(item) {
        this.dispatchEvent(new CustomEvent('dex-hierarchy-selected', {
            // A dimmed row opens nothing, whatever it names.
            detail: { uri: item.dimmed ? null : (item.id ?? null), key: item.key, item },
            bubbles: true,
            composed: true,
        }));
    }
    _menu(detail) {
        this.dispatchEvent(new CustomEvent('dex-hierarchy-menu', { detail, bubbles: true, composed: true }));
    }
    // A right click: the menu where the pointer is, and not the browser's. Without `rowMenu`, the
    // browser's, as it always was.
    _onContextMenu(e, item) {
        if (!this.rowMenu)
            return;
        e.preventDefault();
        if (this._keyMenu) {
            this._keyMenu = false;
            return;
        }
        this._focusKey = item.key;
        this._menu({ item, x: e.clientX, y: e.clientY });
    }
    // The keys that ask for a row's menu, as Chromium tells them and the table takes them: the
    // ContextMenu key alone, Shift+F10 with Shift alone.
    _isMenuKey(e) {
        if (!this.rowMenu || e.ctrlKey || e.metaKey || e.altKey)
            return false;
        return (e.key === 'ContextMenu' && !e.shiftKey) || (e.key === 'F10' && e.shiftKey);
    }
    // Chromium on Windows opens its own menu on the ContextMenu key's keyup unless it is spent; the
    // keydown asked for the row's. The browser's event for the key comes before the next task, so the
    // flag that spends it goes then.
    _onKeyup(e) {
        if (e.key !== 'ContextMenu' && e.key !== 'F10')
            return;
        if (this._isMenuKey(e))
            e.preventDefault();
        // Whatever was let go of first, Shift or F10.
        if (this._keyMenu)
            setTimeout(() => (this._keyMenu = false), 0);
    }
    _onKeydown(e) {
        const lines = this._lines();
        if (lines.length === 0)
            return;
        const at = Math.max(0, lines.findIndex((l) => l.item.key === this._focusKey));
        const line = lines[at];
        if (this._isMenuKey(e)) {
            // The focused row's menu, below it, and the browser's own contextmenu for the key let go of.
            e.preventDefault();
            const box = this._rowElement(line.item.key)?.getBoundingClientRect();
            this._keyMenu = true;
            this._menu({ item: line.item, x: box?.left ?? 0, y: box?.bottom ?? 0, keyboard: true });
            return;
        }
        const go = (to) => {
            if (to)
                this._focus(to.item.key);
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
                if (line.item.collapsible !== 'collapsed')
                    break;
                if (!line.open)
                    this._setOpen(line.item, true);
                else if (lines[at + 1]?.parent === line.item.key)
                    go(lines[at + 1]);
                break;
            case 'ArrowLeft':
                if (line.open)
                    this._setOpen(line.item, false);
                else
                    go(lines.find((l) => l.item.key === line.parent));
                break;
            case 'Enter':
                this._choose(line.item);
                break;
            default:
                return;
        }
        e.preventDefault();
    }
    _onTwisty(e, item) {
        // The twisty opens and closes, and chooses nothing.
        e.stopPropagation();
        this._focusKey = item.key;
        this._setOpen(item, !this._open.has(item.key));
    }
    _icon(item) {
        if (item.kind === 'notice') {
            return html `<svg class="info" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.3a5.7 5.7 0 1 1 0 11.4A5.7 5.7 0 0 1 8 2.3zM7.3 7h1.4v4.5H7.3V7zM8 4.3a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z"/></svg>`;
        }
        if (item.kind === 'missing') {
            return html `<svg class="warning" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 1.5a.7.7 0 0 0-1.2 0L.6 13.6a.7.7 0 0 0 .6 1h13.6a.7.7 0 0 0 .6-1L8.6 1.5zM7.3 5.5h1.4l-.2 5H7.5l-.2-5zM8 11.5a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/></svg>`;
        }
        return item.icon ? html `<dex-icon .iconId=${item.icon} size="16"></dex-icon>` : nothing;
    }
    // The row's one badge: the index's own mark (a cycle before unsaved changes), else the tabs'
    // unsaved mark as the same badge, so a row never shows two.
    _badge(item, mark) {
        const health = item.health ?? (mark?.unsaved ? 'modified' : null);
        if (!health || !Object.hasOwn(DECORATIONS, health))
            return nothing;
        const { badge, tooltip } = DECORATIONS[health];
        return html `<span class="badge" title=${tooltip} aria-hidden="true">${badge}</span><span class="sr-only">${tooltip}</span>`;
    }
    _row(line, tabbable) {
        const { item, level, open, loading } = line;
        const twisty = item.collapsible === 'collapsed';
        const mark = item.id !== undefined ? this.marks.get(item.id) : undefined;
        const health = item.health ?? (mark?.unsaved ? 'modified' : null);
        const classes = [
            'row',
            health ? `health-${health}` : '',
            item.kind === 'notice' ? 'notice' : '',
            item.dimmed ? 'dimmed' : '',
            mark?.open ? 'open' : '',
            mark?.active ? 'active' : '',
            mark?.preview ? 'preview' : '',
        ].filter(Boolean);
        return html `
      <div
        class=${classes.join(' ')}
        role="treeitem"
        data-key=${item.key}
        aria-level=${level}
        aria-setsize=${line.setSize}
        aria-posinset=${line.posInSet}
        aria-expanded=${twisty ? String(open) : nothing}
        aria-selected=${String(this.multiSelect ? this.selectedKeys.includes(item.key) : item.key === this.selectedKey)}
        aria-current=${mark?.active ? 'true' : nothing}
        aria-disabled=${item.dimmed ? 'true' : nothing}
        aria-busy=${loading ? 'true' : nothing}
        tabindex=${tabbable ? '0' : '-1'}
        title=${item.tooltip ?? nothing}
        @click=${(e) => this._onClick(e, item)}
        @contextmenu=${(e) => this._onContextMenu(e, item)}
        @focus=${() => (this._focusKey = item.key)}
      >
        <span class="indent" ${styleProps({ width: `${(level - 1) * 16}px` })}></span>
        <span
          class="twisty ${twisty ? '' : 'empty'} ${loading ? 'loading' : ''}"
          aria-hidden="true"
          @click=${twisty ? (e) => this._onTwisty(e, item) : nothing}
          >${twisty ? (open ? '▼' : '▶') : ''}</span
        >
        ${this._icon(item)}
        <span class="label">${item.label}</span>
        ${item.description ? html `<span class="description">${item.description}</span>` : nothing}
        ${item.relation ? html `<span class="description relation">${item.relation}</span>` : nothing}
        ${this._badge(item, mark)}
      </div>
    `;
    }
    render() {
        const lines = this._lines();
        // One row takes the Tab key: the one the keyboard was on, else the selected one, else the first.
        const tabbable = [this._focusKey, this.selectedKey].find((key) => key !== null && lines.some((l) => l.item.key === key)) ??
            lines[0]?.item.key;
        return html `
      <div
        role="tree"
        aria-label=${this.label}
        aria-multiselectable=${this.multiSelect ? 'true' : nothing}
        aria-keyshortcuts=${this.rowMenu ? MENU_KEYS : nothing}
        @keydown=${this._onKeydown}
        @keyup=${this._onKeyup}
        @pointerdown=${() => (this._keyMenu = false)}
        @focusout=${() => (this._keyMenu = false)}
      >
        ${lines.map((line) => this._row(line, line.item.key === tabbable))}
      </div>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "items", void 0);
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "loadChildren", void 0);
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "expandedKeys", void 0);
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "marks", void 0);
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "selectedKey", void 0);
__decorate([
    property({ type: Boolean, attribute: 'row-menu' })
], DexHierarchy.prototype, "rowMenu", void 0);
__decorate([
    property({ type: String })
], DexHierarchy.prototype, "label", void 0);
__decorate([
    property({ type: Boolean, attribute: 'expand-top-level' })
], DexHierarchy.prototype, "expandTopLevel", void 0);
__decorate([
    property({ type: Boolean, attribute: 'multi-select' })
], DexHierarchy.prototype, "multiSelect", void 0);
__decorate([
    property({ attribute: false })
], DexHierarchy.prototype, "selectedKeys", void 0);
__decorate([
    state()
], DexHierarchy.prototype, "_children", void 0);
__decorate([
    state()
], DexHierarchy.prototype, "_focusKey", void 0);
/** Registers the widget as `<dex-hierarchy>`, or under `tag`, and the `<dex-icon>` its rows draw. */
export function defineHierarchy(tag = 'dex-hierarchy') {
    defineIcon();
    defineElement(tag, DexHierarchy);
}
