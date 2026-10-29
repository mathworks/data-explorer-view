import { LitElement } from 'lit';
import type { MatrixDescriptor } from '../../model/matrix/matrixPayload.js';
/** One titled group of the inspector's rows. */
export interface PropertyGroup {
    title: string;
    properties: PropertyRow[];
}
/** One row of the inspector: a property's name and its value as text. */
export interface PropertyRow {
    name: string;
    value: string;
    /** The value is an input; a committed change sends `dex-property-changed`. */
    editable?: boolean;
    /** `link` anchors the NAME, and a click sends `dex-pi-navigate` with `linkTarget` (else the name). */
    type?: 'text' | 'link';
    linkTarget?: string;
    valueLink?: string;
    matrix?: MatrixDescriptor;
}
/** What `dex-property-changed` carries: the property's name, its new text and the text it had. */
export interface PropertyChangedDetail {
    propName: string;
    newValue: string;
    oldValue: string;
}
/** What `dex-pi-navigate` carries: the target of the link clicked. */
export interface PiNavigateDetail {
    sourceId: string;
}
/**
 * The properties of one entry, in titled groups of name–value rows. A row may be an editable
 * field (a change sends `dex-property-changed`), a link (on its name, or on its value; a click
 * sends `dex-pi-navigate`), or a matrix value with the glyph that opens it in the variable
 * editor (`dex-matrix-open`, from `<dex-matrix-open>`). It holds no data of its own: an app sets
 * `groups`, from the model's buildPropertyGroups, each time the selection changes.
 *
 * @tagname dex-property-inspector
 */
export declare class DexPropertyInspector extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The groups shown, in order; none, the default, draws an empty panel. Attribute `groups` (JSON). */
    groups: PropertyGroup[];
    private _onPropertyChange;
    private _onLinkClick;
    private _renderPropertyValue;
    render(): import("lit-html").TemplateResult<1>;
}
/**
 * Registers the widget as `<dex-property-inspector>`, or under `tag`, after the matrix glyph a
 * matrix-valued row draws (under its default name).
 */
export declare function definePropertyInspector(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-property-inspector': DexPropertyInspector;
    }
    interface HTMLElementEventMap {
        /** An editable row's field was changed and committed (its change event). */
        'dex-property-changed': CustomEvent<PropertyChangedDetail>;
        /**
         * A link was clicked: a link row's name (`sourceId` is its `linkTarget`, else its name) or a
         * value link (its `valueLink`).
         */
        'dex-pi-navigate': CustomEvent<PiNavigateDetail>;
    }
}
