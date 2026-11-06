// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { isMacPlatform } from '../shared/dragMode.js';
import { tabindexFocusRingStyles } from '../shared/focus.styles.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
import { styleProps } from '../shared/styleProps.js';
import { chordLabel, matchesChord, parseChord, type Chord } from '../../model/shell/chords.js';
import {
  SIDE_MIN,
  initialLayout,
  keepLayoutOver,
  resizeSide,
  showView as withViewShown,
  toggleView as withViewToggled,
  type ShellLayoutState,
  type ShellSide,
  type SideState,
} from '../../model/shell/shellLayout.js';
import { DexShellAction, DexShellView, defineShellAction, defineShellView } from './dex-shell-view.js';

/** What `dex-shell-view-changed` carries: a side as it is after a view was shown, or the side opened or closed. */
export interface ShellViewChangedDetail {
  /** The side that changed. */
  side: ShellSide;
  /** The view it shows, by id: kept while the side is closed, so opening it shows the same view. */
  view: string | null;
  /** Whether the side is open. */
  open: boolean;
}

/** What `dex-shell-action` carries: the action pressed, and where its button is. */
export interface ShellActionDetail {
  /** The action's id: its `<dex-shell-action>`'s `action`. */
  actionId: string;
  /** The button's box in viewport px (getBoundingClientRect's), for a popover to open against. */
  anchor: { x: number; y: number; width: number; height: number };
}

const SIDES: readonly ShellSide[] = ['left', 'right', 'bottom'];
const SIDEBARS = ['left', 'right'] as const;

/** How far an arrow key moves a separator, in px. */
const KEY_STEP = 16;

// The fixed sizes the stylesheet draws, in px, written there from these. The room a side has is
// counted from them and the main area's box, so it can be counted for a layout not drawn yet: a
// side about to open is fitted before it is drawn, and never overflows the window for a frame.
/** An activity bar: 36 px of buttons and the 1 px line beside them. */
const ACTIVITY_WIDTH = 37;
/** A separator, across its side's axis. */
const SASH_WIDTH = 4;
/** The status bar, its top line included. */
const STATUS_HEIGHT = 28;

/**
 * The attributes of a child the shell draws from (a view's and an action's each reflect their
 * property), and the slot that says a toolbar is there: a change to one is read again.
 */
const CHILD_ATTRIBUTES = ['side', 'view', 'label', 'icon', 'shortcut', 'action', 'slot'];

type Views = Record<ShellSide, DexShellView[]>;
type Actions = Record<'left' | 'right', DexShellAction[]>;

/** A pointer drag of a separator: the side, the pointer, where it started, and the room measured then. */
interface Drag {
  side: ShellSide;
  pointerId: number;
  from: number;
  size: number;
  room: number;
}

/**
 * The frame of an app, after the prototype's: a toolbar and a location bar across the top, a
 * sidebar on each side with an activity bar beyond it, the documents in the center with a bottom
 * panel under them, and a status bar at the foot of the center. The page fills it: its toolbar,
 * location bar and status text as children in the `toolbar`, `location` and `status` slots, its
 * documents as plain children, and the sides from `<dex-shell-view>` children, each a view with
 * an activity button, and `<dex-shell-action>` children, buttons it answers itself.
 *
 * Each side shows one of its views and hides the rest. A press of a view's activity button, its
 * shortcut, or toggleView shows the view, or closes its side when the view is the one shown; a
 * view its shortcut shows takes the focus, and the focus in a view that is hidden goes to the
 * view's button. A side's separator resizes it, dragged or by the arrow keys, and every side is
 * drawn no larger than the window leaves room for. A side with no views has no sidebar, and an
 * activity bar only for its actions. A change of the view shown, or of a side open or closed,
 * sends `dex-shell-view-changed`; a press of an action sends `dex-shell-action`. With a
 * `storage-key` the layout the person chose is kept in localStorage and read back by the next
 * shell with that key.
 *
 * @tagname dex-app-shell
 */
