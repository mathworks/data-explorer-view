// Copyright 2026 The MathWorks, Inc.
//
// WHERE A DOCUMENT'S UNDO STACK STANDS, as a table offers Undo and Redo by it (EditHistory): the
// page's own stacks say whether there is an edit to undo and one to redo, and tell when either
// changes, and every document the page edits hands its table the stack its edits go on. A table
// whose source has none (the VS Code extension's, whose stack is VS Code's) offers Undo and Redo
// wherever the document may be edited, as it always did; so does a document the page does not edit,
// whose table has no Undo at all.
//
// Without it the shell's toolbar, its palette and the table's menu offered Undo on a file just
// opened, where there is nothing to undo, and a press did nothing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EditStack } from '../src/model/edit/editStack.js';
import { createTextStore } from '../src/model/edit/textStore.js';
import { createWorkspace, isEditable, type EditableTableSource, type EditHistory } from '../src/model/index.js';

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'test/shell/fixtures', name)));
const step = (label = 'Edit') => ({ label, undo: () => {}, redo: () => {} });
const state = (h: EditHistory) => [h.canUndo, h.canRedo];
/** Count what `history` tells, until the test ends. */
const told = (history: EditHistory) => {
  const heard = { n: 0 };
  history.onChange(() => void heard.n++);
  return heard;
};

describe('EditStack, as an edit history', () => {
  it('has neither an edit to undo nor one to redo until an edit is pushed, and follows its undo and redo', () => {
    const stack = new EditStack();
    expect(state(stack)).toEqual([false, false]);
    stack.push(step());
    expect(state(stack)).toEqual([true, false]);
    stack.undo();
    expect(state(stack)).toEqual([false, true]);
    stack.redo();
    expect(state(stack)).toEqual([true, false]);
    stack.undo();
    stack.push(step());
    // A new edit drops the step undone.
    expect(state(stack)).toEqual([true, false]);
    stack.clear();
    expect(state(stack)).toEqual([false, false]);
  });

  it('tells when either changes, once, and not for a move that changes neither', () => {
    const stack = new EditStack();
    const heard = told(stack);
    stack.push(step());
    expect(heard.n).toBe(1);
    // Still an edit to undo, and still none to redo.
    stack.push(step());
    expect(heard.n).toBe(1);
    stack.undo();
    expect(heard.n).toBe(2);
    // Both can now: an undo left, and a redo.
    stack.undo();
    expect(heard.n).toBe(3);
    // Nothing to undo: no move, and nothing told.
    stack.undo();
    expect(heard.n).toBe(3);
    stack.clear();
    expect(heard.n).toBe(4);
    stack.clear();
    expect(heard.n).toBe(4);
  });

  it('tells once the step is done: an undo is told after the edit is taken back', () => {
    const stack = new EditStack();
    const order: string[] = [];
    stack.push({ label: 'Edit', undo: () => void order.push('undone'), redo: () => void order.push('redone') });
    stack.onChange(() => void order.push(`told ${stack.canUndo} ${stack.canRedo}`));
    stack.undo();
    stack.redo();
    expect(order).toEqual(['undone', 'told false true', 'redone', 'told true false']);
  });

  it('tells even when the step throws, which moved the stack all the same', () => {
    const stack = new EditStack();
    stack.push({ label: 'Edit', undo: () => { throw new Error('no'); }, redo: () => {} });
    const heard = told(stack);
    expect(() => stack.undo()).toThrow('no');
    expect(heard.n).toBe(1);
    expect(state(stack)).toEqual([false, true]);
  });

  it('keeps telling the others when a listener throws, says the throw, and stops telling one that unsubscribed', () => {
    const report = vi.fn();
    const stack = new EditStack(report);
    stack.onChange(() => {
      throw new Error('listener');
    });
    const heard = told(stack);
    const late = { n: 0 };
    const stop = stack.onChange(() => void late.n++);
    stack.push(step());
    expect(heard.n).toBe(1);
    expect(late.n).toBe(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'listener' }));
    stop();
    stack.undo();
    expect([heard.n, late.n]).toEqual([2, 1]);
  });
});

