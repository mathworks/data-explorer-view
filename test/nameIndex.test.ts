// Copyright 2026 The MathWorks, Inc.
//
// NameIndex: a folder's entry names, read once and kept until invalidate(), one file reindexed or
// removed at a time, an unsaved buffer preferred over the file on disk; and what a search over
// them shows (searchEntries, searchItem, sortNameRecords). Over the integration suite's usageorder
// folder and the unit fixtures, read off disk by core's node reader with its reads counted. Where
// each name comes from is pinned in nameScan.test.ts, what each file holds in nameExtract.test.ts.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import {
  MAX_SEARCH_RESULTS,
  NameIndex,
  SEARCH_ICONS,
  searchEntries,
  sortNameRecords,
  type NameReader,
  type NameRecord,
} from '../src/model/index.js';

const DIR = resolve(import.meta.dirname, '../test-integration/fixtures/usageorder');
const file = (name: string): SourceFile => ({ uriString: `file:///w/${name}`, path: `/w/${name}` });
const FOLDER = ['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map(file);
const onDisk = (f: SourceFile): string => join(DIR, f.path.slice('/w/'.length));

let listed: readonly SourceFile[];
let lists: number;
let reads: string[];
let read: string[];
let dirty: Map<string, ArrayBuffer>;
let failList: boolean;
// What a test holds open: the Nth listing, and the Nth reader's read of one file (one reader a pass).
let heldLists: Map<number, Promise<void>>;
let heldReads: Map<number, { path: string; until: Promise<void> }>;
let readers: number;

function index(): NameIndex {
  return new NameIndex({
    files: {
      list: async () => {
        const n = ++lists;
        await heldLists.get(n);
        if (failList) throw new Error('no folder');
        return listed;
      },
    },
    reader: (files): NameReader => {
      const r = nodeSourceReader(files, { pathOf: onDisk });
      const held = heldReads.get(++readers);
      return {
        version: r.version,
        bytes: async (f) => {
          reads.push(f.path);
          if (held?.path === f.path) await held.until;
          const bytes = await r.bytes(f);
          read.push(f.path);
          return bytes;
        },
        dirtyBytes: (f) => dirty.get(f.uriString) ?? null,
      };
    },
  });
}

/** A promise the test resolves when it lets go. */
function hold(): { until: Promise<void>; release: () => void } {
  let release!: () => void;
  const until = new Promise<void>((done) => (release = done));
  return { until, release };
}

const tick = () => new Promise((done) => setTimeout(done, 0));
async function until(test: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !test(); i++) await tick();
  expect(test()).toBe(true);
}

const of = (records: NameRecord[]): string[] => records.map((r) => `${r.kind}:${r.name}@${r.sourceLabel}`).sort();

beforeEach(() => {
  listed = FOLDER;
  lists = 0;
  reads = [];
  read = [];
  dirty = new Map();
  failList = false;
  heldLists = new Map();
  heldReads = new Map();
  readers = 0;
});

describe('a name index', () => {
  it('lists every entry name of the folder, each occurrence its own', async () => {
    expect(of(await index().list())).toEqual([
      'block:GainA@ctrlA.slx',
      'block:GainB@plantB.slx',
      'block:LimitA@ctrlA.slx',
      'sldd:SharedGain@sharedParams.sldd',
      'sldd:UnusedVar@sharedParams.sldd',
    ]);
  });

  it('reads the folder once, however many ask at once', async () => {
    const names = index();
    await Promise.all([names.list(), names.list(), names.ensure()]);
    await names.list();
    expect(lists).toBe(1);
    expect(reads.sort()).toEqual(['/w/ctrlA.slx', '/w/plantB.slx', '/w/sharedParams.sldd']);
  });

  it('reads the folder again after invalidate(), through the cache', async () => {
    const names = index();
    await names.list();
    reads = [];
    listed = FOLDER.filter((f) => !f.path.endsWith('plantB.slx'));
    names.invalidate();
    expect(of(await names.list())).not.toContain('block:GainB@plantB.slx');
    expect(lists).toBe(2);
    expect(reads).toEqual([]);
  });

  it('reindexes one file from its unsaved bytes, and caches nothing of them', async () => {
    const names = index();
    await names.list();
    const text = readFileSync(join(import.meta.dirname, 'fixtures/params.sldd'));
    dirty.set(file('sharedParams.sldd').uriString, text.buffer.slice(text.byteOffset, text.byteOffset + text.byteLength) as ArrayBuffer);
    await names.reindex(file('sharedParams.sldd'));
    const now = of(await names.list());
    expect(now).not.toContain('sldd:SharedGain@sharedParams.sldd');
    expect(now.filter((n) => n.startsWith('sldd:')).length).toBeGreaterThan(1);
    // Saved again, the file on disk is what it reads: the buffer was never the cache's.
    dirty.clear();
    await names.reindex(file('sharedParams.sldd'));
    expect(of(await names.list())).toContain('sldd:SharedGain@sharedParams.sldd');
  });

  it('reindexes nothing before the first build, and removes a file at any time', async () => {
    const names = index();
    names.remove(file('ctrlA.slx').uriString);
    await names.reindex(file('ctrlA.slx'));
    expect(lists).toBe(0);
    expect(reads).toEqual([]);
    await names.list();
    names.remove(file('ctrlA.slx').uriString);
    expect(of(await names.list()).filter((n) => n.endsWith('@ctrlA.slx'))).toEqual([]);
  });

  it('builds again after a build that failed', async () => {
    const names = index();
    failList = true;
    await expect(names.list()).rejects.toThrow('no folder');
    failList = false;
    expect((await names.list()).length).toBe(5);
  });
});

