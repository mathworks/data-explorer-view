// Copyright 2026 The MathWorks, Inc.
//
// Saving a tab's document through the host (connect/saving.ts's Saver), settling unsaved edits
// before tabs or the window close (settle), and the question the in-page dialog asks for a host
// with no prompt of its own (closeQuestion). Saver and settle are data-explorer-app's, and these
// are its saving test's cases, with the host in place of `window.dex`.
import { describe, expect, it, vi } from 'vitest';
import type { Doc } from '../../src/model/source/workspace.js';
import { Saver, closeAnswerOf, closeQuestion, settle, type Savable } from '../../src/widgets/app-shell/connect/saving.js';

/** A document as the page holds one: what it serializes, and what it was told. */
function fakeDoc(over: { dirty?: boolean; editable?: boolean; refuse?: string } = {}) {
  let n = 0;
  const told: string[] = [];
  const doc = {
    editable: over.editable ?? true,
    dirty: over.dirty ?? true,
    serialize: vi.fn(() => {
      if (over.refuse) throw new Error(over.refuse);
      return { bytes: new Uint8Array([++n]), at: { at: n } };
    }),
    saved: (at: { at: number }) => told.push(`saved ${at.at}`),
    notSaved: (at: { at: number }) => told.push(`notSaved ${at.at}`),
  };
  return { doc: doc as unknown as Doc, told, serialize: doc.serialize };
}

const tab = (doc?: Doc): Savable => ({ path: '/d/plant.sldd', name: 'plant.sldd', doc });

