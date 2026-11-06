// Copyright 2026 The MathWorks, Inc.
//
// The inspector's pages past a row's properties, as a document's table answers them when asked
// (`inspect(selection, { pages })`): the file's own page while no row is selected, a section
// heading's, a selection of several rows; and, with `editable`, a row's properties editable where
// the document takes an edit of them. Through every kind of document a workspace opens, read-only
// and edited, since each answers `inspect` itself (workspace.ts, edit/jsonView.ts,
// edit/binaryView.ts, edit/matEngine.ts) and they must not disagree.
//
// And what must NOT change: asked without options, every document answers as it always has, the
// first row's properties read-only and nothing for a section heading or no row. That is the page
// the VS Code extension's inspector shows (its host builds it with buildPropertyGroups and
// InspectorSelection, which these leave as they are).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { createWorkspace, type Workspace } from '../src/model/source/workspace.js';
import { buildPropertyGroups, type PropertyGroup } from '../src/model/inspector/piBuilder.js';
import { graphFilePage, usedByGroup } from '../src/model/inspector/inspectorPages.js';
import { buildRelationshipGraph } from '../src/model/graph/relationshipGraph.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';

const shellFixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, 'shell/fixtures', name)));
const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
const uriOf = (name: string) => `file:///work/${name}`;

const workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces.splice(0)) ws.dispose();
  // Nothing here registers in core's module-level session, which the VS Code extension uses.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

/** A workspace with `files` open under /work, each painted once; `editing` as createWorkspace takes it. */
async function opened(files: Record<string, Uint8Array>, editing = false) {
  const ws = createWorkspace({ editing });
  workspaces.push(ws);
  const docs = new Map<string, Awaited<ReturnType<Workspace['open']>>>();
  for (const [name, bytes] of Object.entries(files)) {
    const doc = await ws.open(bytes, name, uriOf(name));
    await doc.table.open();
    docs.set(name, doc);
  }
  return { ws, doc: (name: string) => docs.get(name)! };
}

/** A group's rows as `name: value`, a link's with its target: what a reader of the page sees. */
const rowsOf = (group: PropertyGroup | undefined) =>
  (group?.properties ?? []).map((p) => `${p.name}: ${p.value}${p.type === 'link' ? ` -> ${p.linkTarget}` : ''}`);
const groupNamed = (groups: PropertyGroup[], title: string) => groups.find((g) => g.title === title);

async function rowNamed(table: { open(): Promise<{ rows: TreeTableRow[] }> }, name: string): Promise<TreeTableRow> {
  const row = (await table.open()).rows.find((r) => r.Name.label === name);
  expect(row, `no row ${name}`).toBeTruthy();
  return row!;
}

describe("a file's own page", () => {
  it('says what the file is, where it is, whether it holds edits, and what core says of it', async () => {
    const { doc } = await opened({ 'params.sldd': shellFixture('params.sldd') });
    const page = await doc('params.sldd').table.inspect([], { pages: true });
    // Its row is the file itself, which the document's uri names (as the Raw pane's is).
    expect(page.rowId).toBe(uriOf('params.sldd'));
    expect(page.groups.map((g) => g.title)).toEqual(['General']);
    // The file's NAME, not the uri core names its tree by; core's own facts of the file after it.
    expect(rowsOf(page.groups[0])).toEqual([
      'Name: params.sldd',
      'Kind: Data dictionary',
      'Release: R2026b',
      'File Format: uncompressed-text',
      'Number of Entries: 3',
      'File: /work/params.sldd',
      'Modified: No',
    ]);
    // Nothing on it is an edit of the document: the file's name is not a cell of its table.
    expect(page.groups.flatMap((g) => g.properties).every((p) => !p.editable)).toBe(true);
    // The file's own id asks for the same page as no row does.
    expect(await doc('params.sldd').table.inspect(uriOf('params.sldd'), { pages: true })).toEqual(page);
  });

  it("lists what the file references and who references it, each a link to its file, among the files open", async () => {
    // shadow_ws.slx links params.sldd, as its data dictionary and as External Data: one reference.
    const { doc } = await opened({ 'shadow_ws.slx': shellFixture('shadow_ws.slx'), 'params.sldd': shellFixture('params.sldd') });
    const model = await doc('shadow_ws.slx').table.inspect([], { pages: true });
    expect(rowsOf(groupNamed(model.groups, 'References'))).toEqual([`params.sldd: Open -> ${uriOf('params.sldd')}`]);
    expect(groupNamed(model.groups, 'Referenced By')).toBeUndefined();
    const dictionary = await doc('params.sldd').table.inspect([], { pages: true });
    expect(rowsOf(groupNamed(dictionary.groups, 'Referenced By'))).toEqual([`shadow_ws.slx: Open -> ${uriOf('shadow_ws.slx')}`]);
    expect(groupNamed(dictionary.groups, 'References')).toBeUndefined();
  });

  it('names a file that is not open by its name, which a link to it resolves as a Model Reference row does', async () => {
    const { doc } = await opened({ 'shadow_ws.slx': shellFixture('shadow_ws.slx') });
    const page = await doc('shadow_ws.slx').table.inspect([], { pages: true });
    expect(rowsOf(groupNamed(page.groups, 'References'))).toEqual(['params.sldd: Not open -> params.sldd']);
    expect(rowsOf(page.groups[0])).toContain('Kind: Simulink model');
  });

  it('says Modified while the document holds an edit, in an editing workspace', async () => {
    const { doc } = await opened({ 'params.sldd': shellFixture('params.sldd') }, true);
    const d = doc('params.sldd');
    const kp = await rowNamed(d.table, 'Kp');
    const dirty = new Promise<void>((resolve) => d.onDirty((on) => on && resolve()));
    (d.table as any).edit({ rowId: kp.ID, columnId: 'Value', oldValue: '1', newValue: '2' });
    await dirty;
    expect(rowsOf((await d.table.inspect([], { pages: true })).groups[0])).toContain('Modified: Yes');
  });
});

