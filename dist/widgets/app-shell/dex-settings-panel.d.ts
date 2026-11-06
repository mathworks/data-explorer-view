import { LitElement, nothing } from 'lit';
import { type ShellSettings } from '../../model/shell/settings.js';
import type { Rect } from '../../model/shell/placement.js';
/** What `dex-settings-change` carries: the settings asked for, whole. */
export interface SettingsChangeDetail {
    /** Every setting, the changed one included: a new object, never the panel's `settings`. */
    settings: ShellSettings;
}
/**
 * The shell's Settings popover, opened from the gear of an activity bar: the theme (Auto, Light,
 * Dark, Hi-Con), the toolbar's density (Normal, Compact: smaller icons with the labels beside
 * them), the icons of the shell's buttons (Minimal, in one colour, or Colorful) and the tables'
 * rules (Grid or Rows), each a row of segments that is a radio group. It shows `settings` and asks
 * for a change: a click, or an arrow key inside a group, sends `dex-settings-change` with the whole
 * new record and changes nothing by itself. The app applies the settings, keeps them, and sets
 * `settings` back; the popover stays open, so the themes can be tried one after another.
 *
 * show() opens it beside the button that opened it (placeBeside, in data-explorer-view/model),
 * focused on the chosen theme; Escape, a press outside it, or close() closes it, and focus goes
 * back to the button.
 *
 * @tagname dex-settings-panel
 */
export declare class DexSettingsPanel extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The settings shown: which segment of each row is checked. The app sets it, at first and
     * after each `dex-settings-change` it applies; the panel never changes it itself.
     */
    settings: ShellSettings;
    private readonly _popover;
    /** Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling. */
    get open(): boolean;
    /**
     * Opens the popover beside `anchor`, the button that opened it, in viewport px (its
     * getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
     * right has no room, and inside the window. Focus goes to the chosen theme. Open already, it
     * moves; not on the page, it does not open.
     */
    show(anchor: Rect): void;
    /** Closes the popover, sending nothing; focus goes back to the button when the popover held it. */
    close(): void;
    private _ask;
    private _onGroupKey;
    private _row;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the widget as `<dex-settings-panel>`, or under `tag`. */
export declare function defineSettingsPanel(tag?: string): void;
/**
 * The events `<dex-settings-panel>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface SettingsPanelEventMap {
    /**
     * A segment other than the checked one was chosen, by a click or an arrow key: apply these
     * settings, keep them, and set `settings` to them. The popover stays open.
     */
    'dex-settings-change': CustomEvent<SettingsChangeDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-settings-panel': DexSettingsPanel;
    }
    interface HTMLElementEventMap extends SettingsPanelEventMap {
    }
    interface DocumentEventMap extends SettingsPanelEventMap {
    }
    interface WindowEventMap extends SettingsPanelEventMap {
    }
}
