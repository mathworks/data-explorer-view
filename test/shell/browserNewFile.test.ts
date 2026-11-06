// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// New in the shell over the browser's own host, as a plain web page runs it: with Chromium's save
// picker, the file the user names opens as a new dictionary, unsaved, and Save writes it in place
// through the picker's handle; with none (Firefox, Safari), an untitled.sldd the page keeps, whose
// Save downloads it. Either way what is written is MATLAB's own new dictionary, with what the user
// added. The File System Access API is test/browserHost/fakeFs.ts's.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserHost, type BrowserHost } from '../../src/browser/index.js';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import type { ShellHandle } from '../../src/widgets/app-shell/connect/types.js';
import { asFile, FakeFileHandle } from '../browserHost/fakeFs.js';
import { dirtyTabs, tabNames, until } from './harness.js';

const MATLAB_NEW = new Uint8Array(readFileSync(path.join(import.meta.dirname, '../newFile/fixtures/created_r2027a.sldd')));

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  vi.restoreAllMocks();
});

/** A shell over a browser host whose window has `pickers`. */
function browserPage(pickers: FilePickers): { handle: ShellHandle; host: BrowserHost } {
  const window = Object.assign(new EventTarget(), pickers);
  const host = browserHost({ window, document, navigator: { clipboard: { writeText: async () => undefined } } });
  const shell = document.createElement('dex-app-shell');
  document.body.append(shell);
  const handle = connectShell(shell, { host });
  stop.push(() => (handle.dispose(), host.dispose(), shell.remove()));
  return { handle, host };
}

const table = () => document.querySelector<HTMLElement & { rows: { ID: string }[] }>('.doc-panel dex-tree-table');

describe('New over the browser host', () => {
  it("with a save picker: opens the file named there, unsaved, and saves it in place", async () => {
    const plant = new FakeFileHandle('plant.sldd');
    plant.writePermission = 'granted';
    const showSaveFilePicker = vi.fn(async (_options: { suggestedName?: string }) => asFile(plant));
    const { handle } = browserPage({ showSaveFilePicker });
    handle.command('new-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    expect(showSaveFilePicker.mock.calls[0]![0].suggestedName).toBe('untitled.sldd');
    expect(tabNames()).toEqual(['plant.sldd']);
    expect(dirtyTabs()).toEqual(['plant.sldd']);
    expect(plant.writes).toEqual([]);
    handle.command('save');
    await until(() => plant.writes.length === 1 && dirtyTabs().length === 0);
    expect(plant.bytes).toEqual(MATLAB_NEW);
  });

  it('with none: an untitled.sldd the page keeps, whose Save downloads it', async () => {
    const downloaded: string[] = [];
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((blob = b as Blob), 'blob:new'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(this.download);
    });
    const { handle } = browserPage({});
    handle.command('new-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    expect(tabNames()).toEqual(['untitled.sldd']);
    expect(dirtyTabs()).toEqual(['untitled.sldd']);
    handle.command('save');
    await until(() => downloaded.length === 1 && dirtyTabs().length === 0);
    expect(downloaded).toEqual(['untitled.sldd']);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(MATLAB_NEW);
  });
});