describe("a section heading's page", () => {
  it('names the section and its file, counts its entries, and counts them by type', async () => {
    const { doc } = await opened({ 'arch.sldd': fixture('arch.sldd') });
    const page = await doc('arch.sldd').table.inspect('section:arch', { pages: true });
    expect(page.rowId).toBe('section:arch');
    expect(page.groups.map((g) => g.title)).toEqual(['General', 'Entry Types']);
    expect(rowsOf(page.groups[0])).toEqual(['Name: Architectural Data', 'File: arch.sldd', 'Entries: 10']);
    const types = rowsOf(page.groups[1]);
    expect(types).toContain('Simulink.AliasType: 1');
    expect(types).toContain('Simulink.Bus: 2');
    // Every entry is counted once.
    expect(types.reduce((n, t) => n + Number(t.split(': ')[1]), 0)).toBe(10);
  });

  it("counts a model's blocks by their block type, and an empty section has no types", async () => {
    const { doc } = await opened({ 'shadow_ws.slx': shellFixture('shadow_ws.slx') });
    const blocks = await doc('shadow_ws.slx').table.inspect('section:blocks', { pages: true });
    expect(rowsOf(groupNamed(blocks.groups, 'Entry Types'))).toEqual(['Gain: 1', 'Constant: 1']);
    const refs = await doc('shadow_ws.slx').table.inspect('section:references', { pages: true });
    expect(rowsOf(refs.groups[0])).toContain('Entries: 0');
    expect(groupNamed(refs.groups, 'Entry Types')).toBeUndefined();
  });
});

describe("a selection of several rows' page", () => {
  it('says how many are selected, and counts them by type', async () => {
    const { doc } = await opened({ 'arch.sldd': fixture('arch.sldd') });
    const rows = (await doc('arch.sldd').table.open()).rows.filter((r) => r.parent === 'section:arch').slice(0, 3);
    const page = await doc('arch.sldd').table.inspect(rows.map((r) => r.ID), { pages: true });
    expect(page.rowId).toBe(rows[0].ID);
    expect(page.groups.map((g) => g.title)).toEqual(['3 selected']);
    expect(page.groups[0].properties.reduce((n, p) => n + Number(p.value), 0)).toBe(3);
  });
});

