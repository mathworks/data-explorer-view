import { LitElement, type PropertyValues } from 'lit';
import type { ShellSide } from '../../model/shell/shellLayout.js';
/**
 * One view of the app shell: what the page shows in one of its sides (the left or the right
 * sidebar, or the bottom panel), and what the shell needs to give it an activity button. Its
 * children are the view's content; it is a column as wide and as tall as the side it is in, and
 * scrolls what does not fit.
 *
 * The shell draws the view's button (its `icon`, with `label` and `shortcut` as the tooltip), in
 * the order the views are in the page, shows the view when the button is pressed, and heads the
 * side with its label. A view the side does not show is `hidden`, and stays in the page, so its
 * content keeps its state (a scroll position, a tree's open rows) for when it is shown again. The
 * view puts itself in the shell's slot for its side: a page writes only `side`. Shown by its
 * shortcut, it takes the focus: its first control, or itself when it has none (it takes the focus
 * from a script, and is no stop for Tab).
 *
 * @tagname dex-shell-view
 */
export declare class DexShellView extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The side the view is on: `left`, `right` or `bottom`. Default `left`. Attribute `side`. */
    side: ShellSide;
    /**
     * The view's id, which the shell's `showView`, `toggleView` and `anchorOf` take, its events name
     * and its kept layout holds. One view per id: a second view with an id already given is drawn
     * nowhere. A view without one is not drawn. Attribute `view`.
     */
    view: string;
    /** What the view is called: its button's tooltip and accessible name, and its side's header. Attribute `label`. */
    label: string;
    /** The id of the icon its activity button draws (`<dex-icon>`'s `iconId`). Attribute `icon`. */
    icon: string;
    /**
     * The keyboard chord that shows the view, or closes its side when it is shown, as a press of its
     * button does, written as the shell's chords are (`Mod+Shift+E`: Mod is Command on macOS and
     * Ctrl elsewhere). Its tooltip names it in the platform's words. Text that is not a chord is no
     * shortcut, and the tooltip then names none. A chord with no Mod, Ctrl or Alt (a bare key, or
     * Shift and a key) works in a text field too, where the key would type: the shell hears the
     * press on the window, and only a field that prevents its default keeps it. Default none.
     * Attribute `shortcut`.
     */
    shortcut: string;
    connectedCallback(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    render(): import("lit-html").TemplateResult<1>;
}
/**
 * An activity button of the app shell that is no view: Settings or About, say, which open a
 * popover of the page's. The shell draws it at the end of its side's activity bar, after the
 * views, and a press of it (or of its `shortcut`) sends `dex-shell-action` from the shell with the
 * button's box, for the page to open its popover against. The element itself draws nothing, and
 * its children are never shown.
 *
 * @tagname dex-shell-action
 */
export declare class DexShellAction extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The activity bar the button is in: `left` or `right`. Default `left`. Attribute `side`. */
    side: 'left' | 'right';
    /**
     * The action's id: `dex-shell-action`'s `actionId`, and what the shell's `anchorOf` takes. An
     * action without one is not drawn. Attribute `action`.
     */
    action: string;
    /** What the action is called: its button's tooltip and accessible name. Attribute `label`. */
    label: string;
    /** The id of the icon its button draws (`<dex-icon>`'s `iconId`). Attribute `icon`. */
    icon: string;
    /**
     * The keyboard chord that presses the button, written as a view's `shortcut` is, and like one
     * heard in a text field too when it has no Mod, Ctrl or Alt. Default none. Attribute `shortcut`.
     */
    shortcut: string;
    connectedCallback(): void;
    render(): symbol;
}
/** Registers the element as `<dex-shell-view>`, or under `tag`. defineAppShell calls it. */
export declare function defineShellView(tag?: string): void;
/** Registers the element as `<dex-shell-action>`, or under `tag`. defineAppShell calls it. */
export declare function defineShellAction(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-view': DexShellView;
        'dex-shell-action': DexShellAction;
    }
}
