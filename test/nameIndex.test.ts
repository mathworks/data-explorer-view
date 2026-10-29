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
let dirty: Map<string, ArrayBuffer>;
let failList: boolean;

function index(): NameIndex {
  return new NameIndex({
    files: {
      list: async () => {
        lists++;
        if (failList) throw new Error('no folder');
        return listed;
      },
    },
    reader: (files): NameReader => {
      const r = nodeSourceReader(files, { pathOf: onDisk });
      return {
        version: r.version,
        bytes: async (f) => (reads.push(f.path), r.bytes(f)),
        dirtyBytes: (f) => dirty.get(f.uriString) ?? null,
      };
    },
  });
}

const of = (records: NameRecord[]): string[] => records.map((r) => `${r.kind}:${r.name}@${r.sourceLabel}`).sort();

beforeEach(() => {
  listed = FOLDER;
  lists = 0;
  reads = [];
  dirty = new Map();
  failList = false;
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
