// Copyright 2026 The MathWorks, Inc.
//
// The clipboard read at paste time, as the Data Explorer in MATLAB reads its own: a Cut or a
// Copy keeps which entries it took, and a paste asks their document for them as they are NOW, so
// an edit made between the two is what lands. Closing the document empties a clipboard taken
// from it, and an entry gone by the time of the paste is skipped and named.
//
// The registers' half (the reader each document registers, closeSource) and the transfer's half
// (what a paste does with what the reader answered), with a fake document; each engine's own
// reader is pinned in its clipboard tests.
import { describe, expect, it } from 'vitest';
import {
  createRegisters,
  goneMessage,
  runTransfer,
  TransferRefused,
  type ClipboardItem,
  type TransferAdapter,
  type TransferCommit,
  type TransferDeps,
  type TransferTarget,
} from '../src/model/index.js';

const A = 'file:///work/a.sldd';
const B = 'file:///work/b.sldd';

function item(name: string, value: unknown = 1, sourceSection = 'design'): ClipboardItem {
  return {
    payload: { name, metadata: { uuid: `u-${name}` }, value },
    sourceSection,
    className: 'double',
    arrayClass: 'double',
    kind: 'Variable',
    isMatlabVariable: true,
    isScalarNumeric: true,
  };
}

function fakeAdapter(docUri = B) {
  const log = { commits: [] as TransferCommit<TransferTarget>[], reports: [] as string[], failures: [] as unknown[] };
  const adapter: TransferAdapter<TransferTarget> = {
    docUri,
    resolveTarget: () => ({ sectionName: 'design' }),
    commit: (plan) => void log.commits.push(plan),
    onFailure: (err) => void log.failures.push(err),
    report: (message) => void log.reports.push(message),
  };
  return { adapter, log };
}

function fakeDeps() {
  const deletes: { uri: string; selectors: unknown[] }[] = [];
  const warnings: string[] = [];
  const deps: TransferDeps = {
    deleteFromSource: async (uri, selectors) => {
      deletes.push({ uri, selectors });
      return { removed: true };
    },
    warn: (message) => void warnings.push(message),
  };
  return { deps, deletes, warnings };
}

describe('a paste reads the clipboard from its document at paste time', () => {
  it('hands the reader what was taken, and pastes what it answers', async () => {
    const r = createRegisters();
    const asked: (readonly ClipboardItem[])[] = [];
    r.registerSourceReader(A, (items) => {
      asked.push(items);
      return { items: [item('x', 555)], gone: [] };
    });
    const taken = [item('x', -100000)];
    r.setClipboard(taken, 'copy', A);
    const { adapter, log } = fakeAdapter();
    const out = await runTransfer({ rowId: 'r' }, r.clipboardRegister(() => {}), adapter, fakeDeps().deps);
    expect(out).toEqual({ kind: 'done' });
    expect(asked).toEqual([taken]);
    expect(log.commits.map((c) => c.payloads)).toEqual([[item('x', 555).payload]]);
  });

  it('a cut moves the entry as it is now: the fresh name is the one deleted from its document', async () => {
    const r = createRegisters();
    r.registerSourceReader(A, () => ({ items: [item('renamed', 2)], gone: [] }));
    r.setClipboard([item('x')], 'cut', A);
    const { adapter, log } = fakeAdapter();
    const { deps, deletes } = fakeDeps();
    const out = await runTransfer({ rowId: 'r' }, r.clipboardRegister(() => {}), adapter, deps);
    expect(out).toEqual({ kind: 'done' });
    expect(log.commits[0]!.payloads).toEqual([item('renamed', 2).payload]);
    expect(deletes).toEqual([{ uri: A, selectors: [{ name: 'renamed', uuid: 'u-renamed' }] }]);
    expect(r.getClipboard()).toBeNull();
  });

  it('pastes what is left, and names what is no longer there', async () => {
    const r = createRegisters();
    r.registerSourceReader(A, () => ({ items: [item('y')], gone: ['x'] }));
    r.setClipboard([item('x'), item('y')], 'copy', A);
    const { adapter, log } = fakeAdapter();
    const { deps, warnings } = fakeDeps();
    const out = await runTransfer({ rowId: 'r' }, r.clipboardRegister(() => {}), adapter, deps);
    const message = 'Not pasted: "x" is no longer in a.sldd.';
    expect(out).toEqual({ kind: 'done', skipped: message });
    expect(log.commits.map((c) => c.payloads.map((p) => p.name))).toEqual([['y']]);
    expect(log.reports).toEqual([message]);
    expect(warnings).toEqual([message]);
    expect(r.getClipboard()?.mode, 'a copy stays on the clipboard').toBe('copy');
  });

  it('pastes nothing when every entry is gone, says so, and empties the clipboard', async () => {
    const r = createRegisters();
    r.registerSourceReader(A, () => ({ items: [], gone: ['x', 'y'] }));
    r.setClipboard([item('x'), item('y')], 'cut', A);
    let broadcasts = 0;
    const { adapter, log } = fakeAdapter();
    const { deps, deletes } = fakeDeps();
    const out = await runTransfer({ rowId: 'r' }, r.clipboardRegister(() => void broadcasts++), adapter, deps);
    const message = 'Nothing to paste: "x" and "y" are no longer in a.sldd.';
    expect(out).toEqual({ kind: 'gone', message });
    expect(log.reports).toEqual([message]);
    expect(log.commits).toEqual([]);
    expect(deletes).toEqual([]);
    expect(r.getClipboard()).toBeNull();
    expect(broadcasts).toBe(1);
  });

  it('a reader that refuses is said as it is, and changes nothing', async () => {
    const r = createRegisters();
    r.registerSourceReader(A, () => {
      throw new TransferRefused('Cannot copy "x": it is too big.');
    });
    r.setClipboard([item('x')], 'cut', A);
    const { adapter, log } = fakeAdapter();
    const out = await runTransfer({ rowId: 'r' }, r.clipboardRegister(() => {}), adapter, fakeDeps().deps);
    expect(out).toEqual({ kind: 'refused', message: 'Cannot copy "x": it is too big.' });
    expect(log.reports).toEqual(['Cannot copy "x": it is too big.']);
    expect(log.commits).toEqual([]);
    expect(r.getClipboard()?.mode, 'the cut stays for another try').toBe('cut');
  });

  it('a drop is not re-read: a drag has no time between its start and its drop', async () => {
    const r = createRegisters();
    let asked = 0;
    r.registerSourceReader(A, () => {
      asked++;
      return { items: [], gone: ['x'] };
    });
    r.setDrag(A, [item('x')]);
    const { adapter, log } = fakeAdapter();
    await runTransfer({ rowId: 'r' }, r.dragRegister('copy', () => {}), adapter, fakeDeps().deps);
    expect(asked).toBe(0);
    expect(log.commits.map((c) => c.payloads.map((p) => p.name))).toEqual([['x']]);
  });
});