describe('a name index over every kind of data file', () => {
  // The integration suite's workspace folder: two JSON dictionaries that share an entry name, a
  // compressed one and a model; and a MAT-file holding a Simulink.Breakpoint, an MCOS object.
  const FIXTURES = resolve(import.meta.dirname, '../test-integration/fixtures');
  const ON_DISK: Record<string, string> = {
    'data.sldd': 'workspace/data.sldd',
    'params.sldd': 'workspace/params.sldd',
    'binary.sldd': 'workspace/binary.sldd',
    'model.slx': 'workspace/model.slx',
    'CaseBp.mat': 'caserefs/CaseBp.mat',
  };
  const listing = (): Promise<NameRecord[]> =>
    new NameIndex({
      files: { list: async () => Object.keys(ON_DISK).map(file) },
      reader: (files): NameReader => {
        const r = nodeSourceReader(files, { pathOf: (f) => join(FIXTURES, ON_DISK[f.path.slice('/w/'.length)]) });
        return { version: r.version, bytes: r.bytes, dirtyBytes: () => null };
      },
    }).list();

  it('lists .sldd entry names from an unopened JSON dictionary', async () => {
    const fromData = (await listing()).filter((e) => e.sourceLabel === 'data.sldd');
    const names = fromData.map((e) => e.name);
    // A few names the fixture data.sldd holds.
    for (const expected of ['PI', 'Number', 'Struct', 'stringArray']) {
      expect(names, `data.sldd contributes "${expected}"`).toContain(expected);
    }
    expect(fromData.every((e) => e.kind === 'sldd'), 'all data.sldd records are kind "sldd"').toBe(true);
  });

  it('lists entry names from an unopened compressed-binary (zip) .sldd', async () => {
    // binary.sldd starts with the PK zip magic: it takes the compressed reader, not JSON.parse.
    const fromBinary = (await listing()).filter((e) => e.sourceLabel === 'binary.sldd');
    expect(fromBinary.length, 'the zip .sldd contributes entry names').toBeGreaterThan(0);
    expect(fromBinary.every((e) => e.kind === 'sldd'), 'all binary.sldd records are kind "sldd"').toBe(true);
  });

  it('preserves duplicate names across files (never collapsed)', async () => {
    // "structArray" is in both data.sldd and params.sldd: search must be able to reach either.
    const structArrays = (await listing()).filter((e) => e.name === 'structArray');
    const labels = structArrays.map((e) => e.sourceLabel);
    expect(labels, 'the data.sldd occurrence is present').toContain('data.sldd');
    expect(labels, 'the params.sldd occurrence is present').toContain('params.sldd');
    expect(structArrays.length, 'both occurrences are distinct records').toBeGreaterThanOrEqual(2);
  });

  it('spans multiple .sldd sources (JSON + zip)', async () => {
    const labels = new Set((await listing()).map((e) => e.sourceLabel));
    for (const f of ['data.sldd', 'params.sldd', 'binary.sldd']) {
      expect(labels.has(f), `the index includes entries from ${f}`).toBe(true);
    }
  });

  it('lists a .mat variable under its own name, not the MCOS class name', async () => {
    // An mxOPAQUE variable carries no dimensions subelement; a walk that skipped one anyway would
    // read the class name, and every Simulink object would be indexed as "MCOS".
    const fromMat = (await listing()).filter((e) => e.sourceLabel === 'CaseBp.mat');
    const names = fromMat.map((e) => e.name);
    expect(names, 'the .mat contributes "Bp"').toContain('Bp');
    expect(names, 'and never the MCOS marker as a name').not.toContain('MCOS');
    expect(names, 'nor the class name').not.toContain('Simulink.Breakpoint');
    expect(fromMat.every((e) => e.kind === 'mat'), 'all of its records are kind "mat"').toBe(true);
    // The file's trailing anonymous element contributes nothing: core reports '' for it.
    expect(names.every((n) => n.length > 0), 'no record carries an empty name').toBe(true);
  });
});

