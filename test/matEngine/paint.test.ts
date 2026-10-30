// Copyright 2026 The MathWorks, Inc.
//
// The MAT-file engine's paints, where they meet what else is going on: a Usage column whose graph
// is still being built while an edit lands, a repaint and an open answered in the same turn, a
// document closed while its rows are on their way, a clipboard broadcast one of a table's
// listeners throws on, registers whose methods need their `this`, and the name a document opened
// by its uri alone is said by.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type Registers } from '../../src/model/index.js';
import type { UsageFill } from '../../src/host/index.js';
import { buffer, edit, fixture, open, tableOf, viewOf, waitFor } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A Usage column that marks each top-level row with how it was filled (`fill`, or `fillNow` from
 * the graph the last fill built). Once `hold()` is called, a fill waits for `release()`: a graph
 * still being built.
 */
function heldUsage() {
  const waiting: (() => void)[] = [];
  let holding = false;
  const mark = (rows: any[], how: string) => {
    for (const row of rows) if (row.parent == null) row.UsedBy = { blockLinks: [{ label: how }] };
  };
  const usage: UsageFill = {
    fill: (rows) => {
      if (!holding) return Promise.resolve(mark(rows, 'fill'));
      return new Promise<void>((resolve) => waiting.push(() => resolve(mark(rows, 'fill'))));
    },
    fillNow: (rows) => mark(rows, 'fillNow'),
  };
  return {
    usage,
    hold: () => void (holding = true),
    waiting: () => waiting.length,
    /** Let every waiting fill finish, in the order they were asked, in this turn. */
    release: () => {
      holding = false;
      for (const done of waiting.splice(0)) done();
    },
  };
}

const usedBy = (row: any): string | undefined => row?.UsedBy?.blockLinks?.[0]?.label;
const quiet = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The type of each message after the `setRows` at `at`, up to the next paint. */
function trailerAfter(posts: any[], at: number): string[] {
  const out: string[] = [];
  for (const p of posts.slice(at + 1)) {
    if (p.type === 'setRows') break;
    out.push(p.type);
  }
  return out;
}

