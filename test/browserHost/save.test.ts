// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Saving in a browser (src/browser/save.ts): in place through a handle, once the user lets the page
// write it, and a download for a file the page has no handle to; Save As through the save picker,
// or a download where there is none. Each refusal says
// what to do next, since connectShell shows it to the user, and a Save As onto a file the page has
// keeps that file's path, so it is not opened twice. Ported from data-explorer-app
// test/unit/web/save.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebFiles } from '../../src/browser/files.js';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { REVOKE_MS, saveFile, saveFileAs } from '../../src/browser/save.js';
import { aborted, asFile, FakeFileHandle, fileOf } from './fakeFs.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const bytesOf = (s: string) => new TextEncoder().encode(s);
const text = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder().decode(bytes) : bytes);
const deps = (pickers: FilePickers = {}) => ({ window: pickers, document });

/** The downloads a test's saves make: each blob handed to the browser, and each link clicked. */
function downloads(): { blobs: Blob[]; clicked: HTMLAnchorElement[] } {
  const blobs: Blob[] = [];
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => (blobs.push(blob as Blob), 'blob:saved'));
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  return { blobs, clicked };
}

async function opened(content = 'old') {
  const files = new WebFiles();
  const handle = new FakeFileHandle('plant.sldd', content);
  const path = await files.addPicked('plant.sldd', { kind: 'handle', handle: asFile(handle) });
  return { files, handle, path };
}

describe('saveFile', () => {
  it('writes over a file read through a handle, asking leave to write it once', async () => {
    const { files, handle, path } = await opened();
    expect(await saveFile(files, path, bytesOf('one'))).toEqual({ overwritten: false });
    expect(await saveFile(files, path, bytesOf('two'))).toEqual({ overwritten: false });
    expect(handle.writes.map(text)).toEqual(['one', 'two']);
    expect(handle.requests).toBe(1);
    expect(files.get(path)?.source).toEqual({ kind: 'handle', handle });
    expect(text(await files.bytes(path))).toBe('two');
  });

  it('writes nothing, and says to use Save As, when the user does not let it write', async () => {
    const { files, handle, path } = await opened();
    handle.answer = 'denied';
    await expect(saveFile(files, path, bytesOf('one'))).rejects.toThrow(/not allowed to write plant\.sldd\. Use Save As/);
    expect(handle.writes).toEqual([]);
  });

  it('says to save again from a click or a key press when the browser asks only then', async () => {
    const { files, handle, path } = await opened();
    handle.requestError = new DOMException('User activation is required to request permissions.', 'SecurityError');
    await expect(saveFile(files, path, bytesOf('one'))).rejects.toThrow(
      'The browser asks about writing plant.sldd only after a click or a key press. Save again from a click or a key press, or use Save As.',
    );
    expect(handle.writes).toEqual([]);
    // Any other refusal is the browser's to tell.
    const broken = new DOMException('The request failed.', 'InvalidStateError');
    handle.requestError = broken;
    await expect(saveFile(files, path, bytesOf('one'))).rejects.toBe(broken);
  });

  it('downloads a file the page may read but not write, under its name, and holds what it downloaded', async () => {
    // A File (Firefox, Safari, a drop with no handles) or bytes of the app's own: there is nothing to
    // write in place, so the bytes go to the browser as a download, which marks the document saved
    // (the user has the file), and the page reads the file as downloaded from then on, so the tab,
    // or the file opened again, shows what was saved. The file on disk is as it was.
    vi.useFakeTimers();
    const { blobs, clicked } = downloads();
    const files = new WebFiles();
    for (const source of [{ kind: 'file' as const, file: fileOf('a.sldd', 'old') }, { kind: 'bytes' as const, bytes: bytesOf('old') }]) {
      const path = await files.addPicked('a.sldd', source);
      expect(await saveFile(files, path, bytesOf('new'), document)).toEqual({ overwritten: false, downloaded: true });
      expect(clicked.at(-1)!.download).toBe('a.sldd');
      expect(text(new Uint8Array(await blobs.at(-1)!.arrayBuffer()))).toBe('new');
      expect(text(await files.bytes(path))).toBe('new');
      expect(files.get(path)?.name).toBe('a.sldd');
    }
    await expect(saveFile(files, '/files/9/other.sldd', bytesOf('new'), document)).rejects.toThrow(/Not a file this page has open/);
    expect(clicked).toHaveLength(2);
  });

  it('leaves the file as it was when the write fails', async () => {
    const { files, handle, path } = await opened();
    handle.failWrite = 'The disk is full.';
    await expect(saveFile(files, path, bytesOf('new'))).rejects.toThrow(/disk is full/);
    expect(text(handle.bytes)).toBe('old');
  });
});

