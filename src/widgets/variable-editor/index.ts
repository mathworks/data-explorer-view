// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/variable-editor`: the variable editor and the grid inside it.
// defineVariableEditor defines the grid too.
export { DexVariableEditor, defineVariableEditor } from './dex-variable-editor.js';
export type { MatrixCellsAnswer } from './dex-variable-editor.js';
export { DexMatrixGrid, defineMatrixGrid } from './dex-matrix-grid.js';
// The model's own declaration, so this entry and data-explorer-view/model name the same type.
export type { MatrixDescriptor, MatrixPayload } from '../../model/matrix/matrixPayload.js';
