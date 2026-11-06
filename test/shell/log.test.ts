// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Log view, connected: a line for what the shell did and what went wrong. Files opened, and
// those that could not be; saves, and those that failed; what a document refused; the workspace's
// notices; a change on disk and what was done about it; the folder shown, or why it could not be;
// and the errors the shell caught (a picker that was refused). Each at its level: what happened is
// info, what the user should look at a warning, what failed an error.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { portFromMessagePort } from '../../src/model/source/ports.js';
import { serveFolder, type FolderReads } from '../../src/serve/index.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import { at, changedOutside, choose, dirtyTabs, edit, folderReads, logPanel, menuOn, open, rowOf, serveFolderTo, startPage, tempFolder, until, type Page } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };

/** The lines the log panel is given from now on, as `level message`. */
function logged(): string[] {
  const lines: string[] = [];
  const append = logPanel().appendEntry.bind(logPanel());
  logPanel().appendEntry = (entry: LogEntry) => (lines.push(`${entry.level} ${entry.message}`), append(entry));
  return lines;
}

async function outside(page: Page, file: string, row: string, value: string): Promise<void> {
  page.main.files.set(at(file), await changedOutside(page.main.files.get(at(file))!, file, row, value));
  page.main.changed(at(file));
}

describe('the Log view', () => {
  it('says which files opened, and why one did not', async () => {
    const page = startPage(FILES);
    const lines = logged();
    void page.handle.openPaths([at('params.sldd'), at('gone.sldd')]);
    await until(() => lines.length === 2);
    expect(lines).toEqual(['info Opened params.sldd', `error Failed to open gone.sldd: ENOENT: no such file, open '${at('gone.sldd')}'`]);
  });

  it('says what was saved, and why a save failed', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const lines = logged();
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.failSave = 'The disk is full.';
    page.command('save');
    await until(() => lines.length === 1);
    page.main.failSave = undefined;
    document.querySelector('dex-error-dialog')!.close();
    page.command('save');
    await until(() => lines.length === 2);
    expect(lines).toEqual(['error Could not save params.sldd: The disk is full.', 'info Saved params.sldd']);
  });

  it("says what a document refused, and the workspace's notices", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    const lines = logged();
    // A rename onto a name the dictionary has already.
    await edit('params.sldd', 'Kp', 'Ki', 'Name');
    await until(() => lines.length >= 1);
    expect(lines[0]).toMatch(/^warning .*Ki/);
    // A cut whose original was renamed before the paste: the workspace's warning.
    await menuOn('params.sldd', 'Uo');
    choose('cut');
    await edit('params.sldd', 'Uo', 'Uo2', 'Name');
    await rowOf('params.sldd', 'Uo2');
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('paste');
    await until(() => lines.some((l) => l.includes('the original in params.sldd could not be removed')));
    expect(lines.find((l) => l.includes('could not be removed'))!.startsWith('warning ')).toBe(true);
  });

  it('says a file changed on disk, and what was done about it', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    const lines = logged();
    await outside(page, 'ParamMat.mat', 'ParamMat', '[9 9 9; 9 9 9]');
    await until(() => lines.length === 1);
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false);
    await outside(page, 'params.sldd', 'Ki', '30');
    await until(() => lines.length === 2);
    page.main.reloadAnswers.push(true);
    await outside(page, 'params.sldd', 'Ki', '31');
    await until(() => lines.length === 3);
    expect(lines).toEqual([
      'info ParamMat.mat changed on disk: reloaded',
      'warning params.sldd changed on disk: its unsaved edits kept over the change',
      'info params.sldd changed on disk: reloaded, its unsaved edits dropped',
    ]);
  });

  it('says which folder is shown, and why one could not be read', async () => {
    const dir = tempFolder('plant', { 'params.sldd': 'params.sldd' });
    const page = startPage();
    page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
    const lines = logged();
    stop.push(serveFolderTo(page, dir).dispose);
    await until(() => lines.length === 1);
    expect(lines[0]).toBe(`info Showing the folder ${dir}`);
    // A folder the host cannot list.
    const { port1, port2 } = new MessageChannel();
    const refusing: FolderReads = { files: { list: async () => Promise.reject(new Error('EACCES: permission denied')) }, reader: folderReads(dir).reader };
    const served = serveFolder(refusing, portFromMessagePort(port1));
    stop.push(() => (served.dispose(), port1.close()));
    page.handle.showFolder(path.join(dir, 'locked'), port2);
    await until(() => lines.some((l) => l.startsWith('error This folder could not be read')));
    expect(lines.find((l) => l.startsWith('error'))).toContain('EACCES: permission denied');
  });

  it('says what the shell caught: a picker the host could not show', async () => {
    const page = startPage(FILES);
    const lines = logged();
    page.host.pickFiles = () => Promise.reject(Object.assign(new Error('Not allowed now.'), { name: 'SecurityError' }));
    page.command('open-file');
    await until(() => lines.length === 1);
    expect(lines).toEqual(['error Could not open a file: Not allowed now.']);
  });
});