describe('saveFileAs', () => {
  it('writes where the save picker says, and opens that file under a path of its own', async () => {
    const { files, handle, path } = await opened();
    const copy = new FakeFileHandle('copy.sldd');
    const showSaveFilePicker = vi.fn(async () => asFile(copy));
    expect(await saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker }))).toEqual({ path: '/files/2/copy.sldd', overwritten: false });
    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'plant.sldd',
      types: [{ description: 'SLDD file', accept: { 'application/octet-stream': ['.sldd'] } }],
    });
    expect(text(copy.bytes)).toBe('saved');
    expect(text(handle.bytes)).toBe('old');
    expect(files.get('/files/2/copy.sldd')?.source).toEqual({ kind: 'handle', handle: copy });
  });

  it('keeps the open file\'s path when the user saves onto it, read from then on through the save picker\'s handle', async () => {
    const { files, handle, path } = await opened();
    // The save picker answers with a handle object of its own to the same file.
    const same = handle.again();
    expect(await saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker: async () => asFile(same) }))).toEqual({ path, overwritten: false });
    expect(text(handle.bytes)).toBe('saved');
    expect(files.get(path)?.source).toEqual({ kind: 'handle', handle: same });
    expect(files.has('/files/2/plant.sldd')).toBe(false);
  });

  it('answers with the path of another open file the user saves onto', async () => {
    const { files, path } = await opened();
    const other = new FakeFileHandle('other.sldd', 'other');
    const otherPath = await files.addPicked('other.sldd', { kind: 'handle', handle: asFile(other) });
    expect(await saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker: async () => asFile(other.again()) }))).toEqual({
      path: otherPath,
      overwritten: false,
    });
    expect(text(other.bytes)).toBe('saved');
  });

  it('answers null when the save picker is cancelled, or another picker is open', async () => {
    const { files, handle, path } = await opened();
    expect(await saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker: async () => Promise.reject(aborted()) }))).toBeNull();
    const busy = new DOMException('File picker already active.', 'NotAllowedError');
    expect(await saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker: async () => Promise.reject(busy) }))).toBeNull();
    expect(handle.writes).toEqual([]);
    expect(files.has('/files/2/plant.sldd')).toBe(false);
  });

  it('says to use Save As again from a click or a key press when the browser shows its picker only then', async () => {
    const { files, path } = await opened();
    const refused = new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
    await expect(saveFileAs(files, path, bytesOf('saved'), deps({ showSaveFilePicker: async () => Promise.reject(refused) }))).rejects.toThrow(
      'The browser shows its save dialog only after a click or a key press. Use Save As again from one.',
    );
  });

  it('with no save picker, downloads the bytes under the file\'s name, and the document is saved', async () => {
    vi.useFakeTimers();
    const files = new WebFiles();
    const path = await files.addPicked('a.sldd', { kind: 'file', file: fileOf('a.sldd', 'old') });
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => (blobs.push(blob as Blob), 'blob:saved'));
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    expect(await saveFileAs(files, path, bytesOf('saved'), deps())).toEqual({ path, overwritten: false, downloaded: true });
    // As a Save's download: the page holds what it downloaded.
    expect(text(await files.bytes(path))).toBe('saved');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('a.sldd');
    expect(clicked[0].href).toBe('blob:saved');
    expect(clicked[0].isConnected).toBe(false);
    expect(text(new Uint8Array(await blobs[0].arrayBuffer()))).toBe('saved');
    // The URL is kept while the browser reads it, then let go.
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_MS);
    expect(revoke).toHaveBeenCalledWith('blob:saved');
  });
});
