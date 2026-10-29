// Copyright 2026 The MathWorks, Inc.
// The variable editor alone: a button per matrix opens the editor under it, and the cells
// follow, as an app answers the editor once it has read them.
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { fixtureById } from '../fixtures';
import { byId, startPage } from '../shell';
import { openFixture } from '../wiring/documents';
import { matrixCells, tablePayload } from '../wiring/tableData';

startPage();
defineVariableEditor(); // <dex-variable-editor>, and the grid inside it

const editor = byId<DexVariableEditor>('editor');
const buttons = byId('matrices');
const log = byId('event-log');

const doc = await openFixture(fixtureById('mat'));
// The rows that carry a matrix: the table draws its glyph for exactly these.
const matrices = tablePayload(doc).rows.flatMap((r) => (r._matrix ? [r._matrix] : []));

function note(text: string): void {
  const item = document.createElement('li');
  item.textContent = text;
  log.prepend(item);
}

function open(button: HTMLButtonElement, index: number): void {
  const matrix = matrices[index];
  editor.show(button, matrix);
  note(`show(<button>, ${matrix.name})`);
  setTimeout(() => {
    const answer = matrixCells(doc, matrix.nodeId);
    void editor.deliver(answer);
    note(`deliver(${matrix.name}: ${answer.matrix ? `${answer.matrix.cells.length} cells` : answer.message})`);
  }, 0);
}

matrices.forEach((matrix, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${matrix.name} (${matrix.dims.join('x')} ${matrix.className})`;
  button.addEventListener('click', () => open(button, i));
  buttons.append(button);
});
const first = buttons.querySelector('button');
if (first) open(first, 0);