export class DexAppShell extends LitElement {
  static override styles = [hiddenStyles, tabindexFocusRingStyles, highContrastStyles, css`
    :host {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
      height: 100%;
      overflow: hidden;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
      background: var(--dex-bg-tertiary, #f5f5f5);
    }

    /* Placed by row, so an empty row is an empty track and the main area stays in the third. */
    .toolbar-row {
      grid-row: 1;
      background: var(--dex-bg-toolbar, #fff);
    }

    /* The line under the toolbar only under a toolbar: a shell without one starts at its location bar. */
    .toolbar-row.filled {
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    /* The location bar draws its own band (32 px on --dex-bg-secondary) and the line under it. */
    .location-row {
      grid-row: 2;
    }

    .main {
      grid-row: 3;
      display: flex;
      min-height: 0;
      overflow: hidden;
    }

    /* --- Activity bars --- */
    /* 36 px of buttons and the line beside them, in its width: the room a resize leaves is counted
       from these numbers before the bar is drawn. */
    .activity {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      flex: 0 0 ${ACTIVITY_WIDTH}px;
      width: ${ACTIVITY_WIDTH}px;
      background: var(--dex-bg-activity-bar, #f0f0f0);
    }

    .activity.left {
      border-right: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .activity.right {
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .spacer {
      flex: 1;
    }

    /* The ink is for a glyph a page draws in place of an icon; the icons are images. */
    button {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-sizing: border-box;
      width: 36px;
      height: 36px;
      margin: 0;
      padding: 0;
      background: none;
      border: none;
      color: var(--dex-activity-fg, #616161);
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.15s;
    }

    /* The shown view's mark is a bar on the button's edge against the window's, as the prototype
       and VS Code draw it; on the status bar, its top edge, against the documents. Transparent on
       every other button, so pressing one does not move its icon. */
    .activity.left button {
      border-left: 2px solid transparent;
    }

    .activity.right button {
      border-right: 2px solid transparent;
    }

    button:hover,
    button[aria-pressed='true'] {
      opacity: 1;
    }

    .activity.left button[aria-pressed='true'] {
      border-left-color: var(--dex-activity-active, #0078d4);
    }

    .activity.right button[aria-pressed='true'] {
      border-right-color: var(--dex-activity-active, #0078d4);
    }

    /* Inset: an outward ring on a button at the window's edge would be cut off by it. */
    button:focus-visible {
      outline: none;
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
      opacity: 1;
    }

    /* --- Sidebars and the bottom panel --- */
    .side {
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
      box-sizing: border-box;
      min-width: 0;
      overflow: hidden;
      background: var(--dex-bg-primary, #fff);
    }

    .side.left {
      border-right: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .side.right {
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .header {
      flex-shrink: 0;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--dex-color-text-secondary, #555);
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* The view shown fills it (a <dex-shell-view> is a column that grows); the others are hidden. */
    .content {
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .center {
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    .docs {
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    slot:not([name])::slotted(*) {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    /* It gives way before the documents do in a window too short for both, as the prototype's. */
    .bottom {
      flex: 0 1 auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--dex-bg-primary, #fff);
      border-top: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    .bottom .header {
      padding: 4px 8px;
      background: var(--dex-bg-secondary, #f8f8f8);
    }

    /* --- Separators --- */
    .resizer {
      flex: 0 0 ${SASH_WIDTH}px;
      background: transparent;
      touch-action: none;
      z-index: 10;
    }

    .resizer.v {
      cursor: col-resize;
    }

    .resizer.h {
      cursor: row-resize;
    }

    .resizer:hover,
    .resizer.dragging {
      background: var(--dex-shell-resizer-hover, #0078d4);
    }

    /* --- Status bar --- */
    .status-bar {
      display: flex;
      align-items: stretch;
      flex: 0 0 ${STATUS_HEIGHT}px;
      box-sizing: border-box;
      height: ${STATUS_HEIGHT}px;
      background: var(--dex-bg-activity-bar, #f0f0f0);
      border-top: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .status-bar button {
      width: 28px;
      height: auto;
      border-top: 2px solid transparent;
    }

    .status-bar button[aria-pressed='true'] {
      border-top-color: var(--dex-activity-active, #0078d4);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
      padding: 0 12px;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      button {
        transition: none;
      }
    }

    /* Forced colours paint over the borders that mark the shown view, and dimming a button makes
       it hard to read on a high-contrast scheme: the mark becomes an outline, the buttons full ink. */
    @media (forced-colors: active) {
      button {
        opacity: 1;
      }

      button[aria-pressed='true'] {
        outline: 2px solid Highlight;
        outline-offset: -2px;
      }

      .resizer:hover,
      .resizer.dragging {
        forced-color-adjust: none;
        background: Highlight;
      }
    }
  `];

