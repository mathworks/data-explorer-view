// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/usageOrder.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/usageRepostOnModelCreate.test.ts at c73da3c
//
// A JSON dictionary's Usage column, run against view's JSON dictionary engine: filled from the
// usage graphs of the folder around it (UsageGraphs, through the engine's usage hook, as the
// workspace fills it) whatever the session happens to hold, and painted again when a model that
// links it appears in the folder or leaves it (a usage repost hub over a watch of the case's own).
// The extension's tabs, findFiles and FileSystemWatcher are a folder of the case's: the usageorder
// fixtures read off disk by core's node reader, or files held in memory with a watch that is told
// of each write. Left with vscode: usageOrder's premise that findFiles never lists its fixtures
// (VS Code's), and its model-row case (annotateModelRows, a model's table, which view's
// goldens/usage.test.ts pins for ctrlA.slx); usageRepostOnModelCreate's MAT-file half, which is the
// MAT-file table's.
import * as assert from 'node:assert';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createSession, type SourceFile, type SourceReader } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import { strToU8, zipSync } from 'fflate';
import { describe, it } from 'vitest';
import { createRegisters, createUsageRepostHub, UsageGraphs } from '../../src/model/index.js';
import { JsonEngine, type JsonUsageFill } from '../../src/model/edit/jsonEngine.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { diskOf, file, isEntryRow, nameOf, open, settle, viewOf, waitFor, WORKSPACE_DATA } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DIR = resolve(import.meta.dirname, '../../test-integration/fixtures/usageorder');
const DICT = 'sharedParams.sldd';
const fixture = (name: string): SourceFile => ({ uriString: `file:///w/usageorder/${name}`, path: `/w/usageorder/${name}` });
const FOLDER = ['ctrlA.slx', 'plantB.slx', DICT].map(fixture);
const onDisk = (f: SourceFile): string => join(DIR, f.path.slice('/w/usageorder/'.length));
const bytesOf = (name: string): ArrayBuffer => new Uint8Array(readFileSync(join(DIR, name))).buffer as ArrayBuffer;

const rowNamed = (rows: any[], name: string): any => rows.find((r) => isEntryRow(r) && nameOf(r) === name);
const firstRows = (posts: any[]): any[] => posts.find((p) => p.type === 'setRows')?.rows ?? [];

/** The usage graphs over `files` of the usageorder folder: what the open tabs fed the extension's. */
const graphsOver = (files: readonly SourceFile[]) =>
  new UsageGraphs({
    inputs: {
      inputsKey: () => '',
      candidates: async () => files,
      readerFor: (listed) => nodeSourceReader(listed, { pathOf: onDisk }),
    },
  });

/** The engine's Usage column filled from `graphs`, as the workspace fills it, every fill's answer kept. */
function fillFrom(graphs: UsageGraphs, uri: string, answers: boolean[] = []): JsonUsageFill {
  return {
    fill: async (rows) => (answers.push(await graphs.annotateDataRows(uri, rows)), undefined),
    fillNow: (rows) => graphs.annotateDataRowsNow(uri, rows),
  };
}

/**
 * The dictionary's table, in a session that holds ctrlA as a model tab would have registered it
 * (the state the bug needed: plantB is never registered), filled from `usage` when one is given.
 */
async function openDictionary(usage?: JsonUsageFill) {
  const registry = new DocumentRegistry(createSession());
  registry.getModelFromBytes(fixture('ctrlA.slx').uriString, 'ctrlA.slx', bytesOf('ctrlA.slx'));
  const bytes = new Uint8Array(readFileSync(join(DIR, DICT)));
  return open(DICT, bytes, { uri: fixture(DICT).uriString, registry, ...(usage ? { usage } : {}) });
}

