// Copyright 2026 The MathWorks, Inc.
// The variable editor alone: a button per matrix opens the editor under it, and the cells
// follow, as an app answers the editor once its source has them.
import { createWorkspace } from 'data-explorer-view/model';
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { fixtureById, openFixture } from '../fixtures';
import { byId, startPage } from '../shell';

startPage();
defineVariableEditor(); // <dex-variable-editor>, and the grid inside it

const editor = byId<DexVariableEditor>('editor');
const buttons = byId('matrices');
const log = byId('event-log');

const doc = await openFixture(createWorkspace(), fixtureById('mat'));
// The rows that carry a matrix: the table draws its glyph for exactly these.
const matrices = (await doc.table.open()).rows.flatMap((r) => (r._matrix ? [r._matrix] : []));

function note(text: string): void {
  const item = document.createElement('li');
  item.textContent = text;
  log.prepend(item);
}

async function open(button: HTMLButtonElement, index: number): Promise<void> {
  const matrix = matrices[index];
  editor.show(button, matrix);
  note(`show(<button>, ${matrix.name})`);
  const page = await doc.table.matrix(matrix.nodeId);
  void editor.deliver(page);
  note(`deliver(${matrix.name}: ${page.matrix ? `${page.matrix.cells.length} cells` : page.message})`);
}

matrices.forEach((matrix, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${matrix.name} (${matrix.dims.join('x')} ${matrix.className})`;
  button.addEventListener('click', () => void open(button, i));
  buttons.append(button);
});
const first = buttons.querySelector('button');
if (first) void open(first, 0);
