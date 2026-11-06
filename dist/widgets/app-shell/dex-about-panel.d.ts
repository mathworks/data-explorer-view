import { LitElement, nothing } from 'lit';
import { type AboutLine } from '../../model/shell/about.js';
import type { Rect } from '../../model/shell/placement.js';
/**
 * The shell's About popover, opened from the (i) button of an activity bar: a heading (the app's
 * name) and the lines the app hands it, each a label and its value (the app's version, the
 * versions it is built on). A line may name a section (`section: 'Built on'`): the lines with none
 * come first, under the app's name, then each section under its own heading, in the order its
 * first line has. The app's words are drawn as text, never as markup.
 *
 * show() opens it beside the button that opened it, as `<dex-settings-panel>` opens; Escape, a
 * press outside it, or close() closes it, and focus goes back to the button. It sends nothing.
 *
 * @tagname dex-about-panel
 */
export declare class DexAboutPanel extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The heading, the app's name, drawn in capitals as the Settings title is; also the dialog's accessible name. */
    heading: string;
    /**
     * The lines under the heading, in order: a label (Version) and its value (1.0.0), and the heading
     * of the section the line is in (`section`), if any. The lines with no section are drawn first;
     * each section follows, once, where its first line is.
     */
    lines: AboutLine[];
    private readonly _popover;
    /** Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling. */
    get open(): boolean;
    /**
     * Opens the popover beside `anchor`, the button that opened it, in viewport px (its
     * getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
     * right has no room, and inside the window. Open already, it moves; not on the page, it does
     * not open.
     */
    show(anchor: Rect): void;
    /** Closes the popover; focus goes back to the button when the popover held it. */
    close(): void;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the widget as `<dex-about-panel>`, or under `tag`. */
export declare function defineAboutPanel(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-about-panel': DexAboutPanel;
    }
}
