// Copyright 2026 The MathWorks, Inc.
//
// The two children a page gives <dex-app-shell> to say what goes on its sides: a view (content
// with an activity button that shows it) and an action (a button alone, for the page to answer).
// Each is a description the shell reads, not a widget that draws itself: the shell draws their
// buttons, shows one view per side and hides the rest. Their settings reflect to attributes, so
// the shell sees a change made either way, from markup or from script, with one MutationObserver
// on its children.

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
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
export class DexShellView extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      overflow: auto;
    }

    /* Focused itself only when its shortcut showed it and it has no control to take the focus:
       the ring says where the keyboard is, inside the side's edges. */
    :host(:focus) {
      outline: none;
    }

    :host(:focus-visible) {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }
  `];

  /** The side the view is on: `left`, `right` or `bottom`. Default `left`. Attribute `side`. */
  @property({ type: String, reflect: true }) side: ShellSide = 'left';
  /**
   * The view's id, which the shell's `showView`, `toggleView` and `anchorOf` take, its events name
   * and its kept layout holds. One view per id: a second view with an id already given is drawn
   * nowhere. A view without one is not drawn. Attribute `view`.
   */
  @property({ type: String, reflect: true }) view = '';
  /** What the view is called: its button's tooltip and accessible name, and its side's header. Attribute `label`. */
  @property({ type: String, reflect: true }) label = '';
  /** The id of the icon its activity button draws (`<dex-icon>`'s `iconId`). Attribute `icon`. */
  @property({ type: String, reflect: true }) icon = '';
  /**
   * The keyboard chord that shows the view, or closes its side when it is shown, as a press of its
   * button does, written as the shell's chords are (`Mod+Shift+E`: Mod is Command on macOS and
   * Ctrl elsewhere). Its tooltip names it in the platform's words. Text that is not a chord is no
   * shortcut, and the tooltip then names none. A chord with no Mod, Ctrl or Alt (a bare key, or
   * Shift and a key) works in a text field too, where the key would type: the shell hears the
   * press on the window, and only a field that prevents its default keeps it. Default none.
   * Attribute `shortcut`.
   */
  @property({ type: String, reflect: true }) shortcut = '';

  override connectedCallback(): void {
    super.connectedCallback();
    // At once rather than at the first update, so the shell's first render already finds the
    // view in its side's slot.
    this.slot = this.side;
    // Focusable from a script, for the shell to put the focus in a view with no control of its
    // own; -1, so Tab passes it by. A page's own tabindex stands.
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('side')) this.slot = this.side;
  }

  override render() {
    return html`<slot></slot>`;
  }
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
export class DexShellAction extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: none;
    }
  `];

  /** The activity bar the button is in: `left` or `right`. Default `left`. Attribute `side`. */
  @property({ type: String, reflect: true }) side: 'left' | 'right' = 'left';
  /**
   * The action's id: `dex-shell-action`'s `actionId`, and what the shell's `anchorOf` takes. An
   * action without one is not drawn. Attribute `action`.
   */
  @property({ type: String, reflect: true }) action = '';
  /** What the action is called: its button's tooltip and accessible name. Attribute `label`. */
  @property({ type: String, reflect: true }) label = '';
  /** The id of the icon its button draws (`<dex-icon>`'s `iconId`). Attribute `icon`. */
  @property({ type: String, reflect: true }) icon = '';
  /**
   * The keyboard chord that presses the button, written as a view's `shortcut` is, and like one
   * heard in a text field too when it has no Mod, Ctrl or Alt. Default none. Attribute `shortcut`.
   */
  @property({ type: String, reflect: true }) shortcut = '';

  override connectedCallback(): void {
    super.connectedCallback();
    // A slot the shell has none of: whatever a page puts inside an action, and whatever display
    // a page's stylesheet gives it, nothing of it is drawn.
    this.slot = 'action';
  }

  override render() {
    return nothing;
  }
}

/** Registers the element as `<dex-shell-view>`, or under `tag`. defineAppShell calls it. */
export function defineShellView(tag = 'dex-shell-view'): void {
  defineElement(tag, DexShellView);
}

/** Registers the element as `<dex-shell-action>`, or under `tag`. defineAppShell calls it. */
export function defineShellAction(tag = 'dex-shell-action'): void {
  defineElement(tag, DexShellAction);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-shell-view': DexShellView;
    'dex-shell-action': DexShellAction;
  }
}
