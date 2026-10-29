import { type MatrixDescriptor } from '../matrix/matrixPayload.js';
/** One row of the inspector: a property's name and its value as text. */
export interface PropertyRow {
    name: string;
    value: string;
    /**
     * The value is an input; a committed change sends `dex-property-changed`. buildPropertyGroups
     * sets it false.
     */
    editable?: boolean;
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
export declare function buildPropertyGroups(node: any): PropertyGroup[];
