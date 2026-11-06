// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell over the browser's own host (browserHost, src/browser/), as a plain web page runs it:
// Open File asks the window's picker, the file opens in a tab, and Save writes it in place through
// its handle, or downloads a file the page has no handle to. And the app's own files fetched at different times into one group (the web version's
// samples, and the files its address names): a link from a model fetched first finds the
// dictionary fetched after it, where files given to the host one at a time never could, each in a
// folder of its own. The File System Access API is test/browserHost/fakeFs.ts's.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserHost, type BrowserHost } from '../../src/browser/index.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import type { ShellHandle } from '../../src/widgets/app-shell/connect/types.js';
import { asFile, FakeFileHandle } from '../browserHost/fakeFs.js';
import { dirtyTabs, fixture, tabNames, textOf, toastTexts, until, valueIn } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
});

/** A shell over a browser host whose window's picker answers with `picked`. */
function browserPage(picked: FakeFileHandle[]): { handle: ShellHandle; host: BrowserHost } {
  const window = Object.assign(new EventTarget(), { showOpenFilePicker: async () => picked.map(asFile) });
  const host = browserHost({ window, document, navigator: { clipboard: { writeText: async () => undefined } } });
  const shell = document.createElement('dex-app-shell');
  document.body.append(shell);
  const handle = connectShell(shell, { host });
  stop.push(() => (handle.dispose(), host.dispose(), shell.remove()));
  return { handle, host };
}

const table = () => document.querySelector<HTMLElement & { rows: { ID: string; Name: { label: string } }[] }>('.doc-panel dex-tree-table');
type Table = HTMLElement & { rows: { ID: string; Name: { label: string } }[]; selectedRowIds: string[]; banners?: { error?: string } };
const tableAt = (path: string) => document.querySelector<Table>(`.doc-panel[data-path="${path}"] dex-tree-table`);
const fetched = (name: string) => ({ name, source: { kind: 'bytes' as const, bytes: new Uint8Array(readFileSync(fixture(name))) } });

/** Follow the model's link to Uo in the dictionary beside it, as a click on its Usage does. */
async function followUo(model: string): Promise<void> {
  await until(() => !!tableAt(model)?.rows.some((r) => r.Name.label === 'DictOnly'));
  tableAt(model)!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: 'Uo@params.sldd' }, bubbles: true, composed: true }));
  await until(() => tabNames().includes('params.sldd'));
}

describe('the shell over the browser host', () => {
  it('opens a picked file and saves it in place', async () => {
    const params = new FakeFileHandle('params.sldd', new Uint8Array(readFileSync(fixture('params.sldd'))));
    const { handle } = browserPage([params]);
    handle.command('open-file');
    await until(() => (table()?.rows.length ?? 0) > 0);
    const kp = table()!.rows.find((r) => r.Name.label === 'Kp')!;
    table()!.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: kp.ID, columnId: 'Value', oldValue: '1', newValue: '5' }, bubbles: true, composed: true }));
    await until(() => dirtyTabs().length === 1);
    handle.command('save');
    await until(() => params.writes.length === 1 && dirtyTabs().length === 0);
    expect(await valueIn(params.bytes, 'params.sldd', 'Kp')).toBe('5');
    expect(textOf(table()!.rows.find((r) => r.Name.label === 'Kp') as never)).toBe('5');
  });

  it('downloads a file it has no handle to at Save, says so, and marks the tab saved', async () => {
    // A file the page holds as bytes, as the app's own samples are (and as a Firefox pick is a File):
    // nothing to write in place, so the Save is a download under the file's name. The user has the
    // file: the tab is saved, and the toast says where it went rather than "Saved".
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:saved');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    const { handle, host } = browserPage([]);
    const [path] = await host.files.addToGroup('samples', [fetched('params.sldd')]);
    await handle.openPaths([path!]);
    await until(() => (table()?.rows.length ?? 0) > 0);
    const kp = table()!.rows.find((r) => r.Name.label === 'Kp')!;
    table()!.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: kp.ID, columnId: 'Value', oldValue: '1', newValue: '5' }, bubbles: true, composed: true }));
    await until(() => dirtyTabs().length === 1);
    handle.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(downloads).toEqual(['params.sldd']);
    expect(toastTexts()).toContain('Downloaded params.sldd');
    expect(toastTexts()).not.toContain('Saved params.sldd');
    // The page holds what it downloaded: the file read again is the one saved.
    expect(await valueIn(await host.readFile(path!), 'params.sldd', 'Kp')).toBe('5');
    vi.restoreAllMocks();
  });

  it("follows a link into a file the app added to the model's group later, as it would into one fetched with it", async () => {
    const { handle, host } = browserPage([]);
    const [model] = await host.files.addToGroup('site', [fetched('shadow_ws.slx')]);
    await handle.openPaths([model!]);
    // Fetched once the model is open: the samples, say, after a file the address named.
    const [dictionary] = await host.files.addToGroup('site', [fetched('params.sldd')]);
    await followUo(model!);
    await until(() => (tableAt(dictionary!)?.selectedRowIds.length ?? 0) > 0);
    const uo = tableAt(dictionary!)!.rows.find((r) => r.Name.label === 'Uo')!;
    expect(tableAt(dictionary!)!.selectedRowIds).toEqual([uo.ID]);
  });

  it('cannot follow it into a file added on its own, in a folder of its own', async () => {
    const { handle, host } = browserPage([]);
    const model = await host.files.addPicked('shadow_ws.slx', fetched('shadow_ws.slx').source);
    await handle.openPaths([model]);
    await host.files.addPicked('params.sldd', fetched('params.sldd').source);
    await followUo(model);
    const beside = `${model.slice(0, model.lastIndexOf('/'))}/params.sldd`;
    await until(() => !!tableAt(beside)?.banners?.error);
    expect(tableAt(beside)!.banners!.error).toMatch(/^Failed to open params\.sldd: ENOENT/);
  });
});
