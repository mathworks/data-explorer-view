import { LitElement } from 'lit';
/**
 * A note in muted text, padded as a side's content is: its children, as text. Hidden with the
 * `hidden` attribute, as connectInspector's `empty` element is. A note of work under way, with
 * `role="status"`, shows once the work has taken a moment.
 *
 * @tagname dex-shell-note
 */
export declare class DexShellNote extends LitElement {
    static styles: import("lit").CSSResult[];
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the element as `<dex-shell-note>`, or under `tag`. */
export declare function defineShellNote(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-note': DexShellNote;
    }
}
