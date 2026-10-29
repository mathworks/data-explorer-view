import { type MatrixDescriptor } from '../matrix/matrixPayload.js';
export interface PIPropertyRow {
    name: string;
    value: string;
    editable: boolean;
    type: 'text' | 'link';
    linkTarget?: string;
    valueLink?: string;
    matrix?: MatrixDescriptor;
}
export interface PIPropertyGroup {
    title: string;
    properties: PIPropertyRow[];
}
export declare function buildPropertyGroups(node: any): PIPropertyGroup[];