describe('Usage does not depend on tab history', () => {
  const dictUri = fixture(DICT).uriString;
  const ctrlUri = fixture('ctrlA.slx').uriString;
  const plantUri = fixture('plantB.slx').uriString;

  it('the session alone answers with fewer blocks and no model at all', async () => {
    // What the node layer hands over, and why it cannot be the answer: the session holds ctrlA, so
    // it can speak for GainA/LimitA and knows nothing of GainB, and its shape names no model.
    const o = await openDictionary();
    const before = rowNamed(firstRows(o.view.posts), 'SharedGain').UsedBy;
    assert.ok(before && !('blockLinks' in before), 'the cell is the node layer’s shape, not the graph’s');
    const named: string[] = Array.isArray(before.links) ? before.links.map((l: any) => l.text) : [];
    assert.ok(!named.includes('GainB'), 'the session cannot know a model it never registered');
    assert.ok(named.length < 3, `the session accounts for ${named.length} of 3 usages`);
    for (const name of named) assert.ok(!name.includes('('), `${name} carries no model qualifier`);
  });

  it('annotateDataRows replaces it with every usage, each named with its model', async () => {
    const graphs = graphsOver(FOLDER);
    assert.strictEqual((await graphs.blocksUsingVariable(dictUri, 'SharedGain')).length, 3, 'the graph resolves all three usages');
    const answers: boolean[] = [];
    const o = await openDictionary(fillFrom(graphs, dictUri, answers));
    assert.ok(answers.includes(true), 'the row changed');
    const cell = rowNamed(firstRows(o.view.posts), 'SharedGain').UsedBy;
    assert.ok(!('links' in cell), 'the session’s shape is gone, not merged into');
    assert.deepStrictEqual(
      cell.blockLinks,
      [
        // Each block named, placed in its model, and targeted by SID within it: `GainA` is
        // `1@ctrlA` and `GainB`, in the other model, `1@plantB`.
        { blockName: 'GainA', blockPath: 'GainA', modelName: 'ctrlA', modelUri: ctrlUri, linkTarget: `blocks:1@${ctrlUri}` },
        { blockName: 'LimitA', blockPath: 'LimitA', modelName: 'ctrlA', modelUri: ctrlUri, linkTarget: `blocks:2@${ctrlUri}` },
        // The load-bearing one: plantB is not in the session, so only the graph could have said it.
        { blockName: 'GainB', blockPath: 'GainB', modelName: 'plantB', modelUri: plantUri, linkTarget: `blocks:1@${plantUri}` },
      ],
      'every usage, each qualified by the model it lives in',
    );
  });

  it('an entry nothing uses keeps whatever the node layer left, rather than being emptied', async () => {
    const before = rowNamed(firstRows((await openDictionary()).view.posts), 'UnusedVar').UsedBy;
    const filled = await openDictionary(fillFrom(graphsOver(FOLDER), dictUri));
    assert.deepStrictEqual(rowNamed(firstRows(filled.view.posts), 'UnusedVar').UsedBy, before, 'left exactly as it was');
  });

  it('with nothing open the graph has no answer, and no row is touched', async () => {
    const graphs = graphsOver([]);
    assert.strictEqual((await graphs.blocksUsingVariable(dictUri, 'SharedGain')).length, 0);
    const before = rowNamed(firstRows((await openDictionary()).view.posts), 'SharedGain').UsedBy;
    const answers: boolean[] = [];
    const o = await openDictionary(fillFrom(graphs, dictUri, answers));
    assert.ok(answers.length > 0 && !answers.includes(true), 'nothing to change, so nothing repaints');
    assert.deepStrictEqual(rowNamed(firstRows(o.view.posts), 'SharedGain').UsedBy, before);
  });
});

const MODEL = '/w/usageRepostProbe.slx';
const NOT_A_MODEL = '/w/usageRepostProbe.sldd';
const BLOCK = 'RepostGain';

// A one-block model in the shape core reads (see make-usageorder.mjs): `Gain` is a parameter and
// its value an identifier, so the block's use of `variable` is recorded. No model workspace.
function modelUsing(variable: string, link: { dictionary: string }): Uint8Array {
  return zipSync({
    'simulink/blockDiagram.json': strToU8(
      JSON.stringify({ BlockDiagram: { DataDictionary: link.dictionary, ModelUUID: 'uuid-usage-repost', System: { Ref: 'system_root' } } }),
    ),
    'simulink/systems/system_root.xml': strToU8(
      '<?xml version="1.0" encoding="utf-8"?>' +
        `<System><Block BlockType="Gain" Name="${BLOCK}" SID="1"><P Name="Gain">${variable}</P></Block></System>`,
    ),
    'metadata/coreProperties.xml': strToU8('<?xml version="1.0"?><coreProperties><version>R2026b</version></coreProperties>'),
  });
}

