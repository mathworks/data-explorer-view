// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Search view, connected: a query searches the names of the files open (read off the rows
// their tables hold, so an unsaved rename is found by its new name) and, when a folder is shown,
// the folder's name index too, each file once: an open file's own names rather than what the
// folder's index read from its disk. A result opens its file, in a preview tab, on its row; the
// line under the box says what is searched.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NameRecord } from '../../src/model/search/nameExtract.js';
import { mergeSearchRecords } from '../../src/widgets/app-shell/connect/searchPane.js';
import { edit, open, previewTabs, rowOf, searchPanel, serveFolderTo, startPage, tempFolder, until, type Page } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

const ask = (query: string) => searchPanel().dispatchEvent(new CustomEvent('dex-search-query', { detail: { query }, bubbles: true, composed: true }));
const found = () => searchPanel().results.map((r) => `${r.entry.name}@${r.entry.sourceLabel}`);
const PLANT = { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx', 'shared_gain.slx': 'shared_gain.slx' };

/** A page showing a folder of PLANT, whose host reads its files from disk. */
function folderPage(): { page: Page; dir: string } {
  const dir = tempFolder('plant', PLANT);
  const page = startPage();
  page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
  stop.push(serveFolderTo(page, dir).dispose);
  return { page, dir };
}

describe('mergeSearchRecords', () => {
  const rec = (name: string, sourceUri: string): NameRecord => ({ name, sourceUri, sourceLabel: sourceUri.split('/').pop()!, kind: 'sldd' });

  it("keeps each file's records once, an open file's over the folder's, sorted by name", () => {
    const open = [rec('Kz', 'file:///w/a.sldd')];
    const folder = [rec('Kp', 'file:///w/a.sldd'), rec('Bus', 'file:///w/b.sldd')];
    expect(mergeSearchRecords(open, folder).map((r) => `${r.name}@${r.sourceLabel}`)).toEqual(['Bus@b.sldd', 'Kz@a.sldd']);
  });
});

describe('the Search view', () => {
  it('searches the names of the files open, and says so', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => searchPanel().scope === 'Open files');
    ask('K');
    await until(() => found().length > 0);
    expect(found()).toEqual(expect.arrayContaining(['Kp@params.sldd', 'Ki@params.sldd']));
    ask('ParamMat');
    await until(() => found().join() === 'ParamMat@ParamMat.mat');
    ask('');
    await until(() => found().length === 0);
  });

  it("ranks the best match first, and finds an open file's entries by their value and their type, saying what each is", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'params.sldd', 'shadow_ws.slx');
    // A name that begins with the query first, then the entries of the file whose name holds it.
    ask('ws');
    await until(() => found().length > 0);
    expect(found()).toEqual(['WsGain@shadow_ws.slx', 'DictOnly@shadow_ws.slx', 'Kp@shadow_ws.slx']);
    // A block by its type, which its row says.
    ask('constant');
    await until(() => found().join() === 'DictOnly@shadow_ws.slx');
    expect(searchPanel().results[0]!.type).toBe('Constant');
    // An entry by its value: Ki is 3.
    ask('3');
    await until(() => found().join() === 'Ki@params.sldd');
    expect(searchPanel().results[0]!.type).toBe('double');
  });

  it("finds an open file's unsaved rename by its new name", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', 'Kz', 'Name');
    await rowOf('params.sldd', 'Kz');
    ask('Kz');
    await until(() => found().join() === 'Kz@params.sldd');
  });

  it('opens a result in a preview tab, on its row', async () => {
    const { dir } = folderPage();
    await until(() => searchPanel().scope === 'Open files and plant');
    ask('WsGain');
    await until(() => found().length === 1);
    const hit = searchPanel().results[0]!;
    searchPanel().dispatchEvent(new CustomEvent('dex-search-open', { detail: { sourceUri: hit.entry.sourceUri, revealName: hit.revealName }, bubbles: true, composed: true }));
    await until(() => previewTabs().join() === 'shadow_ws.slx');
    const model = path.join(dir, 'shadow_ws.slx');
    const table = () => document.querySelector<HTMLElement & { rows: { ID: string; Name: { label: string } }[]; selectedRowIds: string[] }>(`.doc-panel[data-path="${CSS.escape(model)}"] dex-tree-table`);
    await until(() => (table()?.selectedRowIds.length ?? 0) === 1);
    expect(table()!.rows.find((r) => r.ID === table()!.selectedRowIds[0])!.Name.label).toBe('WsGain');
  });

  it("searches the folder shown too, an open file by its own names, saying it is searching while the folder's are read", async () => {
    const { page, dir } = folderPage();
    await until(() => searchPanel().scope === 'Open files and plant');
    const panel = searchPanel();
    ask('gain');
    expect(panel.searching).toBe(true);
    await until(() => found().length === 3);
    // The names that hold the query, then Trim, whose file's name does.
    expect(found()).toEqual(['PlantGain@shared_gain.slx', 'WsGain@shadow_ws.slx', 'Trim@shared_gain.slx']);
    expect(panel.searching).toBe(false);
    // params.sldd open, its Kp renamed and unsaved: the folder's Kp of it is not offered.
    void page.handle.openPaths([path.join(dir, 'params.sldd')]);
    const dict = path.join(dir, 'params.sldd');
    const table = () => document.querySelector<HTMLElement & { rows: { ID: string; Name: { label: string } }[] }>(`.doc-panel[data-path="${CSS.escape(dict)}"] dex-tree-table`);
    await until(() => !!table()?.rows.some((r) => r.Name.label === 'Kp'));
    const kp = table()!.rows.find((r) => r.Name.label === 'Kp')!;
    table()!.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: kp.ID, columnId: 'Name', oldValue: 'Kp', newValue: 'Kz' }, bubbles: true, composed: true }));
    await until(() => !!table()!.rows.some((r) => r.Name.label === 'Kz'));
    ask('Kz');
    await until(() => found().join() === 'Kz@params.sldd');
    ask('Kp');
    await until(() => !panel.searching);
    expect(found()).not.toContain('Kp@params.sldd');
  });
});