  /**
   * The localStorage key the layout is kept under (which view each side shows, which sides are
   * open, and their sizes), read back as each side's views first arrive. Empty, the default,
   * keeps nothing. Attribute `storage-key`.
   */
  @property({ type: String, attribute: 'storage-key' }) storageKey = '';

  // Two layouts. The chosen one is the person's: the views shown, the sides open, and the sizes
  // they set (read back from what was kept, or left by a drag or an arrow key); it is what is
  // kept. The drawn one is the chosen one fitted to the room there is now, and is what renders: a
  // size kept on a large monitor is drawn smaller in a small window, and as chosen again once
  // there is room. The two differ in sizes only.
  private _chosen: ShellLayoutState = initialLayout({ left: [], right: [], bottom: [] }, null);
  @state() private _layout: ShellLayoutState = this._chosen;
  // The children the shell draws, by side, in the order of the page.
  @state() private _views: Views = { left: [], right: [], bottom: [] };
  @state() private _actions: Actions = { left: [], right: [] };
  @state() private _toolbarFilled = false;
  @state() private _dragging: ShellSide | null = null;
  // The sides whose views the shell has seen. What was kept for a side is read once, as its views
  // arrive, which is either at once (views written in the page) or later (views a script adds).
  private _known = new Set<ShellSide>();
  private _drag: Drag | null = null;
  // The main area's box when last measured, or null while the shell is not laid out.
  private _box: { width: number; height: number } | null = null;
  private _sizeObserver: ResizeObserver | null = null;
  // The children are read from the light DOM, not from a slotchange: a closed side, and a side
  // with no views, draws no slot, and a view added to one would never be heard of. Subtree, for
  // the children's attributes; a change further down is a document's own and is not looked at.
  private _observer = new MutationObserver((records) => {
    const mine = records.some((r) => (r.type === 'childList' ? r.target === this : r.target.parentNode === this));
    if (mine) this._readChildren();
  });

  /**
   * Which view each side shows, whether it is open, and its width or height, as drawn. A size the
   * window has no room for is drawn smaller than the one the person chose, and as chosen again
   * once there is room; the size kept is the one chosen. Read-only: the buttons, the separators,
   * showView and toggleView change it.
   */
  get layout(): ShellLayoutState {
    return this._layout;
  }

  /**
   * Shows the view with this id, opening its side if it was closed: what a command that brings a
   * view forward does. Never closes a side. Sends `dex-shell-view-changed`, and keeps the layout,
   * when that changes anything. An id no view has does nothing.
   */
  showView(view: string): void {
    const side = this._sideOf(view);
    if (side) this._change(side, withViewShown(this._chosen, side, view));
  }

  /**
   * What a press of the view's activity button does: shows it, or closes its side when it is the
   * view shown. Sends `dex-shell-view-changed` and keeps the layout. An id no view has does nothing.
   */
  toggleView(view: string): void {
    const side = this._sideOf(view);
    if (side) this._change(side, withViewToggled(this._chosen, side, view));
  }