describe('MAT-file engine: paints', () => {
  it('a Usage fill that resolves after an edit lands: the paint is built again from the tree the edit left, and filled from the graph the fill built', async () => {
    const held = heldUsage();
    const o = await open('cases.mat', undefined, { usage: held.usage });
    assert.strictEqual(usedBy(tableOf(o.view.posts).find((r) => r.parent == null)), 'fill', 'a first paint awaits its fill');

    const source = o.engine.view();
    held.hold();
    const answer = source.open();
    await waitFor('the fill asked', () => held.waiting() >= 1);
    edit(o, 'scalarD', 'Value', '42');
    assert.strictEqual(o.events.length, 1, 'the edit landed while the graph was being built');
    held.release();

    const scalar = (await answer).rows.find((r: any) => r.parent == null && r.Name?.label === 'scalarD');
    assert.strictEqual(scalar.Value, '42', 'built again from the tree the edit left');
    assert.strictEqual(scalar.Status, 'Modified');
    assert.strictEqual(usedBy(scalar), 'fillNow', 'its cells filled from the graph the fill built');
    const first = tableOf(o.view.posts).find((r) => r.parent == null && r.Name?.label === 'scalarD');
    assert.strictEqual(usedBy(first), 'fillNow', "the edit's own repaint is filled from that graph too");
  });

  it('a repaint and an open answered in the same turn each post what follows a paint, after their own rows', async () => {
    const held = heldUsage();
    const o = await open('cases.mat', undefined, { usage: held.usage });
    const second = viewOf(o.engine);
    held.hold();
    second.send({ type: 'ready' });
    await waitFor('the open asked for its fill', () => held.waiting() === 1);
    const reload = o.engine.replace(buffer(fixture('pv_basic.mat')));
    await waitFor('both repaints asked for theirs', () => held.waiting() === 3);
    held.release();
    await reload;
    await waitFor('the open answered', () => second.posts.filter((p) => p.type === 'setRows').length === 2);
    await quiet();

    const paints = second.posts.flatMap((p, i) => (p.type === 'setRows' ? [i] : []));
    assert.strictEqual(paints.length, 2, 'the repaint and the open');
    for (const at of paints) {
      const names = second.posts[at].rows.filter((r: any) => r.parent == null).map((r: any) => r.Name?.label);
      assert.ok(names.includes('p') && !names.includes('scalarD'), 'each of the reloaded tree');
      assert.deepStrictEqual(trailerAfter(second.posts, at), ['sectionRules', 'clipboardState'], `the paint at ${at} is followed by its own`);
    }
  });

  it("a table whose document closes while its rows are on their way says nothing: its open settles as SourceClosed, '<name> is closed.'", async () => {
    const held = heldUsage();
    const o = await open('cases.mat', undefined, { usage: held.usage });
    const second = viewOf(o.engine);
    const direct = o.engine.view();
    held.hold();
    second.send({ type: 'ready' });
    const answer = direct.open();
    await waitFor('both fills asked', () => held.waiting() === 2);
    o.engine.dispose();
    held.release();
    await assert.rejects(answer, (err: any) => err.name === 'SourceClosed' && err.message === 'cases.mat is closed.');
    await quiet();
    assert.deepStrictEqual(second.posts, [], 'no rows, and no error: nobody is left to tell');
    await assert.rejects(direct.open(), (err: any) => err.name === 'SourceClosed' && err.message === 'cases.mat is closed.', 'asked again, the same');
  });

  it('a table one of whose listeners throws on a clipboard broadcast still has its clip mark repainted, and the other tables still hear it', async () => {
    const registers = createRegisters();
    const session = createSession();
    const a = await open('gains.mat', fixture('pv_basic.mat'), { as: 'gains.mat', registers, session });
    const b = await open('other.mat', fixture('cases.mat'), { as: 'other.mat', registers, session });
    // A second listener of a's table that throws on every clipboard state, as a post to a panel
    // disposed under the broadcast would.
    a.view.source.subscribe((change) => {
      if (change.kind === 'clipboard') throw new Error('the panel is gone');
    });
    const x = tableOf(a.view.posts).find((r) => r.parent == null && r.Name?.label === 'x');
    const from = b.view.posts.length;
    a.view.send({ type: 'cut', rowIds: [x.ID] });
    await waitFor('the cut row dimmed', () => tableOf(a.view.posts).find((r) => r.ID === x.ID)?.Name?.clipboardMode === 'cut');
    assert.ok(
      b.view.posts.slice(from).some((p) => p.type === 'clipboardState' && p.canPaste && p.mode === 'cut'),
      'the other table was told what the clipboard holds',
    );
    assert.deepStrictEqual(a.view.posts.filter((p) => p.type === 'error'), [], 'and the cut said nothing of the throw');
  });

  it('calls the registers on themselves: registers whose methods need their `this` work as a plain object does', async () => {
    const unbound: string[] = [];
    const inner = createRegisters();
    const registers: Registers = new Proxy(inner, {
      get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== 'function') return value;
        return function (this: unknown, ...args: unknown[]) {
          if (this !== registers) unbound.push(String(key));
          return value.apply(target, args);
        };
      },
    });
    const session = createSession();
    const a = await open('a.mat', fixture('pv_basic.mat'), { as: 'a.mat', registers, session });
    const c = await open('c.mat', fixture('cases.mat'), { as: 'c.mat', registers, session });
    const row = (name: string) => tableOf(a.view.posts).find((r) => r.parent == null && r.Name?.label === name).ID;

    a.view.send({ type: 'copy', rowIds: [row('x')] });
    c.view.send({ type: 'paste', rowId: '' });
    await waitFor('the copy pasted', () => c.events.length === 1);
    a.view.send({ type: 'cut', rowIds: [row('str')] });
    c.view.send({ type: 'paste', rowId: '' });
    await waitFor('the cut moved', () => a.events.length === 1);
    a.view.send({ type: 'dragStart', rowIds: [row('q')] });
    c.view.send({ type: 'drop', rowId: '', mode: 'move' });
    await waitFor('the drop moved', () => a.events.length === 2);
    a.view.send({ type: 'dragStart', rowIds: [row('p')] });
    a.view.send({ type: 'dragEnd' });
    await waitFor('the drag let go of', () => registers.getDrag() === null);
    assert.deepStrictEqual(unbound, []);
  });

  it("a document opened by its uri alone is named by its path's last segment, decoded, as VS Code names one", async () => {
    const o = await open('pv_basic.mat', undefined, { uri: 'file:///work/my%20gains%231.mat' });
    const rules = o.view.posts.find((p) => p.type === 'sectionRules');
    assert.deepStrictEqual(rules.rules.map((r: any) => r.sectionLabel), ['my gains#1.mat']);
    const junk = new Uint8Array([...fixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const ro = await open('tail.mat', junk, { uri: 'file:///work/tail%20end.mat?x=1' });
    assert.match(ro.view.posts.find((p) => p.type === 'setRows').notice, /^Read-only: Cannot save "tail end\.mat": /);
  });
});
