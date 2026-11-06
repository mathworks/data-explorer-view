// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell over the browser's own host (browserHost, src/browser/), as a plain web page runs it:
// Open File asks the window's picker, the file opens in a tab, and Save writes it in place through
// its handle. The File System Access API is test/browserHost/fakeFs.ts's.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { browserHost, type BrowserHost } from '../../src/browser/index.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import type { ShellHandle } from '../../src/widgets/app-shell/connect/types.js';
import { asFile, FakeFileHandle } from '../browserHost/fakeFs.js';
import { dirtyTabs, fixture, textOf, until, valueIn } from './harness.js';

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
});