  /**
   * The box of the activity button of the view or the action with this id, in viewport px, for a
   * popover to open against; null when the shell draws no button for the id.
   */
  anchorOf(id: string): DOMRect | null {
    return (this._button('view', id) ?? this._button('action', id))?.getBoundingClientRect() ?? null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._readChildren();
    this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: CHILD_ATTRIBUTES });
    // On the window, bubbling: a view's chord works wherever the focus is, and a widget that takes
    // the same keys for itself (a field, a table) prevents the default and keeps them.
    window.addEventListener('keydown', this._onKeydown);
    // Back on the page after a removal: the part it observes is drawn already.
    if (this.hasUpdated) this._observeSize();
  }

  protected override firstUpdated(): void {
    this._observeSize();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer.disconnect();
    this._sizeObserver?.disconnect();
    this._sizeObserver = null;
    window.removeEventListener('keydown', this._onKeydown);
    // A drag the removal cut short ends where it got to, kept as a drag's end is.
    if (this._drag) {
      this._endDrag();
      this._keep();
    }
  }

  // Reads the views and actions from the children, in the order of the page, fits the layout to
  // them, and notes whether a toolbar is there. A view or an action with no id, a side that is
  // not one, or an id another view (or another action) has is not drawn: an id names one button.
  private _readChildren(): void {
    const views: Views = { left: [], right: [], bottom: [] };
    const actions: Actions = { left: [], right: [] };
    const viewIds = new Set<string>();
    const actionIds = new Set<string>();
    for (const child of this.children) {
      if (child instanceof DexShellView) {
        if (!SIDES.includes(child.side) || !child.view || viewIds.has(child.view)) continue;
        viewIds.add(child.view);
        views[child.side].push(child);
      } else if (child instanceof DexShellAction) {
        if ((child.side !== 'left' && child.side !== 'right') || !child.action || actionIds.has(child.action)) continue;
        actionIds.add(child.action);
        actions[child.side].push(child);
      }
    }
    this._views = views;
    this._actions = actions;
    this._toolbarFilled = [...this.children].some((child) => child.slot === 'toolbar');
    this._setChosen(this._withViews(views));
  }

  // The chosen layout for these views. A side whose views are new to the shell takes what was
  // kept for it, or the default (its first view, open); a side it knew keeps its view, or falls
  // back to its first when that one has gone, open or closed as it was; a side left with none
  // shows none. The page changed its views, not the person the layout: nothing is sent or kept.
  private _withViews(views: Views): ShellLayoutState {
    const ids = { left: views.left.map((v) => v.view), right: views.right.map((v) => v.view), bottom: views.bottom.map((v) => v.view) };
    const arriving = SIDES.filter((side) => ids[side].length > 0 && !this._known.has(side));
    const kept = arriving.length > 0 ? initialLayout(ids, this._readKept()) : null;
    const next = initialLayout(ids, this._chosen);
    for (const side of SIDES) {
      if (kept && arriving.includes(side)) next[side] = kept[side];
      if (ids[side].length > 0) this._known.add(side);
      else this._known.delete(side);
    }
    return sameLayout(next, this._chosen) ? this._chosen : next;
  }

  // The one way the chosen layout changes. The drawn one is fitted from it at once, before
  // anything renders, so a side that opens never overflows the window for a frame; then the views'
  // `hidden` is made to agree, by the time an event is sent. A drag whose side this closes, or
  // leaves with no view, ends here: its separator is gone and the pointer's capture with it, so
  // no pointerup will come to end it.
  private _setChosen(next: ShellLayoutState): void {
    this._chosen = next;
    // Not measured again during a drag: its pointerdown measured the main area, whose box no
    // change of the layout moves, and a measure on every move would lay the page out on each.
    // A resize of the window in the middle of it is the size observer's, which measures.
    this._draw(this._drag === null);
    if (this._drag && !isOpen(next[this._drag.side])) this._endDrag();
    const shown = new Set<Element>();
    for (const side of SIDES) {
      const { view, open } = next[side];
      const drawn = open ? this._views[side].find((v) => v.view === view) : undefined;
      if (drawn) shown.add(drawn);
    }
    for (const child of this.children) {
      if (!(child instanceof DexShellView)) continue;
      const hidden = !shown.has(child);
      if (child.hidden !== hidden) child.hidden = hidden;
    }
  }

  // The drawn layout: the chosen one fitted to the main area, measured now unless `measure` is
  // false. The same object while nothing drawn changes, so a change that changes nothing drawn
  // renders nothing.
  private _draw(measure: boolean): void {
    if (measure) this._measure();
    const drawn = this._fitted(this._chosen);
    if (!sameLayout(drawn, this._layout)) this._layout = drawn;
  }

  // A change the person made (a button, a chord, a method): drawn, kept, and said. When it hides
  // the view the focus was in, the focus goes to that view's activity button: a hidden view drops
  // it, and the page would get it, where a keyboard has nothing to go on from.
  private _change(side: ShellSide, next: ShellLayoutState): void {
    if (next === this._chosen) return;
    const was = this._shownView(side);
    const hadFocus = was !== undefined && holdsFocus(was);
    this._setChosen(next);
    this._keep();
    if (was && hadFocus && was.hidden) this._button('view', was.view)?.focus();
    const { view, open } = next[side];
    this.dispatchEvent(new CustomEvent<ShellViewChangedDetail>('dex-shell-view-changed', {
      detail: { side, view, open },
      bubbles: true,
      composed: true,
    }));
  }

  // A resize by the person, held by the layout's rules to the side's minimum and the room it
  // leaves the center. What is drawn decides: a step the room does not allow changes nothing, and
  // does not turn a size kept from a larger window into this window's. Says nothing (no view
  // changed); whether anything changed, for the caller to keep it.
  private _resize(side: ShellSide, size: number, room: number): boolean {
    const drawn = resizeSide(this._layout, side, size, room);
    if (drawn === this._layout) return false;
    this._setChosen({ ...this._chosen, [side]: { ...this._chosen[side], size: drawn[side].size } });
    return true;
  }

  private _readKept(): string | null {
    if (!this.storageKey) return null;
    // A page may have no storage at all (an opaque origin, storage turned off), which throws.
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  // The chosen layout, for the sides that have views; what was kept for the others stays
  // (keepLayoutOver says why).
  private _keep(): void {
    if (!this.storageKey) return;
    try {
      const sides = SIDES.filter((side) => this._views[side].length > 0);
      localStorage.setItem(this.storageKey, keepLayoutOver(this._chosen, localStorage.getItem(this.storageKey), sides));
    } catch {
      // No storage, or none left: the layout holds for this page and is not kept.
    }
  }

  private _sideOf(view: string): ShellSide | undefined {
    return SIDES.find((side) => this._views[side].some((v) => v.view === view));
  }

  /** The view a side draws now, if it is open. */
  private _shownView(side: ShellSide): DexShellView | undefined {
    const { view, open } = this._layout[side];
    return open ? this._views[side].find((v) => v.view === view) : undefined;
  }

  private _labelOf(side: ShellSide): string {
    const { view } = this._layout[side];
    const shown = this._views[side].find((v) => v.view === view);
    return shown ? shown.label || shown.view : '';
  }

  private _button(kind: 'view' | 'action', id: string): HTMLButtonElement | undefined {
    return [...this.renderRoot.querySelectorAll<HTMLButtonElement>(`button[data-${kind}]`)].find((b) => b.dataset[kind] === id);
  }

  private _sendAction(actionId: string): void {
    const box = this._button('action', actionId)?.getBoundingClientRect();
    this.dispatchEvent(new CustomEvent<ShellActionDetail>('dex-shell-action', {
      detail: { actionId, anchor: { x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 0, height: box?.height ?? 0 } },
      bubbles: true,
      composed: true,
    }));
  }

  // A shortcut works wherever the focus is, but not a press another handler took (it prevented
  // the default), a held chord's repeats (which would flicker a side open and shut), or a key
  // that is composing text in an input method. A view shown by its shortcut takes the focus, as
  // VS Code's views do: the chord is how a keyboard gets to a view.
  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.repeat || e.isComposing) return;
    const mac = onMac();
    for (const side of SIDES) {
      const view = this._views[side].find((v) => pressed(v.shortcut, e, mac));
      if (view) {
        e.preventDefault();
        this.toggleView(view.view);
        if (!view.hidden) void this._focusInto(view);
        return;
      }
    }
    const action = [...this._actions.left, ...this._actions.right].find((a) => pressed(a.shortcut, e, mac));
    if (action) {
      e.preventDefault();
      this._sendAction(action.action);
    }
  };

  // The focus into a view just shown: its first control, else the view itself (which takes the
  // focus from a script, not from Tab). After the render, which is what draws the view's side.
  private async _focusInto(view: DexShellView): Promise<void> {
    await this.updateComplete;
    if (view.hidden || !view.isConnected) return;
    const control = firstFocusable(view);
    control?.focus();
    if (!control || !holdsFocus(view)) view.focus();
  }

  // An arrow key moves the separator a step, the way it points: the left side grows to the right,
  // the right side to the left, and the bottom panel upwards. Each step is kept.
  private _onSashKey(side: ShellSide, e: KeyboardEvent): void {
    const [grow, shrink] = side === 'left' ? ['ArrowRight', 'ArrowLeft'] : side === 'right' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const step = e.key === grow ? KEY_STEP : e.key === shrink ? -KEY_STEP : 0;
    if (step === 0) return;
    e.preventDefault();
    this._measure();
    if (this._resize(side, this._layout[side].size + step, this._room(side, this._layout))) this._keep();
  }

  // The pointer is captured, so the drag goes on over the documents and out of the window, and
  // the room is measured once: the side and the center share it whatever the side's size.
  private _onSashDown(side: ShellSide, e: PointerEvent): void {
    if (e.button !== 0 || this._drag) return;
    // No text selection, and no focus left on the separator by a drag.
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this._measure();
    const from = side === 'bottom' ? e.clientY : e.clientX;
    this._drag = { side, pointerId: e.pointerId, from, size: this._layout[side].size, room: this._room(side, this._layout) };
    this._dragging = side;
  }

  // Only from the drag's own separator: without a capture (one a browser refused, or a page with
  // none), a pointer that crosses another separator would resize the drag's side from it.
  private _onSashMove(e: PointerEvent): void {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId || (e.currentTarget as HTMLElement | null)?.dataset.side !== drag.side) return;
    const at = drag.side === 'bottom' ? e.clientY : e.clientX;
    this._resize(drag.side, drag.size + (drag.side === 'left' ? at - drag.from : drag.from - at), drag.room);
  }

  // The end of a drag, however it ends (the button let go, the pointer lost): the size is kept once.
  private _onSashUp(e: PointerEvent): void {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;
    this._endDrag();
    this._keep();
  }

  private _endDrag(): void {
    this._drag = null;
    this._dragging = null;
  }

  // The main area. Its box is the room the sides and the documents share, and it changes with the
  // window and the rows above it, never with the layout, so a fit to it does not report again
  // (no ResizeObserver loop). The first report comes once the shell is laid out, which is when a
  // size kept on a larger screen is first fitted to this one; the shell's own changes are fitted
  // as they are made.
  private _observeSize(): void {
    this._sizeObserver?.disconnect();
    this._sizeObserver = null;
    const main = this.renderRoot.querySelector('.main');
    if (!main) return;
    this._sizeObserver = new ResizeObserver(() => {
      const was = this._box;
      this._draw(true);
      // A new box that changes no drawn size still changes the largest size each separator
      // states (aria-valuemax), which only a render writes.
      if (was?.width !== this._box?.width || was?.height !== this._box?.height) this.requestUpdate();
    });
    this._sizeObserver.observe(main);
  }

  // Keeps the main area's box for the room a side has. Null while the shell is not laid out
  // (display: none, before its first render, or no layout engine at all), which sets no largest
  // size. Its size never depends on the layout, so it holds for the next layout as for this one.
  private _measure(): void {
    const box = this.renderRoot.querySelector<HTMLElement>('.main')?.getBoundingClientRect();
    this._box = box && (box.width > 0 || box.height > 0) ? { width: box.width, height: box.height } : null;
  }

  // The chosen layout fitted to the room: each open side in turn held to the room the sides
  // before it left, as a resize of it to its own size would hold it. A size is kept field by
  // field and clamped only to the side's minimum on the way back (the layout rules cannot know
  // the window), so a sidebar widened on a large monitor would otherwise come back pushing the
  // documents off a small window; a side opened beside another can do the same.
  private _fitted(chosen: ShellLayoutState): ShellLayoutState {
    let next = chosen;
    for (const side of SIDES) {
      if (isOpen(next[side])) next = resizeSide(next, side, next[side].size, this._room(side, next));
    }
    return next;
  }

  // The px a side and the center share along the side's axis in `layout`, from the main area's
  // box and the fixed sizes the stylesheet draws, so a layout not drawn yet has its room too. For
  // a sidebar: the main area's width less the activity bars, the open sidebars' separators and
  // the other sidebar. For the bottom panel: its height less the status bar and the separator.
  // Not a number while the shell is not laid out.
  private _room(side: ShellSide, layout: ShellLayoutState): number {
    const box = this._box;
    if (!box) return NaN;
    if (side === 'bottom') return box.height - STATUS_HEIGHT - SASH_WIDTH;
    const bars = SIDEBARS.filter((s) => this._views[s].length > 0 || this._actions[s].length > 0).length;
    const sashes = SIDEBARS.filter((s) => isOpen(layout[s])).length;
    const other = layout[side === 'left' ? 'right' : 'left'];
    return box.width - bars * ACTIVITY_WIDTH - sashes * SASH_WIDTH - (isOpen(other) ? other.size : 0);
  }

  // The largest size the separator can take the side to, as last measured, for a screen reader.
  private _largest(side: ShellSide): number | undefined {
    const room = this._room(side, this._layout);
    return Number.isFinite(room) ? resizeSide(this._layout, side, Number.MAX_SAFE_INTEGER, room)[side].size : undefined;
  }

  override render() {
    const mac = onMac();
    return html`
      <div class="toolbar-row ${this._toolbarFilled ? 'filled' : ''}" role=${this._toolbarFilled ? 'banner' : nothing}>
        <slot name="toolbar"></slot>
      </div>
      <div class="location-row"><slot name="location"></slot></div>
      <div class="main">
        ${this._activityBar('left', mac)} ${this._sidebar('left')}
        <div class="center">
          <main class="docs" aria-label="Editor"><slot></slot></main>
          ${this._bottomPanel()}
          <footer class="status-bar" aria-label="Status bar">
            ${repeat(this._views.bottom, (v) => v.view, (v) => this._viewButton('bottom', v, mac))}
            <div class="status"><slot name="status"></slot></div>
          </footer>
        </div>
        ${this._sidebar('right')} ${this._activityBar('right', mac)}
      </div>
    `;
  }

  private _activityBar(side: 'left' | 'right', mac: boolean) {
    const views = this._views[side];
    const actions = this._actions[side];
    if (views.length === 0 && actions.length === 0) return nothing;
    return html`
      <nav class="activity ${side}" aria-label=${side === 'left' ? 'Left activity bar' : 'Right activity bar'}>
        ${repeat(views, (v) => v.view, (v) => this._viewButton(side, v, mac))}
        <div class="spacer"></div>
        ${repeat(actions, (a) => a.action, (a) => html`
          <button
            type="button"
            data-action=${a.action}
            title=${tooltip(a.label || a.action, a.shortcut, mac)}
            aria-label=${a.label || a.action}
            @click=${() => this._sendAction(a.action)}
          >
            <dex-icon .iconId=${a.icon} .size=${20}></dex-icon>
          </button>
        `)}
      </nav>
    `;
  }

  private _viewButton(side: ShellSide, v: DexShellView, mac: boolean) {
    const { view, open } = this._layout[side];
    const label = v.label || v.view;
    return html`
      <button
        type="button"
        data-view=${v.view}
        aria-pressed=${open && view === v.view ? 'true' : 'false'}
        title=${tooltip(label, v.shortcut, mac)}
        aria-label=${label}
        @click=${() => this.toggleView(v.view)}
      >
        <dex-icon .iconId=${v.icon} .size=${side === 'bottom' ? 16 : 20}></dex-icon>
      </button>
    `;
  }

  private _sidebar(side: 'left' | 'right') {
    const { view, open, size } = this._layout[side];
    if (!open || view === null) return nothing;
    const label = this._labelOf(side);
    const aside = html`
      <aside class="side ${side}" aria-label=${label} ${styleProps({ width: `${size}px` })}>
        <div class="header">${label}</div>
        <div class="content"><slot name=${side}></slot></div>
      </aside>
    `;
    const sash = this._sash(side, label, size);
    return side === 'left' ? html`${aside}${sash}` : html`${sash}${aside}`;
  }

  private _bottomPanel() {
    const { view, open, size } = this._layout.bottom;
    if (!open || view === null) return nothing;
    const label = this._labelOf('bottom');
    return html`
      ${this._sash('bottom', label, size)}
      <section class="bottom" aria-label=${label} ${styleProps({ height: `${size}px` })}>
        <div class="header">${label}</div>
        <div class="content"><slot name="bottom"></slot></div>
      </section>
    `;
  }

  // A separator a keyboard reaches, as WAI-ARIA's window splitter: its value is the side's size.
  private _sash(side: ShellSide, label: string, size: number) {
    const vertical = side !== 'bottom';
    return html`
      <div
        class="resizer ${vertical ? 'v' : 'h'} ${this._dragging === side ? 'dragging' : ''}"
        data-side=${side}
        role="separator"
        tabindex="0"
        aria-orientation=${vertical ? 'vertical' : 'horizontal'}
        aria-label=${`Resize ${label}`}
        aria-valuenow=${size}
        aria-valuemin=${SIDE_MIN[side]}
        aria-valuemax=${this._largest(side) ?? nothing}
        aria-valuetext=${`${size} pixels`}
        @keydown=${(e: KeyboardEvent) => this._onSashKey(side, e)}
        @pointerdown=${(e: PointerEvent) => this._onSashDown(side, e)}
        @pointermove=${this._onSashMove}
        @pointerup=${this._onSashUp}
        @pointercancel=${this._onSashUp}
        @lostpointercapture=${this._onSashUp}
      ></div>
    `;
  }
}

