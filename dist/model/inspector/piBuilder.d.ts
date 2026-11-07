import { type MatrixDescriptor } from '../matrix/matrixPayload.js';
/** One row of the inspector: a property's name and its value as text. */
export interface PropertyRow {
    name: string;
    value: string;
    /**
     * The value is an input; a committed change sends `dex-property-changed`. buildPropertyGroups
     * sets it false, unless it is asked for editable rows.
     */
    editable?: boolean;
    /**
     * The property's key, which an edit of the row names (a cell edit's `columnId`): core's key for
     * it, which its setter takes as it takes the column's. On an editable row only.
     */
    key?: string;
    /** On an editable row whose editor is a choice: the choices, which the field offers in a list. */
    options?: string[];
    /**
     * A text that may hold lines: on an editable row (a Description), a field of several lines; on a
     * read-only one (MATLAB's display of a value), drawn as written, its lines and spaces kept.
     * buildPropertyGroups sets it on editable rows only.
     */
    multiline?: boolean;
    /** `link` anchors the NAME, and a click sends `dex-property-navigate` with `linkTarget` (else the name). */
    type?: 'text' | 'link';
    linkTarget?: string;
    valueLink?: string;
    matrix?: MatrixDescriptor;
}
/** One titled group of the inspector's rows. */
export interface PropertyGroup {
    title: string;
    properties: PropertyRow[];
}
/** How buildPropertyGroups draws a node's rows. */
export interface PropertyGroupOptions {
    /**
     * Rows editable where core offers an editor of the property (its propDef's `editable`), each
     * keyed by the property an edit names, a choice with its options and a text of lines marked so.
     * Not a matrix's Value, whose glyph opens the variable editor it is edited in, nor a Value shown
     * as a summary (`<10x10 double>`), whose text is not the value. Default false: every row
     * read-only, as the VS Code extension's inspector shows them.
     */
    editable?: boolean;
}
export declare function buildPropertyGroups(node: any, options?: PropertyGroupOptions): PropertyGroup[];
