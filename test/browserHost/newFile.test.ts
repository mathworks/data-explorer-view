// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// New in a browser (the browser host's newFile, src/browser/newFile.ts): where the shell's new data
// dictionary goes. With Chromium's save picker, the file the user names there, under a path of the
// host's, which Save then writes in place through the picker's handle (a file the page has a path
// for keeps it, so it is not opened twice). With none (Firefox, Safari), a file the page keeps
// itself, under the name the shell offered, which Save downloads, as Save As does there.
//
// Chromium makes the file its save picker names, or empties the one that was there, as the picker
// closes; the pickers here do the same. A New the user then discarded would leave a file of no bytes,
// which neither MATLAB nor the shell opens, so the host writes the new dictionary there at once: MATLAB's
// own (newFile/fixtures/created_r2027a.sldd). Not over a file the page has open, though, which the
// shell writes back from its tab's copy (test/shell/browserNewFile.test.ts): the emptied file is
// then no change for the watcher to reload the tab from.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { browserHost } from '../../src/browser/host.js';
import { REVOKE_MS } from '../../src/browser/save.js';
import { POLL_MS } from '../../src/browser/watch.js';
import { aborted, asFile, FakeFileHandle } from './fakeFs.js';

const MATLAB_NEW = new Uint8Array(readFileSync(path.join(import.meta.dirname, '../newFile/fixtures/created_r2027a.sldd')));

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const bytesOf = (s: string) => new TextEncoder().encode(s);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A host over a window with `pickers`; `changed` collects what its watcher tells. */
function hostOf(pickers: FilePickers = {}, changed: string[] = []) {
  const window = Object.assign(new EventTarget(), pickers);
  const host = browserHost({ window, document, navigator: {}, onChanged: (p) => void changed.push(p) });
  stop.push(() => host.dispose());
  return host;
}

/**
 * A save picker that answers with `answer` (or rejects with it), and what it was asked. As
 * Chromium's: the file it names is made, or emptied, as it resolves, and the page may write it.
 */
function savePicker(answer: FakeFileHandle | DOMException) {
  return vi.fn(async (_options: { suggestedName?: string }) => {
    if (answer instanceof DOMException) throw answer;
    answer.writeOutside('');
    answer.writePermission = 'granted';
    return asFile(answer);
  });
}

/** The downloads the page starts: each one's file name and bytes. */
function downloads(): { name: string; bytes: () => Promise<string> }[] {
  const made: { name: string; bytes: () => Promise<string> }[] = [];
  const blobs = new Map<string, Blob>();
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href)!;
    made.push({ name: this.download, bytes: async () => text(new Uint8Array(await blob.arrayBuffer())) });
  });
  return made;
}