describe("the page's text store, as an edit history", () => {
  /** A turn: what the store was asked lands, and is heard, before it ends. */
  const turn = () => new Promise((r) => setTimeout(r, 0));

  it('follows its edits once they land, its undo and redo, and a reset that empties it', async () => {
    const store = createTextStore('{"a":1}');
    const history = store.history;
    const heard = told(history);
    expect(state(history)).toEqual([false, false]);
    const landing = store.apply([{ offset: 5, length: 1, text: '2' }]);
    // An edit lands a turn later, and the stack moves with it.
    expect(state(history)).toEqual([false, false]);
    expect(await landing).toBe(true);
    expect(state(history)).toEqual([true, false]);
    store.undo();
    await turn();
    expect(state(history)).toEqual([false, true]);
    store.redo();
    await turn();
    expect(state(history)).toEqual([true, false]);
    await store.reset('{"a":3}');
    expect(state(history)).toEqual([false, false]);
    // The edit, the undo, the redo and the reset: each moved one of the two.
    expect(heard.n).toBe(4);
  });

  it('tells a reset to the very text it holds, which changes no text but drops the step to redo', async () => {
    const store = createTextStore('{"a":1}');
    await store.apply([{ offset: 5, length: 1, text: '2' }]);
    store.undo();
    await turn();
    expect(state(store.history)).toEqual([false, true]);
    const heard = told(store.history);
    await store.reset(store.text);
    expect(state(store.history)).toEqual([false, false]);
    expect(heard.n).toBe(1);
  });

  it('says a listener\'s throw where the store says one, and keeps telling the others', async () => {
    const report = vi.fn();
    const store = createTextStore('{"a":1}', report);
    store.history.onChange(() => {
      throw new Error('listener');
    });
    const heard = told(store.history);
    await store.apply([{ offset: 5, length: 1, text: '2' }]);
    expect(heard.n).toBe(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'listener' }));
  });
});

// The edits each kind of document the page edits takes, by the row and the value to give it.
const EDITS = [
  { file: 'params.sldd', row: 'Kp', to: '5' },
  { file: 'rt_bin.sldd', row: 'Wheels', to: '6' },
  { file: 'ParamMat.mat', row: 'ParamMat', to: '[1 2 3; 4 5 7]' },
  { file: 'slxcases.slx', row: 'tau', to: '0.5' },
];

/** The source of a document the page edits, as its table is handed it. */
function editable(source: unknown): EditableTableSource {
  if (!isEditable(source as EditableTableSource)) throw new Error('takes no edits');
  return source as EditableTableSource;
}

/** The text a row's cell shows. */
const textOf = (cell: unknown) => (typeof cell === 'object' && cell !== null ? String((cell as { text?: string }).text ?? '') : String(cell ?? ''));

const until = async (ready: () => boolean) => {
  for (let i = 0; i < 400 && !ready(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(ready()).toBe(true);
};

describe("a document the page edits hands its table its stack's history", () => {
  it.each(EDITS)('$file: none at open, an edit to undo, then one to redo, and neither after a reload', async ({ file, row, to }) => {
    const ws = createWorkspace({ editing: true });
    try {
      const bytes = fixture(file);
      const doc = await ws.open(bytes, file);
      const source = editable(doc.table);
      const history = source.history!;
      expect(history, 'a history').toBeDefined();
      const heard = told(history);
      const view = await source.open();
      expect(view.editable).toBe(true);
      expect(state(history)).toEqual([false, false]);
      const r = view.rows.find((x) => x.Name?.label === row)!;
      source.edit({ rowId: r.ID, columnId: 'Value', oldValue: textOf(r.Value), newValue: to });
      await until(() => history.canUndo);
      expect(state(history)).toEqual([true, false]);
      source.undo();
      await until(() => history.canRedo);
      expect(state(history)).toEqual([false, true]);
      await doc.reload(bytes);
      await until(() => !history.canRedo);
      expect(state(history)).toEqual([false, false]);
      // The edit, the undo and the reload, each told once.
      expect(heard.n).toBe(3);
    } finally {
      ws.dispose();
    }
  });

  it('a document the page does not edit has no history: its table offers no Undo at all', async () => {
    const ws = createWorkspace({ editing: true });
    const read = createWorkspace();
    try {
      const mdl = await ws.open(fixture('legacy_ctrl.mdl'), 'legacy_ctrl.mdl');
      expect((mdl.table as Partial<EditableTableSource>).history).toBeUndefined();
      const plain = await read.open(fixture('params.sldd'), 'params.sldd');
      expect((plain.table as Partial<EditableTableSource>).history).toBeUndefined();
    } finally {
      ws.dispose();
      read.dispose();
    }
  });
});
