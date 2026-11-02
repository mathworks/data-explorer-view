// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// WHEN connectTable takes what a host across a channel sends: within the task that delivers it.
//
// An answer to a question the table asked (the first setRows answers `ready`, a childRows a
// requestChildren, a matrixCells a requestMatrix) resolves one of messageSource's promises, so it
// is applied in the microtask checkpoint right after the message's listener returns. That is still
// the task that delivered it, before the next message is handled and before a frame is drawn: an
// app sees the rows, and an editable document its + Add and its row drag, in the first frame after
// the message. These pin that, so a change that pushed an answer into a later task (a timer, a
// frame) fails here rather than as a flicker. Ported from data-explorer-vscode
// test/answersLandInTheirTask and firstPaintEditingState at 632f6e0, which drove them through its
// table-main.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { messageSource, type TablePort } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

/**
 * What `read` sees at the start of the next task after `act`: after every microtask `act` queued,
 * and before any task it queued. It is read twice, in a timer and in an immediate, both set BEFORE
 * `act`. happy-dom runs an animation frame as an immediate, and Node may run an immediate before or
 * after a timer, depending on the phase its loop is in. So the timer's read is ahead of any timer
 * `act` sets, and the immediate's ahead of any frame. The two have to agree.
 */
function nextTask<T>(act: () => void, read: () => T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(read()), 0));
  const immediate = new Promise<T>((resolve) => setImmediate(() => resolve(read())));
  act();
  return Promise.all([timer, immediate]).then(([inTimer, inImmediate]) => {
    expect(inImmediate, 'the same before a frame as before a timer').toEqual(inTimer);
    return inTimer;
  });
}

async function settle(table: DexTreeTable): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

/** A table wired as the extension wires its webview, to a host the test plays. */
function hosted() {
  const posted: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const port: TablePort = { postMessage: (m) => void posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
  const table = document.createElement('dex-tree-table') as DexTreeTable;
  document.body.append(table);
  const handle = connectTable(table, messageSource(port), { editing: true });
  handles.push(handle);
  return { table, handle, posted, send: (m: unknown) => hear(m) };
}

const ROWS = [
  { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
  { ID: 'A', parent: 'section:design', Name: { label: 'A' }, _lazy: true },
  {
    ID: 'M',
    parent: 'section:design',
    Name: { label: 'M' },
    _matrix: { name: 'M', className: 'double', dims: [2, 2], nodeId: 'M' },
  },
] as any[];
const setRows = (rows: any[]) => ({ type: 'setRows', docUri: 'file:///fx/d.sldd', rows, columns: ['Name'], columnLabels: { Name: 'Name' }, editable: false });

/** A table whose first paint is in: what follows is no longer an answer to `ready`. */
async function painted() {
  const hosting = hosted();
  hosting.send(setRows(ROWS));
  await settle(hosting.table);
  return hosting;
}

describe('what the host sends lands in the task that delivers it', () => {
  it('the first setRows, the answer to ready, is installed and drawn before the next task', async () => {
    const { table, posted, send } = hosted();
    expect(posted).toEqual([{ type: 'ready' }]);
    expect(table.loading).toBe(true);
    const seen = await nextTask(
      () => send(setRows(ROWS)),
      () => ({ rows: table.rows.map((r) => r.ID), loading: table.loading, drawn: !table.isUpdatePending }),
    );
    expect(seen).toEqual({ rows: ['section:design', 'A', 'M'], loading: false, drawn: true });
  });

  it("a childRows, the answer to a row's requestChildren, is merged and drawn before the next task", async () => {
    const { table, posted, send } = await painted();
    table.dispatchEvent(new CustomEvent('dex-request-children', { detail: { nodeId: 'A' } }));
    expect(posted.at(-1)).toEqual({ type: 'requestChildren', nodeId: 'A' });
    const seen = await nextTask(
      () => send({ type: 'childRows', nodeId: 'A', rows: [{ ID: 'A.k', parent: 'A', Name: { label: 'k' } }], truncated: 0 }),
      () => ({ rows: table.rows.map((r) => r.ID), drawn: !table.isUpdatePending }),
    );
    expect(seen).toEqual({ rows: ['section:design', 'A', 'A.k', 'M'], drawn: true });
  });

  it('a matrixCells, the answer to requestMatrix, reaches the variable editor before the next task', async () => {
    const { table, handle, posted, send } = await painted();
    const editor = handle.variableEditor;
    const delivered: unknown[] = [];
    const deliver = editor.deliver.bind(editor);
    editor.deliver = (answer) => (delivered.push(answer), deliver(answer));
    table.dispatchEvent(new CustomEvent('dex-matrix-open', { detail: { matrix: ROWS[2]._matrix, anchorEl: table }, bubbles: true }));
    expect(posted.at(-1)).toEqual({ type: 'requestMatrix', nodeId: 'M' });
    const cells = { name: 'M', className: 'double', dims: [2, 2], nodeId: 'M', cells: ['1', '2', '3', '4'] };
    const seen = await nextTask(
      () => send({ type: 'matrixCells', nodeId: 'M', matrix: cells }),
      () => delivered.slice(),
    );
    expect(seen).toEqual([{ nodeId: 'M', matrix: cells }]);
  });

  it('a later setRows, a change no question waits for, is installed inside the listener, as before', async () => {
    const { table, send } = await painted();
    send(setRows(ROWS.slice(0, 2)));
    expect(table.rows.map((r) => r.ID)).toEqual(['section:design', 'A']);
  });
});

describe("the first paint's editing state lands in the task that delivers it", () => {
  it('an editable first setRows draws its Add button and its row drag before the next task', async () => {
    const { table, posted, send } = hosted();
    expect(posted).toEqual([{ type: 'ready' }]);
    expect({ canAdd: table.canAdd, addClasses: table.addClasses }).toEqual({ canAdd: false, addClasses: null });
    // The table's own default is a row drag, so it is cleared first: setting it is then something to see.
    table.rowDrag = false;
    const seen = await nextTask(
      () =>
        send({
          type: 'setRows',
          docUri: 'file:///fx/gains.mat',
          rows: [{ ID: 'm/x', parent: null, Name: { label: 'x' } }],
          columns: ['Name'],
          columnLabels: { Name: 'Name' },
          editable: true,
          add: { classes: ['double'] },
        }),
      () => ({
        canAdd: table.canAdd,
        rowDrag: table.rowDrag,
        addClasses: table.addClasses,
        drawn: !table.isUpdatePending,
        addButton: table.shadowRoot!.querySelector('.add-button')?.getAttribute('title') ?? null,
        rowDraggable: table.shadowRoot!.querySelector('tr[data-row-id="m/x"]')?.getAttribute('draggable') ?? null,
      }),
    );
    expect(seen).toEqual({
      canAdd: true,
      rowDrag: true,
      addClasses: ['double'],
      drawn: true,
      addButton: 'Add a variable',
      rowDraggable: 'true',
    });
  });
});
