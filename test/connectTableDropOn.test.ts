// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A row drag let go somewhere other than the table, onto a document it shows: an app's list of its
// open files (the app shell's Explorer) takes a drop on a file or on one of its sections, and the
// document may be one whose tab is not the one on screen. The handle answers for its document as
// its own rows would, so the list can neither invite a drop the table would refuse nor carry out
// one by another path:
//  - dropDecision(rowId, mode) is the table's own prediction for that row (the drag in flight its
//    source told it of, and the section rules), and rowId null is the document as a whole, landing
//    where documentDrop says (the entries' own section, else the first that takes them);
//  - drop(rowId, mode) is the drop the table's row sends (the source's `drop`), only where that
//    prediction allows it, and settles once the source had the chance to refuse it: what it
//    carried, or why it was refused, for the app to say. It is no editing menu item: it tells no
//    `ran`.
// And `dragOut`: the table's rows can be dragged out to such a list, from a document that may not be
// edited too, as a copy, where its source can put them in the drag register.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { DexTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';
import type { EditableTableSource, TableChange, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const DOC = 'file:///w/d.sldd';
const OTHER = 'file:///w/other.sldd';
const DESIGN = 'section:design';
const CONFIG = 'section:config';
const A = 'binedit:file:///w/d.sldd/design/A';
const VIEW: TableView = {
  docUri: DOC,
  rows: [
    { ID: DESIGN, parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: DESIGN, Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true } as any,
    { ID: CONFIG, parent: null, Name: { label: 'Configurations' } } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};
const RULES: TableChange = {
  kind: 'sectionRules',
  docUri: DOC,
  rules: [
    { sectionName: 'config', sectionLabel: 'Configurations', isDerived: false, allowedTypes: ['Simulink.ConfigSet'] },
    { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: ['Simulink.Parameter'] },
  ],
};
const PARAM = { className: 'Simulink.Parameter', arrayClass: 'Simulink.Parameter', kind: 'Simulink Parameter', isMatlabVariable: false, isScalarNumeric: false };
const dragOf = (docUri: string, ...items: object[]): TableChange => ({ kind: 'drag', descriptor: { docUri, items: items as any } });
const DRAGGING_ONE = dragOf(OTHER, { ...PARAM, sectionName: 'design' });

const READ_ONLY_COMMANDS = ['open', 'children', 'matrix', 'inspect', 'subscribe'];

/** A source that records its commands, and answers one with what `answer` says (now, or a few promise turns later). */
function pageSource(view: TableView = VIEW, commandNames = ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText']) {
  const calls: unknown[][] = [];
  const listeners = new Set<(c: TableChange) => void>();
  const emit = (change: TableChange) => {
    for (const l of [...listeners]) l(change);
  };
  const answer: Record<string, { change: TableChange; later?: boolean }> = {};
  const read: TableSource = {
    open: async () => view,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
  };
  const command = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
    const a = answer[name];
    if (!a) return;
    if (a.later) void Promise.resolve().then(() => Promise.resolve()).then(() => emit(a.change));
    else emit(a.change);
  };
  const commands = Object.fromEntries(commandNames.filter((n) => !READ_ONLY_COMMANDS.includes(n)).map((name) => [name, command(name)]));
  return { source: { ...read, ...commands } as EditableTableSource, calls, emit, answer };
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

const settle = async (table: any) => {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
};

async function mount(s: TableSource, options: { dragOut?: boolean; editing?: boolean } = {}) {
  const table = document.createElement('dex-tree-table') as DexTreeTable;
  document.body.append(table);
  const handle = connectTable(table, s, { editing: options.editing ?? true, dragOut: options.dragOut });
  handles.push(handle);
  await settle(table);
  const ran: unknown[] = [];
  handle.on('ran', (run) => void ran.push(run));
  return { table, handle, ran };
}

describe("the handle's dropDecision: the table's own prediction, for a part of the page outside it", () => {
  it("answers for a section's row as a drop on that row is predicted", async () => {
    const { source, emit } = pageSource();
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    expect(handle.dropDecision(DESIGN, 'copy')).toEqual({ rowId: DESIGN, canDrop: true, cursor: 'copy', tooltip: 'Copy Simulink Parameter', noop: false });
    expect(handle.dropDecision(CONFIG, 'move')).toMatchObject({ rowId: CONFIG, canDrop: false, tooltip: 'Simulink Parameter cannot be in Configurations' });
    // An entry's row is in its section.
    expect(handle.dropDecision(A, 'move')).toMatchObject({ rowId: A, canDrop: true });
  });

  it('answers for the document as a whole (null) in the section the entries came from, else the first that takes them', async () => {
    const { source, emit } = pageSource();
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    expect(handle.dropDecision(null, 'move')).toMatchObject({ rowId: DESIGN, canDrop: true, tooltip: 'Move Simulink Parameter' });
    emit(dragOf(OTHER, { ...PARAM, sectionName: 'other' }));
    expect(handle.dropDecision(null, 'move')).toMatchObject({ rowId: DESIGN, canDrop: true });
    // From this very document, in move mode: the no-op it is.
    emit(dragOf(DOC, { ...PARAM, sectionName: 'design' }));
    expect(handle.dropDecision(null, 'move')).toMatchObject({ rowId: DESIGN, canDrop: false, noop: true });
  });

  it("answers the whole file's '' for a document that is one target", async () => {
    const { source, emit } = pageSource({ ...VIEW, rows: [] });
    const { handle } = await mount(source);
    emit({ kind: 'sectionRules', docUri: DOC, rules: [{ sectionName: '', sectionLabel: 'v.mat', isDerived: false, allowedTypes: [] }] });
    emit(DRAGGING_ONE);
    expect(handle.dropDecision(null, 'copy')).toMatchObject({ rowId: '', canDrop: true });
  });

  it('is no answer with no drag in flight, in a document that may not be edited, or without editing', async () => {
    const one = pageSource();
    const { handle } = await mount(one.source);
    one.emit(RULES);
    expect(handle.dropDecision(DESIGN, 'move')).toBeNull();
    const readOnly = pageSource({ ...VIEW, editable: false });
    const other = await mount(readOnly.source);
    readOnly.emit(RULES);
    readOnly.emit(DRAGGING_ONE);
    expect(other.handle.dropDecision(DESIGN, 'move')).toBeNull();
    const plain = pageSource();
    const third = await mount(plain.source, { editing: false });
    plain.emit(RULES);
    plain.emit(DRAGGING_ONE);
    expect(third.handle.dropDecision(DESIGN, 'move')).toBeNull();
  });
});

describe("the handle's drop", () => {
  it("hands the source the drop its row would send, and settles with what it carried, telling no ran", async () => {
    const { source, emit, calls } = pageSource();
    const { handle, ran } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    const dropped = handle.drop(DESIGN, 'move');
    // Handed over at once: the drag ends (dragEnd) right after a drop, and the source reads its register then.
    expect(calls).toEqual([['drop', DESIGN, 'move']]);
    expect(await dropped).toEqual({ dropped: true, count: 1 });
    expect(ran).toEqual([]);
  });

  it.each([
    ['an error, at once', { change: { kind: 'error', message: 'Could not resolve the target section.' } as TableChange }, 'Could not resolve the target section.'],
    ['an error, a few promise turns later', { change: { kind: 'error', message: 'B is in use' } as TableChange, later: true }, 'B is in use'],
    ['a refusal', { change: { kind: 'refused', title: 'Cannot Paste', reason: 'not here' } as TableChange }, 'not here'],
  ])('settles as refused, with the reason, where the source answers %s', async (_what, answerWith, reason) => {
    const { source, emit, answer } = pageSource();
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    answer.drop = answerWith;
    expect(await handle.drop(DESIGN, 'move')).toEqual({ dropped: false, count: 1, reason });
  });

  it("waits for a source whose drop finishes later (a JSON dictionary's, queued behind an edit) and hears its refusal then", async () => {
    const { source, emit } = pageSource();
    let finish!: () => void;
    (source as any).drop = () =>
      new Promise<void>((resolve) => {
        finish = () => {
          emit({ kind: 'error', message: 'Kp is already in Design Data.' });
          resolve();
        };
      });
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    let settled: unknown;
    void handle.drop(DESIGN, 'move').then((r) => (settled = r));
    // Several tasks on, the edit the drop is queued behind is still being written.
    for (let i = 0; i < 3; i++) await new Promise((done) => setTimeout(done, 0));
    expect(settled).toBeUndefined();
    finish();
    await vi.waitFor(() => expect(settled).toEqual({ dropped: false, count: 1, reason: 'Kp is already in Design Data.' }));
  });

  it('settles as dropped once a source that finishes later is done, refusing nothing', async () => {
    const { source, emit } = pageSource();
    (source as any).drop = () => new Promise<void>((resolve) => setTimeout(resolve, 20));
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    expect(await handle.drop(DESIGN, 'copy')).toEqual({ dropped: true, count: 1 });
  });

  it('hands nothing over where the prediction refuses it, or it is a no-op, and says why', async () => {
    const { source, emit, calls } = pageSource();
    const { handle } = await mount(source);
    emit(RULES);
    emit(DRAGGING_ONE);
    expect(await handle.drop(CONFIG, 'move')).toEqual({ dropped: false, count: 1, reason: 'Simulink Parameter cannot be in Configurations' });
    // '' is the document itself, which a dictionary is not one target of.
    expect(await handle.drop('', 'move')).toEqual({ dropped: false, count: 1 });
    emit(dragOf(DOC, { ...PARAM, sectionName: 'design' }));
    expect(await handle.drop(DESIGN, 'move')).toEqual({ dropped: false, count: 1 });
    expect(calls).toEqual([]);
  });

  it('hands nothing over with no drag in flight, or in a document that may not be edited', async () => {
    const one = pageSource();
    const { handle } = await mount(one.source);
    one.emit(RULES);
    expect(await handle.drop(DESIGN, 'move')).toEqual({ dropped: false, count: 0 });
    const readOnly = pageSource({ ...VIEW, editable: false });
    const other = await mount(readOnly.source);
    readOnly.emit(RULES);
    readOnly.emit(DRAGGING_ONE);
    expect(await other.handle.drop(DESIGN, 'move')).toEqual({ dropped: false, count: 0 });
    expect([one.calls, readOnly.calls]).toEqual([[], []]);
  });
});

describe('dragOut: rows dragged out of the table', () => {
  const start = (table: DexTreeTable, rowIds: string[]) =>
    table.dispatchEvent(new CustomEvent('dex-row-drag-start', { detail: { rowIds }, bubbles: true, composed: true }));
  const end = (table: DexTreeTable) => table.dispatchEvent(new CustomEvent('dex-row-drag-end', { bubbles: true, composed: true }));

  it('an editable document drags as before, and its table follows the pointer out', async () => {
    const { source, calls } = pageSource();
    const { table } = await mount(source, { dragOut: true });
    expect([table.rowDrag, table.dragOut]).toEqual([true, true]);
    start(table, [A]);
    end(table);
    expect(calls).toEqual([['dragStart', [A]], ['dragEnd']]);
  });

  it('a document that may not be edited is dragged out by its source, for a copy, where the source can', async () => {
    const { source, calls } = pageSource({ ...VIEW, editable: false });
    const { table } = await mount(source, { dragOut: true });
    expect([table.rowDrag, table.dragOut]).toEqual([false, true]);
    start(table, [A]);
    end(table);
    expect(calls).toEqual([['dragStart', [A]], ['dragEnd']]);
  });

  it("a read-only source that can put its rows in the drag register (a workspace's read-only document) is dragged out too", async () => {
    const { source, calls } = pageSource({ ...VIEW, editable: false }, ['dragStart', 'dragEnd']);
    const { table } = await mount(source, { dragOut: true });
    expect(table.dragOut).toBe(true);
    start(table, [A]);
    end(table);
    expect(calls).toEqual([['dragStart', [A]], ['dragEnd']]);
  });

  it('a read-only source that cannot, and any document without dragOut, drag nothing out, as before', async () => {
    const bare = pageSource({ ...VIEW, editable: false }, []);
    const one = await mount(bare.source, { dragOut: true });
    expect(one.table.dragOut).toBe(false);
    const viewing = pageSource({ ...VIEW, editable: false });
    const two = await mount(viewing.source);
    expect(two.table.dragOut).toBe(false);
    start(two.table, [A]);
    expect(viewing.calls).toEqual([]);
  });
});