describe('Saver', () => {
  it('writes the bytes serialize gives over the file, then tells the document they are saved', async () => {
    const { doc, told } = fakeDoc();
    const saveFile = vi.fn(async () => ({ overwritten: false }));
    const result = await new Saver({ saveFile, saveFileAs: vi.fn() }).save(tab(doc));
    expect(result).toEqual({ kind: 'saved' });
    expect(saveFile).toHaveBeenCalledWith('/d/plant.sldd', new Uint8Array([1]));
    expect(told).toEqual(['saved 1']);
  });

  it('keeps on the tab the bytes that landed in its file, and none that did not', async () => {
    const { doc } = fakeDoc();
    const saved = tab(doc);
    await new Saver({ saveFile: async () => ({ overwritten: false }), saveFileAs: vi.fn() }).save(saved);
    expect(saved.bytes).toEqual(new Uint8Array([1]));
    // Written elsewhere (Save As), or not at all: its file holds what it held.
    const elsewhere = vi.fn(async () => ({ path: '/d/copy.sldd', overwritten: false }));
    await new Saver({ saveFile: vi.fn(), saveFileAs: elsewhere }).save(saved, true);
    const refused = vi.fn(async () => Promise.reject(new Error('read-only')));
    await new Saver({ saveFile: refused, saveFileAs: vi.fn() }).save(saved);
    expect(saved.bytes).toEqual(new Uint8Array([1]));
  });

  it('says another program wrote over the save, and still tells the document its bytes landed', async () => {
    const { doc, told } = fakeDoc();
    const result = await new Saver({ saveFile: async () => ({ overwritten: true }), saveFileAs: vi.fn() }).save(tab(doc));
    expect(result).toEqual({ kind: 'saved', overwritten: true });
    expect(told).toEqual(['saved 1']);
  });

  it('tells the document a write that failed was not saved, and says why', async () => {
    const { doc, told } = fakeDoc();
    const saveFile = vi.fn(async () => Promise.reject(new Error('Cannot save "plant.sldd": the file is read-only.')));
    const result = await new Saver({ saveFile, saveFileAs: vi.fn() }).save(tab(doc));
    expect(result).toEqual({ kind: 'not-saved', error: 'Cannot save "plant.sldd": the file is read-only.' });
    expect(told).toEqual(['notSaved 1']);
  });

  it('writes nothing when the document refuses to serialize, and says why', async () => {
    const { doc, told } = fakeDoc({ refuse: 'Read-only: plant.sldd cannot be written.' });
    const saveFile = vi.fn();
    const result = await new Saver({ saveFile, saveFileAs: vi.fn() }).save(tab(doc));
    expect(result).toEqual({ kind: 'not-saved', error: 'Read-only: plant.sldd cannot be written.' });
    expect(saveFile).not.toHaveBeenCalled();
    expect(told).toEqual([]);
  });

  it('writes nothing for a clean document on Save, nor for a document the page does not edit', async () => {
    const saveFile = vi.fn();
    const saver = new Saver({ saveFile, saveFileAs: vi.fn() });
    const clean = fakeDoc({ dirty: false });
    expect(await saver.save(tab(clean.doc))).toEqual({ kind: 'saved' });
    expect(clean.serialize).not.toHaveBeenCalled();
    expect(await saver.save(tab(fakeDoc({ editable: false }).doc))).toEqual({ kind: 'not-saved' });
    expect(await saver.save(tab())).toEqual({ kind: 'not-saved' });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('Save As: onto the file itself is a save; elsewhere the document stays unsaved; cancelled, nothing moves', async () => {
    const { doc, told } = fakeDoc({ dirty: false });
    const answers: (string | null)[] = ['/d/plant.sldd', '/d/copy.sldd', null];
    const saveFileAs = vi.fn(async () => {
      const path = answers.shift() ?? null;
      return path === null ? null : { path, overwritten: false };
    });
    const saver = new Saver({ saveFile: vi.fn(), saveFileAs });
    expect(await saver.save(tab(doc), true)).toEqual({ kind: 'saved' });
    expect(await saver.save(tab(doc), true)).toEqual({ kind: 'saved-as', path: '/d/copy.sldd' });
    expect(await saver.save(tab(doc), true)).toEqual({ kind: 'not-saved' });
    expect(told).toEqual(['saved 1', 'notSaved 2', 'notSaved 3']);
  });

  it("runs one tab's saves one at a time, in the order asked", async () => {
    const { doc } = fakeDoc();
    const order: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const saveFile = vi.fn(async (_p: string, bytes: Uint8Array) => {
      order.push(`start ${bytes[0]}`);
      if (bytes[0] === 1) await first;
      order.push(`end ${bytes[0]}`);
      return { overwritten: false };
    });
    const saver = new Saver({ saveFile, saveFileAs: vi.fn() });
    const t = tab(doc);
    const a = saver.save(t);
    const b = saver.save(t);
    await Promise.resolve();
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });
});

describe('settle', () => {
  const tabs = (...dirty: boolean[]) => dirty.map((d, i) => ({ path: `/d/${i}.mat`, name: `${i}.mat`, doc: fakeDoc({ dirty: d }).doc }));

  it('lets tabs with nothing unsaved close without asking', async () => {
    const confirm = vi.fn();
    expect(await settle(tabs(false, false), confirm, vi.fn())).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks about the unsaved ones only, and keeps them on Cancel, closes them on Don't Save", async () => {
    const confirm = vi.fn(async () => 'cancel' as const);
    const save = vi.fn(async () => true);
    expect(await settle(tabs(true, false, true), confirm, save)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(['0.mat', '2.mat']);
    confirm.mockResolvedValueOnce('discard' as never);
    expect(await settle(tabs(true), confirm, save)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('on Save, saves each in turn, and stops at the first that is not saved', async () => {
    const confirm = vi.fn(async () => 'save' as const);
    const list = tabs(true, true, true);
    const save = vi.fn(async (t: Savable) => t !== list[1]);
    expect(await settle(list, confirm, save)).toBe(false);
    expect(save.mock.calls.map(([t]) => t.name)).toEqual(['0.mat', '1.mat']);
  });
});

describe('closeQuestion: the in-page dialog before unsaved files close', () => {
  it('asks about one file by its name, with Save first and the answers as CloseAnswers', () => {
    const q = closeQuestion(['plant.sldd']);
    expect(q.message).toBe('Do you want to save the changes you made to plant.sldd?');
    expect(q.detail).toBe("Your changes will be lost if you don't save them.");
    expect(q.buttons.map((b) => [b.id, b.label, b.kind ?? 'normal'])).toEqual([
      ['save', 'Save', 'primary'],
      ['discard', "Don't Save", 'danger'],
      ['cancel', 'Cancel', 'normal'],
    ]);
    expect(q.cancelId).toBe('cancel');
    expect(q.buttons.map((b) => closeAnswerOf(b.id))).toEqual(['save', 'discard', 'cancel']);
    expect(closeAnswerOf('anything else')).toBe('cancel');
  });

  it('names every file, one a line, when there are several, and offers Save All', () => {
    const q = closeQuestion(['a.sldd', 'b.mat']);
    expect(q.message).toBe('Do you want to save the changes you made to 2 files?');
    expect(q.detail).toBe("a.sldd\nb.mat\n\nYour changes will be lost if you don't save them.");
    expect(q.buttons[0]!.label).toBe('Save All');
  });
});
