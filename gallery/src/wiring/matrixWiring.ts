// Copyright 2026 The MathWorks, Inc.
// The matrix glyph, in a table's Value cell or the inspector's Value row, opens the page's one
// variable editor; its cells are fetched once it is open.
//
// Hand wiring, until view connects a table to its data itself (see ../../README.md).
import type { DexVariableEditor, MatrixCellsAnswer } from 'data-explorer-view/variable-editor';

/**
 * `root` holds every glyph: the event bubbles out of the table's and the inspector's shadow
 * roots. An element, not the document: the widgets type their events on HTMLElementEventMap.
 */
export function wireMatrix(
  root: HTMLElement,
  editor: DexVariableEditor,
  cells: (nodeId: string) => MatrixCellsAnswer | null,
): void {
  root.addEventListener('dex-matrix-open', (e) => {
    const { matrix, anchorEl } = e.detail;
    editor.show(anchorEl, matrix);
    // After the panel is up, as an app with the model across a channel answers: the editor
    // says it is loading meanwhile, and ignores an answer for a matrix it no longer shows.
    setTimeout(() => {
      void editor.deliver(cells(matrix.nodeId) ?? { nodeId: matrix.nodeId, message: 'This value could not be read as a table.' });
    }, 0);
  });
}