describe('closing a document', () => {
  it('empties a clipboard taken from it, Copy or Cut, and tells every table', () => {
    for (const mode of ['copy', 'cut'] as const) {
      const r = createRegisters();
      const heard: unknown[] = [];
      r.listen({ clipboard: (state) => void heard.push(state.canPaste) });
      r.setClipboard([item('x')], mode, A);
      r.closeSource(A);
      expect(r.getClipboard(), mode).toBeNull();
      expect(heard, mode).toEqual([false]);
    }
  });

  it('leaves a clipboard taken from another document alone', () => {
    const r = createRegisters();
    const heard: unknown[] = [];
    r.listen({ clipboard: (state) => void heard.push(state.canPaste) });
    r.setClipboard([item('x')], 'cut', A);
    r.closeSource(B);
    expect(r.getClipboard()?.sourceDocUri).toBe(A);
    expect(heard).toEqual([]);
  });

  it('drops its deleter and its reader', async () => {
    const r = createRegisters();
    let read = 0;
    r.registerSourceDeleter(A, () => ({ removed: true }));
    r.registerSourceReader(A, (items) => {
      read++;
      return { items: [...items], gone: [] };
    });
    r.closeSource(A);
    expect(await r.deleteFromSource(A, ['x'])).toEqual({ removed: false, reason: 'its table is no longer open' });
    r.setClipboard([item('x')], 'copy', A);
    r.clipboardRegister(() => {}).read();
    expect(read).toBe(0);
  });
});

describe('goneMessage', () => {
  it('names each entry, and says whether anything was pasted', () => {
    expect(goneMessage(['x'], A, true)).toBe('Nothing to paste: "x" is no longer in a.sldd.');
    expect(goneMessage(['x'], A, false)).toBe('Not pasted: "x" is no longer in a.sldd.');
    expect(goneMessage(['x', 'y', 'z'], A, false)).toBe('Not pasted: "x", "y" and "z" are no longer in a.sldd.');
    expect(goneMessage(['a', 'b', 'c', 'd', 'e', 'f', 'g'], undefined, false)).toBe(
      'Not pasted: "a", "b", "c", "d", "e" and 2 more are no longer in their file.',
    );
  });
});