describe('the browser host makes new files', () => {
  it('with a save picker: where the user says, offering the name the shell gives, MATLAB\'s new dictionary there at once', async () => {
    const plant = new FakeFileHandle('plant.sldd');
    const showSaveFilePicker = savePicker(plant);
    const host = hostOf({ showSaveFilePicker });
    const path = await host.newFile!('untitled.sldd');
    expect(path).toBe('/files/1/plant.sldd');
    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'untitled.sldd',
      types: [{ description: 'SLDD file', accept: { 'application/octet-stream': ['.sldd'] } }],
      excludeAcceptAllOption: true,
    });
    expect(host.files.get(path!)).toEqual({ name: 'plant.sldd', source: { kind: 'handle', handle: plant } });
    // What the picker left (no bytes) is a dictionary at once, so a New discarded leaves one.
    expect(plant.writes).toEqual([MATLAB_NEW]);
    expect(plant.requests).toBe(0);
    // And the shell's Save writes in place.
    await host.saveFile(path!, bytesOf('new'));
    expect(plant.writes.map(text)).toEqual([text(MATLAB_NEW), 'new']);
  });

  it('writes the new dictionary over a file the page has a path for but not open, read from then on through the picker\'s handle', async () => {
    const plant = new FakeFileHandle('plant.sldd', 'old');
    const host = hostOf({ showSaveFilePicker: savePicker(plant.again()) });
    const known = await host.files.addPicked('plant.sldd', { kind: 'handle', handle: asFile(plant) });
    // Opened and closed since: not open now.
    await host.readFile(known);
    host.closeFile!(known);
    const path = await host.newFile!('untitled.sldd');
    expect(path).toBe(known);
    expect((host.files.get(known)!.source as { handle: unknown }).handle).not.toBe(plant);
    expect(host.files.has('/files/2/plant.sldd')).toBe(false);
    expect(plant.bytes).toEqual(MATLAB_NEW);
  });

  it('leaves a file the page has open as the picker left it, and takes that for no change', async () => {
    vi.useFakeTimers();
    const plant = new FakeFileHandle('plant.sldd', 'old');
    const changed: string[] = [];
    const host = hostOf({ showSaveFilePicker: savePicker(plant.again()) }, changed);
    const known = await host.files.addPicked('plant.sldd', { kind: 'handle', handle: asFile(plant) });
    await host.readFile(known);
    expect(await host.newFile!('untitled.sldd')).toBe(known);
    // Emptied by the picker, and not written: the shell writes its tab's copy back.
    expect(text(plant.bytes)).toBe('');
    expect(plant.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(changed).toEqual([]);
  });

  it('writes no dictionary into a file that is not one', async () => {
    const notes = new FakeFileHandle('notes.mat', 'old');
    const host = hostOf({ showSaveFilePicker: savePicker(notes) });
    expect(await host.newFile!('untitled.sldd')).toBe('/files/1/notes.mat');
    expect(notes.writes).toEqual([]);
  });

  it('watches a picked new file, as a file read is, its own saves no change, until its tab closes', async () => {
    vi.useFakeTimers();
    const plant = new FakeFileHandle('plant.sldd');
    const changed: string[] = [];
    const host = hostOf({ showSaveFilePicker: savePicker(plant) }, changed);
    const path = (await host.newFile!('untitled.sldd'))!;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await host.saveFile(path, bytesOf('new'));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([]);
    plant.writeOutside('from outside');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([path]);
    host.closeFile!(path);
    plant.writeOutside('again');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([path]);
  });

  it('answers null when the save picker is cancelled, or another picker is open', async () => {
    expect(await hostOf({ showSaveFilePicker: savePicker(aborted()) }).newFile!('untitled.sldd')).toBeNull();
    const busy = new DOMException('File picker already active.', 'NotAllowedError');
    expect(await hostOf({ showSaveFilePicker: savePicker(busy) }).newFile!('untitled.sldd')).toBeNull();
  });

  it('says to use New again from a click or a key press when the browser shows its picker only then', async () => {
    const refused = new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
    await expect(hostOf({ showSaveFilePicker: savePicker(refused) }).newFile!('untitled.sldd')).rejects.toThrow(
      'The browser shows its save dialog only after a click or a key press. Use New again from one.',
    );
    // Any other failure is the browser's to tell.
    const broken = new DOMException('The request failed.', 'InvalidStateError');
    await expect(hostOf({ showSaveFilePicker: savePicker(broken) }).newFile!('untitled.sldd')).rejects.toBe(broken);
  });

  it('without a save picker: a file the page keeps, under the name offered, whose Save downloads it', async () => {
    vi.useFakeTimers();
    const made = downloads();
    const host = hostOf();
    const path = await host.newFile!('untitled.sldd');
    expect(path).toBe('/files/1/untitled.sldd');
    expect(host.files.get(path!)?.name).toBe('untitled.sldd');
    // The page holds MATLAB's new dictionary as the file until a Save.
    expect(await host.readFile(path!)).toEqual(MATLAB_NEW);
    expect(made).toEqual([]);
    expect(await host.saveFile(path!, bytesOf('one'))).toEqual({ overwritten: false });
    expect(await host.saveFile(path!, bytesOf('two'))).toEqual({ overwritten: false });
    expect(made.map((d) => d.name)).toEqual(['untitled.sldd', 'untitled.sldd']);
    expect(await Promise.all(made.map((d) => d.bytes()))).toEqual(['one', 'two']);
    // The page holds what was saved last, which is what it reads of the file.
    expect(text(await host.readFile(path!))).toBe('two');
    vi.advanceTimersByTime(REVOKE_MS);
    // Two new files offered one name are two files.
    expect(await host.newFile!('untitled.sldd')).toBe('/files/2/untitled.sldd');
  });

  it("downloads a Save of only the files it made: a picked File's Save still says to use Save As", async () => {
    const host = hostOf();
    const path = await host.files.addPicked('a.sldd', { kind: 'bytes', bytes: bytesOf('old') });
    await expect(host.saveFile(path, bytesOf('new'))).rejects.toThrow('The browser lets the page read a.sldd but not write it in place. Use Save As.');
  });
});
