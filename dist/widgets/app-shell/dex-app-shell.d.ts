import { LitElement } from 'lit';
import { type ShellLayoutState, type ShellSide } from '../../model/shell/shellLayout.js';
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
    anchor: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
/**
 * The frame of an app: a toolbar and a location bar across the top, a
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
export declare class DexAppShell extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The localStorage key the layout is kept under (which view each side shows, which sides are
     * open, and their sizes), read back as each side's views first arrive. Empty, the default,
     * keeps nothing. Attribute `storage-key`.
     */
    storageKey: string;
    private _chosen;
    private _layout;
    private _views;
    private _actions;
    private _toolbarFilled;
    private _dragging;
    private _known;
    private _drag;
    private _box;
    private _sizeObserver;
    private _observer;
    /**
     * Which view each side shows, whether it is open, and its width or height, as drawn. A size the
     * window has no room for is drawn smaller than the one the person chose, and as chosen again
     * once there is room; the size kept is the one chosen. Read-only: the buttons, the separators,
     * showView and toggleView change it.
     */
    get layout(): ShellLayoutState;
    /**
     * Shows the view with this id, opening its side if it was closed: what a command that brings a
     * view forward does. Never closes a side. Sends `dex-shell-view-changed`, and keeps the layout,
     * when that changes anything. A view appended in the same task is one too; an id no view has
     * does nothing.
     */
    showView(view: string): void;
    /**
     * What a press of the view's activity button does: shows it, or closes its side when it is the
     * view shown. Sends `dex-shell-view-changed` and keeps the layout. An id no view has does nothing.
     */
    toggleView(view: string): void;
    /**
     * The box of the activity button of the view or the action with this id, in viewport px, for a
     * popover to open against; null when the shell draws no button for the id.
     */
    anchorOf(id: string): DOMRect | null;
    connectedCallback(): void;
    protected firstUpdated(): void;
    disconnectedCallback(): void;
    private _readChildren;
    private _withViews;
    private _setChosen;
    private _draw;
    private _change;
    private _resize;
    private _readKept;
    private _keep;
    private _sideOf;
    private _sideNow;
    /** The view a side draws now, if it is open. */
    private _shownView;
    private _labelOf;
    private _button;
    private _sendAction;
    private _onKeydown;
    private _focusInto;
    private _onSashKey;
    private _onSashDown;
    private _onSashMove;
    private _onSashUp;
    private _endDrag;
    private _observeSize;
    private _measure;
    private _fitted;
    private _room;
    private _largest;
    render(): import("lit-html").TemplateResult<1>;
    private _activityBar;
    private _viewButton;
    private _sidebar;
    private _bottomPanel;
    private _sash;
}
/**
 * Registers the widget as `<dex-app-shell>`, or under `tag`, and the parts it is given and draws:
 * `<dex-shell-view>`, `<dex-shell-action>` and `<dex-icon>`. The parts first, so the views of a
 * page are upgraded before the shell reads them. The layout's alone: what connectShell builds in it
 * is defined, this with it, by defineShellWidgets().
 */
export declare function defineAppShell(tag?: string): void;
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
    interface HTMLElementEventMap extends AppShellEventMap {
    }
    interface DocumentEventMap extends AppShellEventMap {
    }
    interface WindowEventMap extends AppShellEventMap {
    }
}
