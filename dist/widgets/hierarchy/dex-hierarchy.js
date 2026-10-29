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
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { styleProps } from '../shared/styleProps.js';
import { DECORATIONS } from '../../model/hierarchy/health.js';
/**
 * A folder's hierarchy as a tree: each project and folder, the files in it, and under each file
 * the files it references, opened a level at a time. The rows are HierarchyItems
 * (`data-explorer-view/model`'s FolderHierarchy makes them); the rows under one are asked of
 * `loadChildren` as it is first opened, and asked again when `items` is replaced. A row reads its
 * file's name and kind, an unresolved reference a warning, and a file's mark a badge (a circular
 * reference, unsaved changes).
 *
 * A click or Enter chooses a row: it is selected, `dex-hierarchy-select` says which file it opens,
 * and a row with rows under it opens or closes. The arrow keys move through the rows (Right opens
 * a row or goes into it, Left closes it or goes to its parent), Home and End go to the first and
 * the last. connectHierarchy wires one to a FolderHierarchy.
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
        /** The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing. */
        this.selectedKey = null;
        /** What a screen reader calls the tree. Default `Files`. Attribute `label`. */
        this.label = 'Files';
        // The rows under each open row, by its key, for the items there are now; and those for the
        // items there were, drawn while the new ones are read, so an open row does not blink shut.
        this._children = new Map();
        this._previous = new Map();
        this._asked = new Set();
        this._generation = 0;
        this._focusKey = null;
        this._focusPending = false;
        this._open = new Set();
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
    .warning {
      flex-shrink: 0;
    }

    .warning {
      width: 16px;
      height: 16px;
      fill: var(--dex-color-warning, #d83b01);
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

      .warning {
        fill: CanvasText;
      }
    }
  `]; }
    willUpdate(changed) {
        if (changed.has('expandedKeys'))
            this._open = new Set(this.expandedKeys);
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
    }
    // A click or Enter: the row is selected, says so, and opens or closes.
    _choose(item) {
        this.selectedKey = item.key;
        this._focusKey = item.key;
        this.dispatchEvent(new CustomEvent('dex-hierarchy-select', {
            detail: { uri: item.id ?? null, key: item.key, item },
            bubbles: true,
            composed: true,
        }));
        this._setOpen(item, !this._open.has(item.key));
    }
    _onKeydown(e) {
        const lines = this._lines();
        if (lines.length === 0)
            return;
        const at = Math.max(0, lines.findIndex((l) => l.item.key === this._focusKey));
        const line = lines[at];
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
        if (item.kind === 'missing') {
            return html `<svg class="warning" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 1.5a.7.7 0 0 0-1.2 0L.6 13.6a.7.7 0 0 0 .6 1h13.6a.7.7 0 0 0 .6-1L8.6 1.5zM7.3 5.5h1.4l-.2 5H7.5l-.2-5zM8 11.5a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/></svg>`;
        }
        return item.icon ? html `<dex-icon .iconId=${item.icon} size="16"></dex-icon>` : nothing;
    }
    _badge(item) {
        const health = item.health;
        if (!health || !Object.hasOwn(DECORATIONS, health))
            return nothing;
        const { badge, tooltip } = DECORATIONS[health];
        return html `<span class="badge" title=${tooltip} aria-hidden="true">${badge}</span><span class="sr-only">${tooltip}</span>`;
    }
    _row(line, tabbable) {
        const { item, level, open, loading } = line;
        const twisty = item.collapsible === 'collapsed';
        return html `
      <div
        class="row ${item.health ? `health-${item.health}` : ''}"
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
          @click=${twisty ? (e) => this._onTwisty(e, item) : nothing}
          >${twisty ? (open ? '▼' : '▶') : ''}</span
        >
        ${this._icon(item)}
        <span class="label">${item.label}</span>
        ${item.description ? html `<span class="description">${item.description}</span>` : nothing}
        ${this._badge(item)}
      </div>
    `;
    }
    render() {
        const lines = this._lines();
        // One row takes the Tab key: the one the keyboard was on, else the selected one, else the first.
        const tabbable = [this._focusKey, this.selectedKey].find((key) => key !== null && lines.some((l) => l.item.key === key)) ??
            lines[0]?.item.key;
        return html `
      <div role="tree" aria-label=${this.label} @keydown=${this._onKeydown}>
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
], DexHierarchy.prototype, "selectedKey", void 0);
__decorate([
    property({ type: String })
], DexHierarchy.prototype, "label", void 0);
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
