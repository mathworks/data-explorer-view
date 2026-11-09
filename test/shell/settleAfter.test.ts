// Copyright 2026 The MathWorks, Inc.
//
// settleAfter (connect/terminal.ts) on its own, over a stand-in source: a Terminal line's add or
// delete is a queued command of the source's, which paints, says the selection it leaves, and
// writes the file's text after, in one task. The line settles a task after the first change of the
// command's own (a repaint, a selection, a refusal, an error), whenever that comes; a change that is
// not one (the clipboard's state, a drag's) does not settle it. A command that brings none settles
// after the wait, and one that throws rejects at once, listening no more.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableChange, TableSource } from '../../src/model/source/tableSource.js';
import { settleAfter } from '../../src/widgets/app-shell/connect/terminal.js';

/** A source that says what the test tells it to, and how many listen. */
function fakeSource() {
  const listeners = new Set<(change: TableChange) => void>();
  const source = { subscribe: (listener: (change: TableChange) => void) => (listeners.add(listener), () => void listeners.delete(listener)) };
  return { source: source as unknown as TableSource, listeners, say: (change: TableChange) => [...listeners].forEach((l) => l(change)) };
}

/** Whether `promise` has settled, and how. */
function track(promise: Promise<void>) {
  const state = { settled: false, error: undefined as unknown };
  promise.then(
    () => void (state.settled = true),
    (err) => void ((state.settled = true), (state.error = err)),
  );
  return state;
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe('settleAfter', () => {
  it("settles a task after the command's first change, though it comes on a later task", async () => {
    const { source, listeners, say } = fakeSource();
    const done = track(settleAfter(source, () => void setTimeout(() => say({ kind: 'insertEntry', sectionRowId: 's', rows: [] }), 50)));
    await vi.advanceTimersByTimeAsync(49);
    expect(done.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // The write that follows the change in its task comes first: the next task, a timer's (1 ms).
    expect(done.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done.settled).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('is not settled by a change that is not the command\'s own', async () => {
    const { source, say } = fakeSource();
    const done = track(settleAfter(source, () => {}));
    say({ kind: 'clipboard', state: { canPaste: false } } as unknown as TableChange);
    say({ kind: 'beginRename', rowId: 'r' });
    await vi.advanceTimersByTimeAsync(10);
    expect(done.settled).toBe(false);
    for (const change of [{ kind: 'select', rowIds: [] }, { kind: 'refused', title: 't', reason: 'r' }, { kind: 'error', message: 'm' }] as TableChange[]) {
      const each = fakeSource();
      const settled = track(settleAfter(each.source, () => each.say(change)));
      await vi.advanceTimersByTimeAsync(1);
      expect(settled.settled, change.kind).toBe(true);
    }
  });

  it('settles after the wait for a command that brings no change', async () => {
    const { source, listeners } = fakeSource();
    const done = track(settleAfter(source, () => {}, 500));
    await vi.advanceTimersByTimeAsync(499);
    expect(done.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done.settled).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('rejects at once for a command that throws, and listens no more', async () => {
    const { source, listeners } = fakeSource();
    const done = track(
      settleAfter(source, () => {
        throw new Error('This document is read-only.');
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(done.settled).toBe(true);
    expect((done.error as Error).message).toBe('This document is read-only.');
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
