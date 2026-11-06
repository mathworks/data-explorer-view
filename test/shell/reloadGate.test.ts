// Copyright 2026 The MathWorks, Inc.
//
// ReloadGate (connect/reload.ts) on its own, for what the page tests cannot see: a tab that closes
// while its question is out, or while its file is read after the answer, is acted on no further. Its
// document is disposed by then, so a keepOver or a reload on it would act on nothing that is shown,
// and a read would ask the host for a file no tab holds.
import { describe, expect, it, vi } from 'vitest';
import type { Doc } from '../../src/model/source/workspace.js';
import { ReloadGate, type ReloadTab } from '../../src/widgets/app-shell/connect/reload.js';

/** A tab whose document has unsaved edits, and what was done to it. */
function dirtyTab() {
  const doc = { dirty: true, keepOver: vi.fn(async () => undefined), reload: vi.fn(async () => undefined) };
  const tab: ReloadTab = { path: '/w/params.sldd', name: 'params.sldd', doc: doc as unknown as Doc };
  return { tab, doc };
}

/** A promise and the function that settles it. */
function later<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

describe('ReloadGate', () => {
  it('reads the file and keeps the edits over it, for a tab still open', async () => {
    const { tab, doc } = dirtyTab();
    const read = vi.fn(async () => new Uint8Array([1]));
    const gate = new ReloadGate({ read, confirm: async () => false, isOpen: () => true });
    await gate.changedOnDisk(tab, true);
    expect(read).toHaveBeenCalledWith('/w/params.sldd');
    expect(doc.keepOver).toHaveBeenCalledTimes(1);
  });

  it('asks about the tab itself, so a question can be dropped for one that closed before its turn', async () => {
    const { tab } = dirtyTab();
    const confirm = vi.fn(async () => false);
    await new ReloadGate({ read: async () => new Uint8Array(), confirm, isOpen: () => true }).changedOnDisk(tab, true);
    expect(confirm).toHaveBeenCalledWith(tab);
  });

  it('acts on no answer that comes after its tab closed', async () => {
    const { tab, doc } = dirtyTab();
    const read = vi.fn(async () => new Uint8Array([1]));
    const answer = later<boolean>();
    let open = true;
    const gate = new ReloadGate({ read, confirm: () => answer.promise, isOpen: () => open });
    const done = gate.changedOnDisk(tab, true);
    open = false;
    answer.settle(true);
    await done;
    expect(read).not.toHaveBeenCalled();
    expect(doc.reload).not.toHaveBeenCalled();
  });

  it('takes nothing from a read that lands after its tab closed, kept or reloaded, read or not', async () => {
    for (const keep of [true, false]) {
      for (const fails of [false, true]) {
        const { tab, doc } = dirtyTab();
        const bytes = later<Uint8Array>();
        let reads = 0;
        let open = true;
        const gate = new ReloadGate({
          read: () => (reads++, fails ? bytes.promise.then(() => Promise.reject(new Error('gone'))) : bytes.promise),
          confirm: async () => !keep,
          isOpen: () => open,
        });
        const done = gate.changedOnDisk(tab, true);
        await vi.waitFor(() => expect(reads).toBe(1));
        open = false;
        bytes.settle(new Uint8Array([1]));
        await done;
        expect([doc.keepOver.mock.calls.length, doc.reload.mock.calls.length], `keep ${keep}, fails ${fails}`).toEqual([0, 0]);
      }
    }
  });

  it('looks again at a change that came while it read, unless its tab closed meanwhile', async () => {
    for (const closes of [false, true]) {
      const { tab, doc } = dirtyTab();
      const first = later<Uint8Array>();
      let reads = 0;
      let open = true;
      const confirm = vi.fn(async () => false);
      const gate = new ReloadGate({ read: () => (++reads === 1 ? first.promise : Promise.resolve(new Uint8Array([2]))), confirm, isOpen: () => open });
      const done = gate.changedOnDisk(tab, true);
      await vi.waitFor(() => expect(reads).toBe(1));
      void gate.changedOnDisk(tab, true);
      if (closes) open = false;
      first.settle(new Uint8Array([1]));
      await done;
      // Kept over the first change, then asked about the second, which also landed; or neither, closed.
      expect([confirm.mock.calls.length, doc.keepOver.mock.calls.length, reads], `closes ${closes}`).toEqual(closes ? [1, 0, 1] : [2, 2, 2]);
    }
  });
});