/** Whether the page runs on macOS, where Mod is Command: read at each use, as the platform is the page's. */
function onMac(): boolean {
  return isMacPlatform(navigator.platform || navigator.userAgent || '');
}

/** A shortcut's chord, or null for none, or for text that is not one: a page's typo is no shortcut, not a broken shell. */
function chordOf(text: string): Chord | null {
  if (!text) return null;
  try {
    return parseChord(text);
  } catch {
    return null;
  }
}

function pressed(shortcut: string, e: KeyboardEvent, mac: boolean): boolean {
  const chord = chordOf(shortcut);
  return chord !== null && matchesChord(chord, e, mac);
}

/** A button's tooltip: its label, and its chord in the platform's words. */
function tooltip(label: string, shortcut: string, mac: boolean): string {
  const chord = chordOf(shortcut);
  return chord ? `${label} (${chordLabel(chord, mac)})` : label;
}

/** Whether a side is drawn open: open, and on a view (a side with no views is never open). */
function isOpen(side: SideState): boolean {
  return side.open && side.view !== null;
}

function sameLayout(a: ShellLayoutState, b: ShellLayoutState): boolean {
  return SIDES.every((side) => a[side].view === b[side].view && a[side].open === b[side].open && a[side].size === b[side].size);
}

/** Whether the focus is in `el`, however deep in shadow roots the focused element is. */
function holdsFocus(el: Element): boolean {
  for (let at: Element | null = document.activeElement; at; at = at.shadowRoot?.activeElement ?? null) {
    if (el.contains(at)) return true;
  }
  return false;
}

