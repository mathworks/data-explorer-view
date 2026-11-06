// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// New in the shell over the browser's own host, as a plain web page runs it: with Chromium's save
// picker, the file the user names opens as a new dictionary, unsaved, and Save writes it in place
// through the picker's handle; with none (Firefox, Safari), an untitled.sldd the page keeps, whose
// Save downloads it. Either way what is written is MATLAB's own new dictionary, with what the user
// added. The File System Access API is test/browserHost/fakeFs.ts's.
//
// Chromium's picker makes the file it names, or empties the one that was there, as it closes, and
// the pickers here do too: a New then discarded leaves MATLAB's new dictionary there, not a file of
// no bytes; and a New onto a file a tab has open gets that file back, written from the tab's copy,
// with no reload of the tab from the emptied file meanwhile.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserHost, type BrowserHost } from '../../src/browser/index.js';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { POLL_MS } from '../../src/browser/watch.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import type { ShellHandle } from '../../src/widgets/app-shell/connect/types.js';
import { asFile, FakeFileHandle } from '../browserHost/fakeFs.js';
import { confirmButton, dirtyTabs, fixture, settled, tabNames, toastTexts, until, valueIn } from './harness.js';

const MATLAB_NEW = new Uint8Array(readFileSync(path.join(import.meta.dirname, '../newFile/fixtures/created_r2027a.sldd')));

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  vi.restoreAllMocks();
});

/** A shell over a browser host whose window has `pickers`, its open files watched. */
function browserPage(pickers: FilePickers): { handle: ShellHandle; host: BrowserHost } {
  const window = Object.assign(new EventTarget(), pickers);
  const host = browserHost({
    window,
    document,
    navigator: { clipboard: { writeText: async () => undefined } },
    onChanged: (p) => handle.fileChanged(p),
  });
  const shell = document.createElement('dex-app-shell');
  document.body.append(shell);
  const handle = connectShell(shell, { host });
  stop.push(() => (handle.dispose(), host.dispose(), shell.remove()));
  return { handle, host };
}

/** A save picker as Chromium's: the file it answers with is made, or emptied, as it resolves, and may be written. */
function savePicker(next: () => FakeFileHandle) {
  return vi.fn(async (_options: { suggestedName?: string }) => {
    const handle = next();
    handle.writeOutside('');
    handle.writePermission = 'granted';
    return asFile(handle);
  });
}

const table = () => document.querySelector<HTMLElement & { rows: { ID: string; Name: { label: string } }[] }>('.doc-panel:not([hidden]) dex-tree-table');

describe('New over the browser host', () => {
  it('with a save picker: opens the file named there, unsaved, which holds a new dictionary already, and saves it in place', async () => {
    const plant = new FakeFileHandle('plant.sldd');
    const showSaveFilePicker = savePicker(() => plant);
    const { handle } = browserPage({ showSaveFilePicker });
    handle.command('new-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    expect(showSaveFilePicker.mock.calls[0]![0].suggestedName).toBe('untitled.sldd');
    expect(tabNames()).toEqual(['plant.sldd']);
    expect(dirtyTabs()).toEqual(['plant.sldd']);
    expect(plant.bytes).toEqual(MATLAB_NEW);
    handle.command('save');
    await until(() => plant.writes.length === 2 && dirtyTabs().length === 0);
    expect(plant.bytes).toEqual(MATLAB_NEW);
  });

  it('a New discarded leaves the new dictionary in the file the picker made, which MATLAB opens', async () => {
    const plant = new FakeFileHandle('plant.sldd');
    const { handle } = browserPage({ showSaveFilePicker: savePicker(() => plant) });
    handle.command('new-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    handle.command('close-tab');
    (await confirmButton("Don't Save")).click();
    await until(() => tabNames().length === 0);
    expect(plant.bytes).toEqual(MATLAB_NEW);
  });

  it("a New onto a file a tab has open writes the file back from the tab's copy, and the tab does not reload", async () => {
    const original = new Uint8Array(readFileSync(fixture('params.sldd')));
    const params = new FakeFileHandle('params.sldd', original);
    const { handle } = browserPage({ showOpenFilePicker: async () => [asFile(params)], showSaveFilePicker: savePicker(() => params.again()) });
    handle.command('open-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    const rows = table()!.rows;
    handle.command('new-file');
    await until(() => toastTexts().length > 0);
    expect(toastTexts()).toEqual(['Could not make params.sldd: it was open in a tab, and the browser emptied it while picking, so its saved copy was written back.']);
    expect(params.bytes).toEqual(original);
    // The watcher has looked since: the emptied file and the write back are no change to the tab.
    await settled(POLL_MS + 300);
    expect(table()!.rows).toBe(rows);
    expect(tabNames()).toEqual(['params.sldd']);
    expect(dirtyTabs()).toEqual([]);
  }, 10_000);

  it('where the copy cannot be written back, the tab holds it unsaved, and Save writes it', async () => {
    const original = new Uint8Array(readFileSync(fixture('params.sldd')));
    const params = new FakeFileHandle('params.sldd', original);
    const emptying = savePicker(() => params.again());
    const { handle } = browserPage({
      showOpenFilePicker: async () => [asFile(params)],
      showSaveFilePicker: async (options) => {
        const picked = await emptying(options);
        params.failWrite = 'The disk is full.';
        return picked;
      },
    });
    handle.command('open-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    handle.command('new-file');
    await until(() => dirtyTabs().length === 1);
    expect(toastTexts()).toContain('Could not make params.sldd: it was open in a tab, and the browser emptied it while picking. Save the tab to write it back.');
    expect(params.bytes.length).toBe(0);
    params.failWrite = undefined;
    handle.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(params.bytes, 'params.sldd', 'Kp')).toBe('1');
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
