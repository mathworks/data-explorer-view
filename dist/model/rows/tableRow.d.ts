import type { MatrixDescriptor } from '../matrix/matrixPayload.js';
/**
 * One row of the tree table. A row names its parent by `ID` (`parent`, null at the top level);
 * the cells are by column key, each the cell's text or an object with the text and what the cell
 * can do (edit it, copy it, follow its link).
 */
export interface TreeTableRow {
    ID: string;
    parent: string | null;
    Name: {
        label: string;
        iconId?: string;
        editable?: boolean;
        element?: boolean;
        clipboardMode?: string;
    };
    Value: {
        text: string;
        editable?: boolean;
        clipboardMode?: string;
        linkTarget?: string;
        editor?: string;
        options?: string[];
    } | string;
    _valueEditable?: boolean;
    _descriptionEditable?: boolean;
    _descriptionApplies?: boolean;
    _matrix?: MatrixDescriptor;
    _lazy?: boolean;
    DataType: {
        prefix?: string;
        text: string;
        clipboardMode?: string;
        linkTarget?: string;
    } | string;
    Class?: {
        text: string;
        clipboardMode?: string;
    } | string;
    Kind?: {
        text: string;
        clipboardMode?: string;
    } | string;
    Description: {
        text: string;
        clipboardMode?: string;
    } | string;
    Status: {
        text: string;
        clipboardMode?: string;
    } | string;
    UsedBy?: {
        text: string;
        linkTarget?: string;
    } | {
        links: {
            text: string;
            linkTarget: string;
        }[];
    } | string;
    _systemPath?: string;
    _blockPath?: string;
    /**
     * Every other cell the row has, by column key: a dictionary entry's `Min`, `Max`, `Unit`, …,
     * a block row's parameter links. Each column's cell has a shape of its own, which the table
     * reads; `unknown` here, so code that reads one says which shape it expects.
     */
    [column: string]: unknown;
}