describe("a row's properties, editable", () => {
  it('makes a row editable where core offers its editor, keyed by the property an edit names', async () => {
    const { doc } = await opened({ 'params.sldd': shellFixture('params.sldd') }, true);
    const kp = await rowNamed(doc('params.sldd').table, 'Kp');
    const page = await doc('params.sldd').table.inspect(kp.ID, { editable: true });
    const byName = new Map(page.groups.flatMap((g) => g.properties).map((p) => [p.name, p]));
    expect(byName.get('Name')).toMatchObject({ editable: true, key: 'Name', value: 'Kp' });
    expect(byName.get('Value')).toMatchObject({ editable: true, key: 'Value', value: '1' });
    // A label in core is read-only here too, and carries no key.
    expect(byName.get('Data Type')).toMatchObject({ editable: false });
    expect(byName.get('Data Type')!.key).toBeUndefined();
  });

  it('offers a choice as its options, and a text that may hold lines as a multi-line field', async () => {
    const { doc } = await opened({ 'arch.sldd': fixture('arch.sldd') }, true);
    const alias = await rowNamed(doc('arch.sldd').table, 'AliasType');
    const rows = (await doc('arch.sldd').table.inspect(alias.ID, { editable: true })).groups.flatMap((g) => g.properties);
    expect(rows.find((p) => p.name === 'Data Scope')).toMatchObject({ editable: true, key: 'dataScope', options: ['Auto', 'Exported', 'Imported'] });
    expect(rows.find((p) => p.name === 'Description')).toMatchObject({ editable: true, key: 'Description', multiline: true });
  });

  it('keeps a matrix value read-only: its glyph, and the variable editor, are where it is edited', async () => {
    const { doc } = await opened({ 'ParamMat.mat': shellFixture('ParamMat.mat') }, true);
    const table = doc('ParamMat.mat').table;
    const rows = (await table.open()).rows;
    const pages = await Promise.all(rows.map((r) => table.inspect(r.ID, { editable: true })));
    const matrices = pages.flatMap((p) => p.groups.flatMap((g) => g.properties)).filter((p) => p.matrix);
    expect(matrices.length).toBeGreaterThan(0);
    expect(matrices.every((p) => !p.editable)).toBe(true);
  });

  it('is what every editing document answers: a compressed dictionary, a MAT-file and a Model Workspace', async () => {
    const { doc } = await opened({ 'rt_bin.sldd': shellFixture('rt_bin.sldd'), 'slxcases.slx': shellFixture('slxcases.slx') }, true);
    for (const name of ['rt_bin.sldd', 'slxcases.slx']) {
      const table = doc(name).table;
      const rows = (await table.open()).rows.filter((r) => !r.ID.startsWith('section:'));
      const pages = await Promise.all(rows.map((r) => table.inspect(r.ID, { editable: true })));
      expect(pages.some((p) => p.groups.some((g) => g.properties.some((q) => q.editable && q.key))), name).toBe(true);
      // And each has its file's page.
      expect((await table.inspect([], { pages: true })).rowId, name).toBe(uriOf(name));
    }
  });
});

describe('asked without options', () => {
  it("answers as it always has: the first row's properties read-only, nothing for a section heading or no row", async () => {
    for (const editing of [false, true]) {
      const { doc } = await opened({ 'params.sldd': shellFixture('params.sldd') }, editing);
      const table = doc('params.sldd').table;
      const kp = await rowNamed(table, 'Kp');
      const uo = await rowNamed(table, 'Uo');
      const page = await table.inspect([kp.ID, uo.ID]);
      expect(page.rowId).toBe(kp.ID);
      expect(page.groups.flatMap((g) => g.properties).every((p) => p.editable === false && p.key === undefined)).toBe(true);
      expect(await table.inspect('section:design')).toEqual({ groups: [] });
      expect(await table.inspect([])).toEqual({ groups: [] });
      expect(await table.inspect(uriOf('params.sldd'))).toEqual({ groups: [] });
    }
  });

  it('builds the rows buildPropertyGroups builds, which the extension shows', async () => {
    const root = { toPIObject: () => null };
    expect(buildPropertyGroups(root)).toEqual([]);
    const { doc } = await opened({ 'params.sldd': shellFixture('params.sldd') });
    const kp = await rowNamed(doc('params.sldd').table, 'Kp');
    const groups = (await doc('params.sldd').table.inspect(kp.ID)).groups;
    // Not one key more than the extension's pages carried, as they are posted (InspectorPage
    // compares them serialized): no key, options or multi-line mark on a read-only row.
    for (const p of groups.flatMap((g) => g.properties)) expect(Object.keys(JSON.parse(JSON.stringify(p))).sort()).toEqual(['editable', 'name', 'type', 'value']);
  });
});