/**
 * The first element under `root` that Tab stops on, depth first: the shadow tree of each element,
 * then its own children, which is the order a shadow tree draws them in when it slots them at its
 * end, as a view's does. Nothing under a hidden element, and no disabled control.
 */
function firstFocusable(root: Element): HTMLElement | null {
  for (const child of [...(root.shadowRoot?.children ?? []), ...root.children]) {
    if (!(child instanceof HTMLElement) || child.hidden) continue;
    if (child.tabIndex >= 0 && !(child as { disabled?: boolean }).disabled) return child;
    const inner = firstFocusable(child);
    if (inner) return inner;
  }
  return null;
}

/**
 * Registers the widget as `<dex-app-shell>`, or under `tag`, and the parts it is given and draws:
 * `<dex-shell-view>`, `<dex-shell-action>` and `<dex-icon>`. The parts first, so the views of a
 * page are upgraded before the shell reads them. The parts connectShell builds the shell from are
 * defined here too as they join the entry.
 */
export function defineAppShell(tag = 'dex-app-shell'): void {
  defineIcon();
  defineShellView();
  defineShellAction();
  defineElement(tag, DexAppShell);
}

/**
 * The events `<dex-app-shell>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface AppShellEventMap {
  /**
   * A side shows another view, or was opened or closed: by its activity button, its chord, or
   * showView / toggleView. The side as it is now. Not sent for a resize, nor when the page's own
   * change of the views moves the layout.
   */
  'dex-shell-view-changed': CustomEvent<ShellViewChangedDetail>;
  /** An action's button, or its chord, was pressed: open what it stands for, against `anchor`. */
  'dex-shell-action': CustomEvent<ShellActionDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-app-shell': DexAppShell;
  }
  interface HTMLElementEventMap extends AppShellEventMap {}
  interface DocumentEventMap extends AppShellEventMap {}
  interface WindowEventMap extends AppShellEventMap {}
}
