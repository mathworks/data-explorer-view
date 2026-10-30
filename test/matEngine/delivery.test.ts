// Copyright 2026 The MathWorks, Inc.
//
// The MAT-file engine for a host that delivers each whole paint's rows itself (trailerAfterDelivery:
// the VS Code extension's, whose post of the rows is awaited before what follows them): a paint's
// trailer waits for the host's `opened()`, what else the engine says meanwhile is said at once, and
// what is said after a repaint follows its trailer. And the generation and version a host reads.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type TableChange } from '../../src/model/index.js';
import { EditStack, EditStackIndex, MatEngine } from '../../src/host/index.js';
import { buffer, fixture } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A cases.mat document whose host delivers the rows itself, and a table of it whose changes are kept. */
function openDelivered(trailerAfterDelivery = true) {
  const stack = new EditStack();
  const engine = new MatEngine({
    session: createSession(),
    uri: 'file:///work/cases.mat',
    name: 'cases.mat',
    bytes: buffer(fixture('cases.mat')),
    sink: { push: (e) => stack.push(e), undo: () => stack.undo(), redo: () => stack.redo() },
    index: new EditStackIndex(),
    registers: createRegisters(),
    trailerAfterDelivery,
  });
  const table = (): { view: ReturnType<MatEngine['view']>; heard: TableChange[] } => {
    const view = engine.view();
    const heard: TableChange[] = [];
    view.subscribe((c) => void heard.push(c));
    return { view, heard };
  };
  return { engine, table };
}

const kinds = (heard: TableChange[]): string[] => heard.map((c) => c.kind);
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const rowOf = (view: any, name: string): any => view.rows.find((r: any) => r.parent == null && r.Name?.label === name);

describe('MAT-file engine, delivered by its host (trailerAfterDelivery)', () => {
  it('sends what follows an open, and a repaint, only once the host says the rows are delivered', async () => {
    const { table } = openDelivered();
    const { view, heard } = table();
    const answer = await view.open();
    await settle();
    assert.deepStrictEqual(kinds(heard), [], 'nothing behind the rows until they are delivered');
    view.opened();
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    heard.length = 0;
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    await settle();
    assert.deepStrictEqual(kinds(heard), ['replaceAll']);
    assert.strictEqual(repainted, false, 'the repaint waits for its trailer');
    view.opened();
    await repaint;
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard']);
    assert.ok(rowOf(answer, 'scalarD'));
  });

  it('says what else happens while the rows are on their way at once, ahead of the trailer', async () => {
    const { table } = openDelivered();
    const first = table();
    const second = table();
    await first.view.open();
    first.view.opened();
    const answer = await second.view.open();
    second.view.opened();
    first.heard.length = 0;
    void first.view.repaintAll();
    await settle();
    // An edit in the other table while this one's rows are being delivered.
    second.view.edit({ rowId: rowOf(answer, 'scalarD').ID, columnId: 'Value', oldValue: '', newValue: '42' });
    assert.deepStrictEqual(kinds(first.heard), ['replaceAll', 'updateEntry'], 'the edit is said at once');
    first.view.opened();
    assert.deepStrictEqual(kinds(first.heard), ['replaceAll', 'updateEntry', 'sectionRules', 'clipboard']);
  });

  it('says what follows a repaint after its trailer: a command that throws, repainted and then said', async () => {
    const { engine, table } = openDelivered();
    const { view, heard } = table();
    await view.open();
    view.opened();
    heard.length = 0;
    const session = (engine as any).options.session;
    const find = session.findNodeById;
    session.findNodeById = () => {
      throw new Error('the lookup failed');
    };
    try {
      view.edit({ rowId: 'any', columnId: 'Value', oldValue: '', newValue: '42' });
    } finally {
      session.findNodeById = find;
    }
    await settle();
    assert.deepStrictEqual(kinds(heard), ['replaceAll'], 'the rows, and the banner waits behind their trailer');
    view.opened();
    await settle();
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard', 'error']);
    assert.match((heard.at(-1) as any).message, /^Failed to handle edit in cases\.mat: the lookup failed$/);
  });

  it('answers each opened() with the oldest paint not yet delivered, and a closed table waits for none', async () => {
    const { table } = openDelivered();
    const { view, heard } = table();
    await view.open();
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    await settle();
    assert.deepStrictEqual(kinds(heard), ['replaceAll'], 'neither trailer before its rows are delivered');
    view.opened();
    await settle();
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard'], "the open's");
    assert.strictEqual(repainted, false, "and the repaint's still waits");
    view.opened();
    await repaint;
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard', 'sectionRules', 'clipboard'], "then the repaint's");
    const waiting = view.repaintAll();
    await settle();
    view.dispose();
    await waiting;
  });

  it('without it, a repaint sends its trailer behind its rows at once, as before', async () => {
    const { table } = openDelivered(false);
    const { view, heard } = table();
    await view.open();
    view.opened();
    heard.length = 0;
    await view.repaintAll();
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard']);
  });
});

describe('MAT-file engine: what a host reads of where the document stands', () => {
  it('generation moves with each tree read from the disk, version with each change and each save', async () => {
    const { engine, table } = openDelivered(false);
    const { view } = table();
    const answer = await view.open();
    view.opened();
    assert.deepStrictEqual([engine.generation, engine.version], [0, 0]);
    view.edit({ rowId: rowOf(answer, 'scalarD').ID, columnId: 'Value', oldValue: '', newValue: '42' });
    assert.strictEqual(engine.version, 1, 'an edit');
    const save = engine.beginSave();
    engine.saved(save);
    assert.strictEqual(engine.version, 2, 'a save, which moves the Status column');
    await engine.replace(buffer(fixture('cases.mat')));
    assert.deepStrictEqual([engine.generation, engine.version], [1, 3], 'a reload: a new tree');
    assert.throws(() => ((engine as any).generation = 5), TypeError, 'read-only');
  });
});