describe('a build an invalidate() dropped', () => {
  // The folder as the first build lists it, then as the one after the invalidate() lists it.
  const B2_FOLDER = FOLDER.filter((f) => !f.path.endsWith('ctrlA.slx'));
  const B2_NAMES = ['block:GainB@plantB.slx', 'sldd:SharedGain@sharedParams.sldd', 'sldd:UnusedVar@sharedParams.sldd'];

  /** A first build held open on its read of ctrlA.slx (its other reads done), then an invalidate(). */
  async function heldThenInvalidated() {
    const names = index();
    const b1 = hold();
    heldReads.set(1, { path: '/w/ctrlA.slx', until: b1.until });
    const first = names.list();
    await until(() => reads.includes('/w/ctrlA.slx') && read.length === 2);
    names.invalidate();
    listed = B2_FOLDER;
    return { names, first, release: b1.release };
  }

  it('publishes nothing when it finishes after the next build: the index is the next one', async () => {
    const { names, first, release } = await heldThenInvalidated();
    expect(of(await names.list())).toEqual(B2_NAMES);
    release();
    await until(() => read.includes('/w/ctrlA.slx'));
    // Its own caller is answered from the index there is, and so is every later one.
    expect(of(await first)).toEqual(B2_NAMES);
    expect(of(await names.list())).toEqual(B2_NAMES);
    expect(lists).toBe(2);
  });

  it('publishes nothing when it finishes before the next build: its callers wait for that one', async () => {
    const { names, first, release } = await heldThenInvalidated();
    const b2 = hold();
    heldLists.set(2, b2.until);
    const second = names.list();
    let firstAnswered = false;
    void first.then(() => (firstAnswered = true));
    release();
    await until(() => read.includes('/w/ctrlA.slx'));
    for (let i = 0; i < 20; i++) await tick();
    // The first build is done, and published nothing: its caller is still waiting.
    expect(firstAnswered).toBe(false);
    b2.release();
    expect(of(await second)).toEqual(B2_NAMES);
    expect(of(await first)).toEqual(B2_NAMES);
    expect(of(await names.list())).toEqual(B2_NAMES);
  });

  it('leaves a reindex() after the race to land in the live index', async () => {
    const { names, first, release } = await heldThenInvalidated();
    await names.list();
    release();
    await first;
    const text = readFileSync(join(import.meta.dirname, 'fixtures/params.sldd'));
    dirty.set(file('sharedParams.sldd').uriString, text.buffer.slice(text.byteOffset, text.byteOffset + text.byteLength) as ArrayBuffer);
    await names.reindex(file('sharedParams.sldd'));
    const now = of(await names.list());
    // The reindexed file, in the index of the folder as it is now: no file of the dropped build.
    expect(now).not.toContain('sldd:SharedGain@sharedParams.sldd');
    expect(now.filter((n) => n.startsWith('sldd:')).length).toBeGreaterThan(1);
    expect(now).toContain('block:GainB@plantB.slx');
    expect(now.filter((n) => n.endsWith('@ctrlA.slx'))).toEqual([]);
  });
});

describe('what a search shows', () => {
  it('a block by its name, where it is, its icon, and the key that reveals it', async () => {
    const records = sortNameRecords(await index().list());
    expect(searchEntries(records, '')).toEqual([]);
    const [gain] = searchEntries(records, 'GainA');
    expect(gain).toMatchObject({ label: 'GainA', description: 'ctrlA.slx', iconId: SEARCH_ICONS.block, revealName: '1' });
    const [shared] = searchEntries(records, 'shared');
    expect(shared).toMatchObject({ label: 'SharedGain', description: 'sharedParams.sldd', iconId: 'wsDefault', revealName: 'SharedGain' });
  });

  it('in name order, then by file, and no more than the cap', () => {
    const rec = (name: string, sourceLabel: string): NameRecord => ({ name, sourceUri: `file:///w/${sourceLabel}`, sourceLabel, kind: 'sldd' });
    const records = sortNameRecords([rec('b', 'x.sldd'), rec('a', 'y.sldd'), rec('a', 'x.sldd')]);
    expect(records.map((r) => `${r.name}@${r.sourceLabel}`)).toEqual(['a@x.sldd', 'a@y.sldd', 'b@x.sldd']);
    const many = Array.from({ length: MAX_SEARCH_RESULTS + 10 }, (_, i) => rec(`v${i}`, 'x.sldd'));
    expect(searchEntries(many, 'v').length).toBe(MAX_SEARCH_RESULTS);
    expect(searchEntries(many, 'v', 3).map((i) => i.label)).toEqual(['v0', 'v1', 'v2']);
  });
});
