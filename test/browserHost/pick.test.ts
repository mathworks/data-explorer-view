// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Opening files and folders in a browser (src/browser/pick.ts): Chromium's pickers, and the hidden
// file input elsewhere, each answered as the browser answers them (cancelled, another picker open,
// no click or key press behind the call). A dialog asked for when the browser will not show it
// leaves a promise that never settles and an input in the page, so the gesture rule is held here.
// Ported from data-explorer-app test/unit/web/pick.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebFiles } from '../../src/browser/files.js';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { pickDirectory, pickFiles, SUPPORTED } from '../../src/browser/pick.js';
import { aborted, asDir, asFile, fakeDir, FakeFileHandle, fileOf, inputFilesOf } from './fakeFs.js';

/** The file inputs whose dialog was asked for, in turn. */
let opened: HTMLInputElement[] = [];
beforeEach(() => {
  opened = [];
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    opened.push(this);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const deps = (pickers: FilePickers = {}, isActive?: boolean) => ({
  window: pickers,
  document,
  navigator: isActive === undefined ? {} : { userActivation: { isActive } },
});

/** Answer the open input's dialog with `files`, as the browser does when the user chooses them. */
function choose(files: File[]): void {
  const input = opened.at(-1)!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}

const cancel = () => opened.at(-1)!.dispatchEvent(new Event('cancel'));

describe('pickFiles', () => {
  it('asks Chromium\'s picker for several data files, and names them as one pick', async () => {
    const a = new FakeFileHandle('a.sldd');
    const b = new FakeFileHandle('b.mat');
    const showOpenFilePicker = vi.fn(async () => [asFile(a), asFile(b)]);
    const files = new WebFiles();
    expect(await pickFiles(files, deps({ showOpenFilePicker }))).toEqual(['/files/1/a.sldd', '/files/1/b.mat']);
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      multiple: true,
      types: [{ description: 'Simulink data files', accept: { 'application/octet-stream': ['.sldd', '.mat', '.prj', '.slx', '.mdl'] } }],
    });
    expect(files.get('/files/1/b.mat')?.source).toEqual({ kind: 'handle', handle: b });
    expect(opened).toEqual([]);
  });

  it('answers none when the picker is cancelled, or another picker is open, and passes any other failure on', async () => {
    const files = new WebFiles();
    expect(await pickFiles(files, deps({ showOpenFilePicker: async () => Promise.reject(aborted()) }))).toEqual([]);
    const busy = new DOMException('File picker already active.', 'NotAllowedError');
    expect(await pickFiles(files, deps({ showOpenFilePicker: async () => Promise.reject(busy) }))).toEqual([]);
    const broken = new TypeError('Extension .sldd is not allowed.');
    await expect(pickFiles(files, deps({ showOpenFilePicker: async () => Promise.reject(broken) }))).rejects.toBe(broken);
  });

  it('gives a file picked again the path it has, so it opens in its tab', async () => {
    const a = new FakeFileHandle('a.sldd');
    const files = new WebFiles();
    const [first] = await pickFiles(files, deps({ showOpenFilePicker: async () => [asFile(a)] }));
    expect(await pickFiles(files, deps({ showOpenFilePicker: async () => [asFile(a.again())] }))).toEqual([first]);
  });

  it('asks for no dialog the browser would not show: none but after a click or a key press', async () => {
    const files = new WebFiles();
    const showOpenFilePicker = vi.fn(async () => []);
    const message = 'The browser shows its file dialog only after a click or a key press. Open the file again from one.';
    await expect(pickFiles(files, deps({ showOpenFilePicker }, false))).rejects.toThrow(message);
    await expect(pickFiles(files, deps({}, false))).rejects.toThrow(message);
    expect(showOpenFilePicker).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
    expect(document.querySelector('input')).toBeNull();
    // A picker asked anyway, where the browser does not say, refuses the same way.
    const refused = new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
    await expect(pickFiles(files, deps({ showOpenFilePicker: async () => Promise.reject(refused) }))).rejects.toThrow(message);
    // After one, it asks.
    await pickFiles(files, deps({ showOpenFilePicker }, true));
    expect(showOpenFilePicker).toHaveBeenCalledTimes(1);
  });

  it('falls back to a hidden file input that takes several of the files core reads', async () => {
    const files = new WebFiles();
    const picked = pickFiles(files, deps());
    const input = opened[0];
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(SUPPORTED.join(','));
    expect(input.accept).toBe('.sldd,.mat,.prj,.slx,.mdl');
    expect(input.hidden).toBe(true);
    expect(input.isConnected).toBe(true);
    const a = fileOf('a.sldd', 'one');
    choose([a, fileOf('b.slx')]);
    expect(await picked).toEqual(['/files/1/a.sldd', '/files/1/b.slx']);
    expect(files.get('/files/1/a.sldd')?.source).toEqual({ kind: 'file', file: a });
    expect(input.isConnected).toBe(false);
  });

  it('answers none when the input\'s dialog is cancelled, or closed with nothing chosen', async () => {
    const files = new WebFiles();
    const cancelled = pickFiles(files, deps());
    cancel();
    expect(await cancelled).toEqual([]);
    expect(opened[0].isConnected).toBe(false);
    const empty = pickFiles(files, deps());
    choose([]);
    expect(await empty).toEqual([]);
  });
});

describe('pickDirectory', () => {
  it('asks Chromium\'s directory picker for a handle; none when it is cancelled, or another picker is open', async () => {
    const proj = fakeDir('proj');
    expect(await pickDirectory(deps({ showDirectoryPicker: async () => asDir(proj) }))).toEqual({ kind: 'handle', handle: proj });
    expect(await pickDirectory(deps({ showDirectoryPicker: async () => Promise.reject(aborted()) }))).toBeNull();
    const busy = new DOMException('File picker already active.', 'NotAllowedError');
    expect(await pickDirectory(deps({ showDirectoryPicker: async () => Promise.reject(busy) }))).toBeNull();
    expect(opened).toEqual([]);
  });

  it('asks for no folder dialog but after a click or a key press', async () => {
    const message = 'The browser shows its file dialog only after a click or a key press. Open the folder again from one.';
    const showDirectoryPicker = vi.fn(async () => asDir(fakeDir('proj')));
    await expect(pickDirectory(deps({ showDirectoryPicker }, false))).rejects.toThrow(message);
    await expect(pickDirectory(deps({}, false))).rejects.toThrow(message);
    expect(showDirectoryPicker).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it('falls back to a webkitdirectory input, whose files are those the browser lists in the folder', async () => {
    const picked = pickDirectory(deps());
    const input = opened[0];
    expect(input.webkitdirectory).toBe(true);
    expect(input.type).toBe('file');
    const chosen = inputFilesOf('proj', { 'a.sldd': '', 'sub/b.slx': '' });
    choose(chosen);
    // Each by its path in the folder, the folder's own name taken off.
    expect(await picked).toEqual({ kind: 'list', root: 'proj', files: [{ rel: 'a.sldd', file: chosen[0] }, { rel: 'sub/b.slx', file: chosen[1] }] });
    expect(input.isConnected).toBe(false);
  });

  it('answers none for a cancelled input, or a folder with no files in it', async () => {
    const cancelled = pickDirectory(deps());
    cancel();
    expect(await cancelled).toBeNull();
    const empty = pickDirectory(deps());
    choose([]);
    expect(await empty).toBeNull();
  });
});