describe('usedByGroup', () => {
  it("lists a variable's blocks, each a link to its block, with its path and its model", () => {
    const group = usedByGroup({ UsedBy: {
      blockLinks: [
        { blockName: 'Gain', blockPath: 'ctrl/Gain', modelName: 'plant', modelUri: 'file:///w/plant.slx', linkTarget: 'blocks:7@file:///w/plant.slx' },
        { blockName: 'K', blockPath: 'K', modelName: '', modelUri: 'file:///w/own.slx', linkTarget: 'blocks:9@file:///w/own.slx' },
      ],
    } });
    expect(group?.title).toBe('Used By');
    expect(rowsOf(group ?? undefined)).toEqual(['Gain: ctrl/Gain (plant) -> blocks:7@file:///w/plant.slx', 'K: K -> blocks:9@file:///w/own.slx']);
  });

  it("lists a block's parameters, each value a link to the variable it reads", () => {
    const UsedBy = { paramLinks: [{ property: 'Gain', paramName: 'Kp', source: 'params.sldd', linkTarget: 'Kp@file:///w/params.sldd' }, { property: 'Value', paramName: 'x', source: '', linkTarget: '' }] };
    const group = usedByGroup({ UsedBy, _isBlockRow: true });
    expect(group?.title).toBe('Uses');
    expect(group?.properties).toEqual([
      { name: 'Gain', value: 'Kp (params.sldd)', type: 'text', editable: false, valueLink: 'Kp@file:///w/params.sldd' },
      // A parameter the graph could not resolve is text, as its cell shows it.
      { name: 'Value', value: 'x', type: 'text', editable: false },
    ]);
  });

  it("reads core's own cells too: a list of links, one link, and text, a block's what it uses", () => {
    expect(rowsOf(usedByGroup({ UsedBy: { links: [{ text: 'WsGain', linkTarget: '1@binedit:file:///w/m.slx' }] } }) ?? undefined)).toEqual(['WsGain:  -> 1@binedit:file:///w/m.slx']);
    expect(usedByGroup({ UsedBy: { text: 'Gain=Kp', linkTarget: 'Kp@params.sldd' }, _isBlockRow: true })).toEqual({
      title: 'Uses',
      properties: [{ name: 'Gain=Kp', value: '', type: 'link', linkTarget: 'Kp@params.sldd', editable: false }],
    });
    expect(usedByGroup({ UsedBy: 'Gain, Gain1' })?.properties).toEqual([{ name: 'Gain, Gain1', value: '', type: 'text', editable: false }]);
  });

  it('is no group for an empty cell, or one it cannot read', () => {
    for (const UsedBy of [undefined, null, '', {}, { blockLinks: [] }, { paramLinks: 'x' }, 7]) expect(usedByGroup({ UsedBy })).toBeNull();
    expect(usedByGroup(undefined)).toBeNull();
  });
});

describe('graphFilePage', () => {
  // The page of a box the relationship graph draws, for a box clicked at Root: the file need not be
  // open (the graph draws the folder's files too), so it is drawn from what the graph knows, its
  // links its edges between files.
  const source = (name: string, bytes: Uint8Array) => ({ uriString: uriOf(name), path: `/work/${name}`, bytes: bytes.slice().buffer });
  const graph = buildRelationshipGraph([source('shadow_ws.slx', shellFixture('shadow_ws.slx')), source('params.sldd', shellFixture('params.sldd'))]);

  it("is the file's page: what it is, where, whether open with edits, and the files it links and is linked by", () => {
    const open = (uri: string) => (uri === uriOf('shadow_ws.slx') ? { dirty: true } : undefined);
    const model = graphFilePage(graph, uriOf('shadow_ws.slx'), open)!;
    expect(model.box.uri).toBe(uriOf('shadow_ws.slx'));
    expect(rowsOf(model.groups[0])).toEqual(['Name: shadow_ws.slx', 'Kind: Simulink model', 'File: /work/shadow_ws.slx', 'Modified: Yes']);
    expect(rowsOf(groupNamed(model.groups, 'References'))).toEqual([`params.sldd: Not open -> ${uriOf('params.sldd')}`]);
    const dictionary = graphFilePage(graph, uriOf('params.sldd'), open)!;
    // Not open: it holds no edits, and says nothing of them.
    expect(rowsOf(dictionary.groups[0])).toEqual(['Name: params.sldd', 'Kind: Data dictionary', 'File: /work/params.sldd']);
    expect(rowsOf(groupNamed(dictionary.groups, 'Referenced By'))).toEqual([`shadow_ws.slx: Open -> ${uriOf('shadow_ws.slx')}`]);
  });

  it("is the page of an item's box for an item, a ghost's for a file referenced and not found, and none for an id it does not draw", () => {
    const item = graph.boxes.find((b) => b.items.length > 0)!.items[0]!;
    expect(graphFilePage(graph, item.id, () => undefined)?.box.id).toBe(item.boxId);
    const lone = buildRelationshipGraph([source('shadow_ws.slx', shellFixture('shadow_ws.slx'))]);
    const ghost = lone.boxes.find((b) => b.ghost)!;
    const page = graphFilePage(lone, ghost.id, () => undefined)!;
    expect(rowsOf(page.groups[0])).toEqual(['Name: params.sldd', 'Kind: Data dictionary', 'File: Not found']);
    expect(rowsOf(groupNamed(page.groups, 'Referenced By'))).toEqual([`shadow_ws.slx: Not open -> ${uriOf('shadow_ws.slx')}`]);
    // A link from the model to its ghost names the file as the model wrote it.
    expect(rowsOf(groupNamed(graphFilePage(lone, uriOf('shadow_ws.slx'), () => undefined)!.groups, 'References'))).toEqual(['params.sldd: Not found -> params.sldd']);
    expect(graphFilePage(lone, 'nothing', () => undefined)).toBeNull();
  });
});
