// Copyright 2026 The MathWorks, Inc.
//
// `TableSource.raw` on the documents of a workspace that edits them (`createWorkspace({ editing:
// true })`), which is how an app that edits opens every dictionary, MAT-file and model: each one's
// table is an editing engine's view (edit/jsonView.ts, edit/binaryView.ts, edit/matEngine.ts),
// and each answers `raw` through the same rule as a read-only document (raw/rawOfRow.ts).
//
// Two promises. Before any edit, every row answers what the same row of the same file answers
// read-only, so the Raw pane does not change with the workspace's mode. After an edit, it answers
// for the document as edited, and after its undo as it was: the pane shows what a save would
// write, never the file as it was first read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { createWorkspace, isEditable, type Doc, type EditableTableSource, type Workspace } from '../src/model/index.js';
import { NO_RAW_DATA, type RawView } from '../src/model/raw/rawView.js';

const fixture = (rel: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url))));
const matFixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`../test-integration/fixtures/mat/${name}`, import.meta.url))));
// A model MATLAB wrote, whose Model Workspace takes edits (shadow_ws.slx, hand-built, opens read-only).
const modelFixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./modelEngine/fixtures/${name}`, import.meta.url))));

const spaces: Workspace[] = [];
afterEach(() => {
  for (const ws of spaces.splice(0)) ws.dispose();
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

function workspace(editing: boolean): Workspace {
  const ws = createWorkspace({ editing });
  spaces.push(ws);
  return ws;
}

async function open(bytes: Uint8Array, name: string, editing = true): Promise<Doc> {
  const doc = await workspace(editing).open(bytes, name);
  await doc.table.open();
  return doc;
}

const raw = (doc: Doc, rowId: string): Promise<RawView> => doc.table.raw!(rowId);
const textOf = async (doc: Doc, rowId: string): Promise<string> => {
  const view = await raw(doc, rowId);
  return view.format === 'json' || view.format === 'xml' || view.format === 'text' ? view.text : JSON.stringify(view);
};
// An edit of a cell, waited for where the engine writes it later.
async function edit(doc: Doc, rowId: string, columnId: string, oldValue: string, newValue: string): Promise<void> {
  expect(isEditable(doc.table)).toBe(true);
  await (doc.table as EditableTableSource).edit({ rowId, columnId, oldValue, newValue });
}
// An undo, and the turns its text's undo and the repaint after it take (a JSON dictionary's is
// the text store's, which settles after the call returns).
async function undo(doc: Doc): Promise<void> {
  (doc.table as EditableTableSource).undo();
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
// A model's rows are under the srcId its engine registers it by (`binedit:` and the uri), and a
// read-only model's under its uri: the same row, by either.
const sameRow = (id: string): string => id.replace(/^binedit:(?=file:\/\/\/[^/]*\.slx\b)/, '');

describe('before any edit, every row answers what it answers read-only', () => {
  const cases: [string, () => Uint8Array][] = [
    ['params.sldd', () => fixture('params.sldd')],
    ['rt_text.sldd', () => fixture('rt_text.sldd')],
    ['rt_bin.sldd', () => fixture('rt_bin.sldd')],
    ['object_array_binary.sldd', () => fixture('object_array_binary.sldd')],
    ['nd_numeric.mat', () => fixture('nd_numeric.mat')],
    ['cases.mat', () => matFixture('cases.mat')],
    ['shadow_ws.slx', () => fixture('shadow_ws.slx')],
    ['mcosfix.slx', () => fixture('mcos/mcosfix.slx')],
    ['slxcases.slx', () => modelFixture('slxcases.slx')],
  ];

  it.each(cases)('%s', async (name, bytes) => {
    const edited = await open(bytes(), name);
    const read = await open(bytes(), name, false);
    expect(edited.editable).toBe(true);
    const rows = (await edited.table.open()).rows.map((r) => r.ID);
    const readRows = (await read.table.open()).rows.map((r) => r.ID);
    expect(rows.map(sameRow)).toEqual(readRows);
    expect(rows.length).toBeGreaterThan(0);
    for (const [i, id] of [...rows, edited.uri, 'not-a-row'].entries()) {
      expect(await raw(edited, id), id).toEqual(await raw(read, readRows[i] ?? id));
    }
  });
});

describe('after an edit, the document as edited; after its undo, as it was', () => {
  it('a JSON dictionary', async () => {
    const doc = await open(fixture('params.sldd'), 'params.sldd');
    const id = 'file:///params.sldd/design/Kp';
    expect(JSON.parse(await textOf(doc, id)).value).toBe(1);
    await edit(doc, id, 'Value', '1', '5');
    expect(JSON.parse(await textOf(doc, id)).value).toBe(5);
    await edit(doc, id, 'Name', 'Kp', 'Kq');
    expect(JSON.parse(await textOf(doc, 'file:///params.sldd/design/Kq')).name).toBe('Kq');
    expect(await raw(doc, id)).toEqual({ format: 'none', reason: NO_RAW_DATA });
    await undo(doc);
    expect(JSON.parse(await textOf(doc, id))).toMatchObject({ name: 'Kp', value: 5 });
    await undo(doc);
    expect(JSON.parse(await textOf(doc, id)).value).toBe(1);
  });

  it('a compressed dictionary', async () => {
    const doc = await open(fixture('rt_bin.sldd'), 'rt_bin.sldd');
    const entry = 'binedit:file:///rt_bin.sldd/other/gadget';
    await edit(doc, `${entry}/Wheels`, 'Value', '4', '6');
    expect(await textOf(doc, `${entry}/Wheels`)).toBe('<P Name="Wheels" Class="double">6.0</P>');
    expect((await textOf(doc, entry)).split('\n')).toContain('            <P Name="Wheels" Class="double">6.0</P>');
    await undo(doc);
    expect(await textOf(doc, `${entry}/Wheels`)).toBe('<P Name="Wheels" Class="double">4.0</P>');
  });

  it('a MAT-file: its bytes while they are what it holds, its record once it is edited', async () => {
    const doc = await open(matFixture('cases.mat'), 'cases.mat');
    const id = 'binedit:file:///cases.mat/scalarD';
    const before = await raw(doc, id);
    expect(before.format).toBe('hex');
    await edit(doc, id, 'Value', '', '42');
    // Core keeps the bytes it read, which no longer spell the variable: what a save writes is its record.
    expect(JSON.parse(await textOf(doc, id))).toEqual({ name: 'scalarD', metadata: null, value: 42 });
    await undo(doc);
    expect(await raw(doc, id)).toEqual(before);
  });

  it('a MAT-file: a variable whose element was edited', async () => {
    const doc = await open(fixture('nd_numeric.mat'), 'nd_numeric.mat');
    const id = 'binedit:file:///nd_numeric.mat/Mat';
    const before = await raw(doc, id);
    await edit(doc, `${id}/1`, 'Value', '1', '9');
    expect(await textOf(doc, `${id}/1`)).toBe('9');
    expect(JSON.parse(await textOf(doc, id)).value._value).toContain('[[9.0, 2.0, 3.0]');
    await undo(doc);
    expect(await raw(doc, id)).toEqual(before);
  });

  it("a model's workspace variable", async () => {
    const doc = await open(modelFixture('slxcases.slx'), 'slxcases.slx');
    const id = 'binedit:file:///slxcases.slx/workspace/tau';
    const before = await raw(doc, id);
    expect(before.format).toBe('hex');
    await edit(doc, id, 'Value', '', '0.5');
    expect(JSON.parse(await textOf(doc, id))).toMatchObject({ name: 'tau', value: 0.5 });
    await undo(doc);
    expect(await raw(doc, id)).toEqual(before);
  });
});

describe('a closed document', () => {
  it.each([
    ['params.sldd', () => fixture('params.sldd'), 'file:///params.sldd/design/Kp'],
    ['rt_bin.sldd', () => fixture('rt_bin.sldd'), 'binedit:file:///rt_bin.sldd/other/gadget'],
    ['nd_numeric.mat', () => fixture('nd_numeric.mat'), 'binedit:file:///nd_numeric.mat/Mat'],
    ['slxcases.slx', () => modelFixture('slxcases.slx'), 'file:///slxcases.slx'],
  ])('%s has nothing to show', async (name, bytes, id) => {
    const doc = await open(bytes(), name);
    expect((await raw(doc, id)).format).not.toBe('none');
    doc.dispose();
    expect(await raw(doc, id)).toEqual({ format: 'none', reason: NO_RAW_DATA });
  });
});

describe('a record asked for in place of the bytes (`raw(rowId, { record: true })`, the command window\'s json)', () => {
  it("answers a MAT-file's variable as read, and a model's workspace variable, with its record; the Raw pane's answer stays the dump", async () => {
    const mat = await open(matFixture('cases.mat'), 'cases.mat');
    const id = 'binedit:file:///cases.mat/scalarD';
    expect((await raw(mat, id)).format).toBe('hex');
    const record = await mat.table.raw!(id, { record: true });
    expect(record.format).toBe('json');
    expect(JSON.parse((record as { text: string }).text)).toMatchObject({ name: 'scalarD' });
    // Read-only, the same.
    const viewing = await open(matFixture('cases.mat'), 'cases.mat', false);
    expect(await viewing.table.raw!(id, { record: true })).toEqual(record);

    const model = await open(modelFixture('slxcases.slx'), 'slxcases.slx');
    const tau = 'binedit:file:///slxcases.slx/workspace/tau';
    expect((await raw(model, tau)).format).toBe('hex');
    expect(JSON.parse(((await model.table.raw!(tau, { record: true })) as { text: string }).text)).toMatchObject({ name: 'tau' });
  });

  it('answers a dictionary entry as it always does: its record is its raw form already', async () => {
    const doc = await open(fixture('params.sldd'), 'params.sldd');
    const id = 'file:///params.sldd/design/Kp';
    expect(await doc.table.raw!(id, { record: true })).toEqual(await raw(doc, id));
  });
});