const setRowsOf = (posts: any[]): any[] => posts.filter((p) => p.type === 'setRows');

/** The blocks the LATEST rows say use `name`: the cell as the user would read it. */
function usersOf(posts: any[], name: string): string[] {
  const row = rowNamed(setRowsOf(posts).at(-1)?.rows ?? [], name);
  assert.ok(row, `the table has a row for "${name}"`);
  const links = row.UsedBy?.blockLinks;
  return Array.isArray(links) ? links.map((l: any) => l.blockName) : [];
}

/** A folder held in memory, its files listed in path order, and a watch told of every write and delete. */
function folderOf(files: Record<string, Uint8Array>) {
  const held = new Map(Object.entries(files));
  const versions = new Map<string, number>();
  let generation = 0;
  let changed: ((path: string) => void) | undefined;
  const asFile = (path: string): SourceFile => ({ uriString: `file://${path}`, path });
  const reader: SourceReader = {
    version: async (f) => (held.has(f.path) ? String(versions.get(f.path) ?? 0) : null),
    bytes: async (f) => {
      const bytes = held.get(f.path);
      return bytes ? (bytes.slice().buffer as ArrayBuffer) : null;
    },
  };
  const graphs = new UsageGraphs({
    inputs: { inputsKey: () => '', candidates: async () => [...held.keys()].sort().map(asFile), readerFor: () => reader },
  });
  const hub = createUsageRepostHub({
    watch: (listener) => ((changed = listener), { dispose: () => void (changed = undefined) }),
    graphs,
    delayMs: 1,
  });
  return {
    graphs,
    hub,
    write(path: string, bytes: Uint8Array) {
      held.set(path, bytes);
      versions.set(path, ++generation);
      changed?.(path);
    },
    remove(path: string) {
      if (held.delete(path)) changed?.(path);
    },
  };
}

/** Two debounce windows and the turns after them, for a repost a change would cause. */
const letItLand = async (): Promise<void> => {
  await new Promise((done) => setTimeout(done, 20));
  await settle();
};

describe('Usage follows a model created or deleted beside an open data file', () => {
  it('the JSON dictionary table reposts its Usage column', async () => {
    const variable = 'Number';
    const bytes = file(WORKSPACE_DATA);
    const folder = folderOf({ '/w/data.sldd': bytes });
    const uri = 'file:///w/data.sldd';
    const engine = new JsonEngine({
      registry: new DocumentRegistry(createSession()),
      uri,
      text: createTextStore(new TextDecoder().decode(bytes)),
      registers: createRegisters(),
      disk: diskOf(bytes),
      usage: fillFrom(folder.graphs, uri),
      usageReposts: folder.hub,
    });
    const view = viewOf(engine);
    let closed = false;
    try {
      view.send({ type: 'ready' });
      await waitFor('the first rows', () => setRowsOf(view.posts).length > 0);
      assert.deepStrictEqual(usersOf(view.posts, variable), [], `nothing in the folder uses ${variable} yet`);

      // The control: a file appearing that is not a model cannot add a usage edge, and is no reason
      // to rebuild every open table.
      const before = setRowsOf(view.posts).length;
      folder.write(NOT_A_MODEL, strToU8('{}'));
      await letItLand();
      assert.strictEqual(setRowsOf(view.posts).length, before, 'a non-model file created beside it reposts nothing');
      folder.remove(NOT_A_MODEL);

      // A model that uses the variable appears: the column names its block, unprompted.
      const model = modelUsing(variable, { dictionary: 'data.sldd' });
      folder.write(MODEL, model);
      await waitFor(`a repost naming ${BLOCK} as a user of ${variable}`, () => usersOf(view.posts, variable).includes(BLOCK));

      // And leaves: the column stops naming it.
      folder.remove(MODEL);
      await waitFor(`a repost no longer naming ${BLOCK}`, () => !usersOf(view.posts, variable).includes(BLOCK));

      // A closed tab is unsubscribed: the same model appearing again posts nothing to it.
      view.close();
      closed = true;
      const atClose = view.posts.length;
      folder.write(MODEL, model);
      await letItLand();
      assert.strictEqual(view.posts.length, atClose, 'a closed tab is never reposted');
    } finally {
      if (!closed) view.close();
      folder.hub.dispose();
    }
  });
});
