// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/matInspectorRefresh.test.ts at c73da3c.
//
// The Property Inspector and a MAT-file whose selected variable changes under it, run against view's
// MAT-file engine: the MAT-file engine's half of what test/binaryEngine/inspector.test.ts holds the
// binary dictionary engine to. The inspector is handed a node when a row is selected, and builds its
// rows from it once. A MAT-file's tree is its document, and an edit changes the variable in place, so
// the engine says whenever the tree changed (its `changed` hook, the extension's provider's
// `onChanged`): a gesture, a paste, a move out of the file, an undo or a redo. The host answers it
// with the inspector's one re-resolve (InspectorSelection.refresh), as the extension's activate()
// wires it: each case wires its engines to its own InspectorSelection the same way, and reads what
// the inspector was asked to show. The suite's third case, a revert and a reload from disk, reads
// the disk and stays with the extension; the engine's half of it is edit.test.ts's reload.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { beforeEach, describe, it } from 'vitest';
import { buildPropertyGroups, createRegisters, InspectorSelection, type Registers } from '../../src/model/index.js';
import { fixture, open, variableOf, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The Value the inspector's rows say for `node`. */
const valueOf = (node: any): string | undefined =>
  buildPropertyGroups(node)
    .flatMap((g) => g.properties)
    .find((p) => p.name === 'Value')?.value;

describe('MAT-file: the Property Inspector follows the variable it shows', () => {
  let session: ReturnType<typeof createSession>;
  let registers: Registers;
  let selection: InspectorSelection;
  /** Every node the inspector was asked to show, with the Value its rows said then; null for a clear. */
  let shown: ({ node: any; value: string | undefined } | null)[];
  /** Every document the engines said changed. */
  let changed: string[];

  beforeEach(() => {
    // One session and one set of registers for every document a case opens, as a window's are.
    session = createSession();
    registers = createRegisters();
    shown = [];
    changed = [];
    // As activate() wires the registered provider.
    selection = new InspectorSelection(
      { showNode: (node) => void shown.push({ node, value: valueOf(node) }), clear: () => void shown.push(null) },
      (_uri, id) => session.findNodeById(id),
    );
  });

  async function openAs(name: string, as = name): Promise<Opened & { uri: string; variable(n: string): any }> {
    const uri = `file:///work/${as}`;
    const o = await open(as, fixture(name), {
      as,
      session,
      registers,
      changed: () => {
        changed.push(uri);
        selection.refresh(uri);
      },
    });
    const variable = (n: string): any => {
      const found = variableOf(o, n);
      assert.ok(found, `${as} holds ${n}`);
      return found;
    };
    return Object.assign(o, { uri, variable });
  }

  // The table's `select`, relayed to the inspector as the extension's provider relays it (onSelect).
  const select = (o: { view: Opened['view']; uri: string }, id: string) => {
    o.view.send({ type: 'select', rowIds: [id] });
    selection.show(o.uri, [id]);
  };

  /** What the inspector shows now: the Value of the node it was last asked to show. */
  const showing = (): string | undefined => {
    const last = shown[shown.length - 1];
    assert.ok(last, 'the inspector shows a node');
    return last.value;
  };
  const showingNode = (): any => shown[shown.length - 1]?.node;

  it('an edit, its undo and its redo of the shown variable each show its value as it now is', async () => {
    const o = await openAs('cases.mat');
    select(o, o.variable('scalarD').id);
    const was = showing();
    assert.strictEqual(was, '3.141592653589793');
    o.view.send({ type: 'edit', rowId: o.variable('scalarD').id, columnId: 'Value', oldValue: '', newValue: '42' });
    assert.strictEqual(showing(), '42', 'the edit');
    await o.events[o.events.length - 1].undo();
    assert.strictEqual(showing(), was, 'its undo');
    await o.events[o.events.length - 1].redo();
    assert.strictEqual(showing(), '42', 'its redo');
    assert.strictEqual(showingNode(), o.variable('scalarD'), 'from the node the session holds now');
  });

  it('a paste into the file, and a move of the shown variable out of it, each say the tree changed', async () => {
    const a = await openAs('pv_basic.mat', 'a.mat');
    const b = await openAs('pv_basic.mat', 'b.mat');
    select(a, a.variable('x').id);
    changed.length = 0;
    a.view.send({ type: 'copy', rowIds: [a.variable('str').id] });
    a.view.send({ type: 'paste', rowId: '' });
    await waitFor('the paste', () => changed.includes(a.uri));
    assert.strictEqual(showingNode(), a.variable('x'), 'the shown variable, shown again from the tree');

    changed.length = 0;
    a.view.send({ type: 'cut', rowIds: [a.variable('x').id] });
    b.view.send({ type: 'paste', rowId: '' });
    await waitFor('the move out of a.mat', () => changed.includes(a.uri));
    assert.ok(changed.includes(b.uri), 'and the paste into b.mat');
    assert.ok(!shown.includes(null), 'a variable gone is left to the table, not cleared here');
  });
});
