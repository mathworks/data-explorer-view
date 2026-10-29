// Copyright 2026 The MathWorks, Inc.
// The matrix glyph, in a table's Value cell or the inspector's Value row, opens the page's one
// variable editor; its cells are fetched once it is open.
//
// Hand wiring, until view connects a table to its data itself (see ../../README.md).
import type { MatrixOpenDetail } from 'data-explorer-view/tree-table';
import type { DexVariableEditor, MatrixCellsAnswer } from 'data-explorer-view/variable-editor';

export function wireMatrix(
  root: EventTarget,
  editor: DexVariableEditor,
  cells: (nodeId: string) => MatrixCellsAnswer | null,
): void {
  root.addEventListener('dex-matrix-open', (e) => {
    const detail = (e as CustomEvent<Partial<MatrixOpenDetail>>).detail;
    const nodeId = detail?.matrix?.nodeId;
    if (!detail?.matrix || !detail.anchorEl || !nodeId) return;
    editor.show(detail.anchorEl, detail.matrix);
    // After the panel is up, as an app with the model across a channel answers: the editor
    // says it is loading meanwhile, and ignores an answer for a matrix it no longer shows.
    setTimeout(() => {
      void editor.deliver(cells(nodeId) ?? { nodeId, message: 'This value could not be read as a table.' });
    }, 0);
  });
}
