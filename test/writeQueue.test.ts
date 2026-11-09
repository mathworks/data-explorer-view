// Copyright 2026 The MathWorks, Inc.
//
// The queue a JSON dictionary's edits take turns on (src/model/edit/writeQueue.ts): one per
// document, shared by its tables and by the source half of a cross-document move out of it. What
// it protects is the order and the liveness of the edits: each starts once the one in front of it
// has settled or let its turn go, an edit asked for `now` with nothing in front of it starts in the
// caller's run (a cell edit paints at once), and nothing a run does, a synchronous throw included,
// leaves the queue waiting for ever. The JSON engine's cases over it are
// test/jsonEngine/editAfterStructural.test.ts and test/jsonEngine/documentWrites.test.ts.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { WriteQueue } from '../src/model/edit/writeQueue.js';

/** A run the case finishes by hand, and whether it has started. */
function held<T = void>() {
  let finish!: (value: T) => void;
  let fail!: (err: unknown) => void;
  const out = {
    started: false,
    run: () => {
      out.started = true;
      return new Promise<T>((resolve, reject) => ((finish = resolve), (fail = reject)));
    },
    finish: (value: T) => finish(value),
    fail: (err: unknown) => fail(err),
  };
  return out;
}

/** Every microtask and task the queue has queued. */
const turns = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WriteQueue', () => {
  it('starts each run once the one in front of it has settled, in the order asked', async () => {
    const queue = new WriteQueue();
    const first = held();
    const second = held();
    const done: string[] = [];
    void queue.enqueue(first.run).then(() => done.push('first'));
    void queue.enqueue(second.run).then(() => done.push('second'));
    await turns();
    assert.ok(first.started && !second.started, 'the second waits for the first');
    first.finish();
    await turns();
    assert.ok(second.started, 'and starts once it has settled');
    second.finish();
    await turns();
    assert.deepStrictEqual(done, ['first', 'second']);
  });

  it('runs a `now` edit in the caller\'s run when nothing is in front of it, and behind what is', async () => {
    const queue = new WriteQueue();
    const now = held();
    void queue.enqueue(now.run, true);
    assert.ok(now.started, 'nothing in front: started before enqueue returned');
    const behind = held();
    void queue.enqueue(behind.run, true);
    assert.ok(!behind.started, 'something in front: it waits');
    now.finish();
    await turns();
    assert.ok(behind.started);
  });

  it('counts a run before it starts, so one asked for from inside it waits for it', async () => {
    const queue = new WriteQueue();
    const inner = held();
    const outer = held();
    void queue.enqueue(() => {
      void queue.enqueue(inner.run, true);
      return outer.run();
    }, true);
    assert.ok(outer.started && !inner.started, 'the one asked for meanwhile is behind it');
    outer.finish();
    await turns();
    assert.ok(inner.started);
  });

  it('answers a synchronous throw as a rejection, and the next run still starts', async () => {
    const queue = new WriteQueue();
    const thrown = queue.enqueue(() => {
      throw new Error('thrown before any await');
    }, true);
    await assert.rejects(thrown, /thrown before any await/);
    const next = held();
    void queue.enqueue(next.run, true);
    await turns();
    assert.ok(next.started, 'the queue was let go');
  });

  it('a run that rejects does not hold up the next', async () => {
    const queue = new WriteQueue();
    const failing = held();
    const next = held();
    const failed = queue.enqueue(failing.run);
    void queue.enqueue(next.run);
    await turns();
    failing.fail(new Error('the write was refused'));
    await assert.rejects(failed, /refused/);
    await turns();
    assert.ok(next.started);
  });

  it('lets the next run start when a run releases its turn, before it settles', async () => {
    const queue = new WriteQueue();
    const tail = held();
    let release!: () => void;
    const first = queue.enqueue((r) => {
      release = r;
      return tail.run();
    });
    const next = held();
    void queue.enqueue(next.run);
    await turns();
    assert.ok(!next.started, 'held while the first holds its turn');
    release();
    await turns();
    assert.ok(next.started, 'started once the first let its turn go');
    // Settling afterwards lets nothing go twice: a third still waits for the second.
    const third = held();
    void queue.enqueue(third.run);
    tail.finish();
    await first;
    await turns();
    assert.ok(!third.started, 'the third waits for the second, which has not settled');
    next.finish();
    await turns();
    assert.ok(third.started);
  });
});
