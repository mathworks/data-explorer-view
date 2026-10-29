// Copyright 2026 The MathWorks, Inc.
//
// A folder session: one listing per change, shared by the hierarchy, the usage graphs and the
// name index; a change diffed into what each needs; the hub owed a repost only for a model created
// or deleted; and a workspace whose usage source arrives after its documents (setUsage,
// doc.repaint). Over the integration suite's usageorder folder (two models sharing a dictionary),
// held in memory so a test can create, delete and save files, with the listings and reads counted.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import {
  createFolderSession,
  createWorkspace,
  folderReader,
  serveFolder,
  type FolderSession,
  type GraphReader,
  type HierarchyItem,
  type TableChange,
  type TreeTableRow,
  type WatchFolder,
} from '../src/model/index.js';

import { channel } from './goldens/channel.js';

const DIR = resolve(import.meta.dirname, '../test-integration/fixtures/usageorder');
const disk = (name: string): Uint8Array => new Uint8Array(readFileSync(join(DIR, name)));
const file = (name: string): SourceFile => ({ uriString: `file:///w/${name}`, path: `/w/${name}` });
const DICT = file('sharedParams.sldd').uriString;

// The folder: bytes and a version per name, which a test changes. Reset per test.
let folder: Map<string, { bytes: Uint8Array; version: number }>;
let lists: number;
let reads: string[];

function put(name: string, bytes: Uint8Array): void {
  folder.set(name, { bytes, version: (folder.get(name)?.version ?? 0) + 1 });
}

const reader = (files: readonly SourceFile[]): GraphReader => {
  const known = new Set(files.map((f) => f.uriString));
  const at = (f: SourceFile) => (known.has(f.uriString) ? folder.get(f.path.slice('/w/'.length)) : undefined);
  return {
    version: async (f) => (at(f) ? `v${at(f)!.version}` : null),
    bytes: async (f) => {
      reads.push(f.path);
      const b = at(f)?.bytes;
      return b ? (b.slice().buffer as ArrayBuffer) : null;
    },
    projectStore: async () => null,
  };
};

const sessions: FolderSession[] = [];
function session(watch?: WatchFolder): FolderSession {
  const s = createFolderSession({
    files: {
      list: async () => {
        lists++;
        return [...folder.keys()].sort().map(file);
      },
    },
    reader,
    repostDelayMs: 1,
    ...(watch ? { watch } : {}),
  });
  sessions.push(s);
  return s;
}

/** Every row's label, depth first, every twisty opened. */
async function tree(s: FolderSession, items?: HierarchyItem[]): Promise<string[]> {
  const out: string[] = [];
  for (const item of items ?? (await s.hierarchy.roots())) {
    out.push(item.label);
    if (item.collapsible === 'collapsed') out.push(...(await tree(s, await s.hierarchy.children(item))));
  }
  return out;
}

const users = async (s: FolderSession, name = 'SharedGain'): Promise<string[]> =>
  (await s.usage.blocksUsingVariable(DICT, name)).map((b) => b.blockName);
const names = async (s: FolderSession): Promise<string[]> => (await s.names.list()).map((r) => r.name).sort();
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

beforeEach(() => {
  folder = new Map();
  lists = 0;
  reads = [];
  put('ctrlA.slx', disk('ctrlA.slx'));
  put('plantB.slx', disk('plantB.slx'));
  put('sharedParams.sldd', disk('sharedParams.sldd'));
});

afterEach(() => {
  for (const s of sessions.splice(0)) s.dispose();
});

describe('a folder session', () => {
  it('lists the folder once for the hierarchy, the usage graphs and the names', async () => {
    const s = session();
    await Promise.all([s.hierarchy.roots(), users(s), s.names.list()]);
    expect(lists).toBe(1);
    expect(await users(s)).toEqual(['GainA', 'LimitA', 'GainB']);
    expect(await names(s)).toEqual(['GainA', 'GainB', 'LimitA', 'SharedGain', 'UnusedVar']);
    // Whoever asked first, the three share one cache: a dictionary is read once, a model twice
    // (its relationships, then the parse its blocks' names and parameters need), and no more.
    expect(reads.sort()).toEqual(['/w/ctrlA.slx', '/w/ctrlA.slx', '/w/plantB.slx', '/w/plantB.slx', '/w/sharedParams.sldd']);
  });

  it('lists it once more per change, however many ask after', async () => {
    const s = session();
    await tree(s);
    await s.changed();
    await Promise.all([tree(s), users(s), names(s)]);
    expect(lists).toBe(2);
  });

  it('takes the changes asked for while one runs as one more listing', async () => {
    const s = session();
    await tree(s);
    await Promise.all([s.changed([DICT]), s.changed([file('ctrlA.slx').uriString]), s.changed()]);
    expect(lists).toBe(3);
  });

  it('a file created: it is in the hierarchy, its names are found, and its blocks use what they use', async () => {
    const s = session();
    await Promise.all([tree(s), users(s), names(s)]);
    put('copyA.slx', disk('ctrlA.slx'));
    await s.changed([file('copyA.slx').uriString]);
    expect(await tree(s)).toContain('copyA.slx');
    expect((await s.names.list()).filter((r) => r.sourceLabel === 'copyA.slx').map((r) => r.name).sort()).toEqual(['GainA', 'LimitA']);
    expect(await users(s)).toEqual(['GainA', 'LimitA', 'GainA', 'LimitA', 'GainB']);
  });

  it('a file deleted: gone from the hierarchy, the names and the usage', async () => {
    const s = session();
    await Promise.all([tree(s), users(s), names(s)]);
    folder.delete('plantB.slx');
    await s.changed([file('plantB.slx').uriString]);
    expect(await tree(s)).not.toContain('plantB.slx');
    expect(await names(s)).not.toContain('GainB');
    expect(await users(s)).toEqual(['GainA', 'LimitA']);
  });

  it('a file saved: its names are read again, and only it', async () => {
    const s = session();
    await Promise.all([tree(s), users(s), names(s)]);
    reads = [];
    put('sharedParams.sldd', new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/params.sldd'))));
    await s.changed([DICT]);
    expect(await names(s)).not.toContain('SharedGain');
    await Promise.all([tree(s), users(s)]);
    expect(reads.filter((p) => p !== '/w/sharedParams.sldd')).toEqual([]);
  });

  it('a change without a hint reads every name again, through the cache', async () => {
    const s = session();
    await names(s);
    reads = [];
    put('sharedParams.sldd', new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/params.sldd'))));
    await s.changed();
    expect(await names(s)).not.toContain('SharedGain');
    expect(reads).toEqual(['/w/sharedParams.sldd']);
  });

  it('no change at all: the same answers, and nothing read again', async () => {
    const s = session();
    const before = await Promise.all([tree(s), users(s), names(s)]);
    reads = [];
    await s.changed([]);
    expect(await Promise.all([tree(s), users(s), names(s)])).toEqual(before);
    expect(reads).toEqual([]);
  });

  it('says whether a file is in the last listing, across a file created and then deleted', async () => {
    const s = session();
    const copy = file('copyA.slx').uriString;
    // Nothing listed yet: nothing is the folder's.
    expect(s.has(DICT)).toBe(false);
    await tree(s);
    expect(s.has(DICT)).toBe(true);
    expect(s.has(copy)).toBe(false);
    expect(s.has('file:///elsewhere/sharedParams.sldd')).toBe(false);
    put('copyA.slx', disk('ctrlA.slx'));
    await s.changed([copy]);
    expect(s.has(copy)).toBe(true);
    folder.delete('copyA.slx');
    await s.changed([copy]);
    expect(s.has(copy)).toBe(false);
    expect(s.has(DICT)).toBe(true);
    // It answers from what was listed, and lists nothing itself.
    expect(lists).toBe(3);
  });

  it('says when the folder is first listed: from the one listing, and without reading a file', async () => {
    const s = session();
    // Asked first, it lists the folder, and reads none of its files: the listing, not the hierarchy.
    await s.listed();
    expect(s.has(DICT)).toBe(true);
    expect(lists).toBe(1);
    expect(reads).toEqual([]);
    // The hierarchy asking meanwhile shares that listing.
    const t = session();
    await Promise.all([t.listed(), t.hierarchy.roots()]);
    expect(lists).toBe(2);
    // Once listed, it answers at once and lists nothing itself, across a change too.
    put('copyA.slx', disk('ctrlA.slx'));
    await t.changed([file('copyA.slx').uriString]);
    await t.listed();
    expect(t.has(file('copyA.slx').uriString)).toBe(true);
    expect(lists).toBe(3);
  });

  it('a first listing that fails is told, and the next call lists again', async () => {
    let fail = true;
    let asked = 0;
    let answer: (files: SourceFile[]) => void = () => {};
    const s = createFolderSession({
      files: {
        list: () => {
          asked++;
          if (fail) return Promise.reject(new Error('the folder is gone'));
          return new Promise<SourceFile[]>((done) => (answer = done));
        },
      },
      reader,
    });
    sessions.push(s);
    await expect(s.listed()).rejects.toThrow('the folder is gone');
    expect(s.has(DICT)).toBe(false);
    fail = false;
    // A change asked for while a listing is under way replaces it: listed() waits for the newer one.
    const first = s.listed();
    const change = s.changed();
    answer([file('sharedParams.sldd')]);
    await change;
    await first;
    expect(s.has(DICT)).toBe(true);
    expect(asked).toBe(3);
    // Disposed before any listing, a session says so rather than wait for one.
    const t = createFolderSession({ files: { list: () => new Promise<SourceFile[]>(() => {}) }, reader });
    t.dispose();
    await expect(t.listed()).rejects.toThrow('disposed before the folder was listed');
  });

  it("names a folder's project, across a project created and then deleted", async () => {
    const s = session();
    expect(await s.projectIn('file:///w')).toBeUndefined();
    put('Plant.prj', new Uint8Array(readFileSync(resolve(import.meta.dirname, 'parity/artifacts/project/MyProj/MyProj.prj'))));
    put('tool/matlab.toml', disk('../tomlproject/matlab.toml'));
    await s.changed([file('Plant.prj').uriString, file('tool/matlab.toml').uriString]);
    const plant = await s.projectIn('file:///w');
    expect(plant).toMatchObject({ kind: 'group', groupKind: 'project', id: file('Plant.prj').uriString, label: 'Plant' });
    // The row the hierarchy draws for it, with or without a trailing slash.
    expect((await s.hierarchy.roots()).find((r) => r.id === plant!.id)?.key).toBe(plant!.key);
    expect((await s.projectIn('file:///w/'))?.id).toBe(plant!.id);
    // A project in a folder of its own is that folder's, not its parent's; a folder with none has none.
    expect((await s.projectIn('file:///w/tool'))?.id).toBe(file('tool/matlab.toml').uriString);
    expect(await s.projectIn('file:///w/models')).toBeUndefined();
    folder.delete('Plant.prj');
    await s.changed([file('Plant.prj').uriString]);
    expect(await s.projectIn('file:///w')).toBeUndefined();
    expect((await s.projectIn('file:///w/tool'))?.id).toBe(file('tool/matlab.toml').uriString);
  });

  it('owes a data table one repost for a model deleted, and none for a dictionary saved', async () => {
    const s = session();
    await Promise.all([tree(s), users(s)]);
    let reposts = 0;
    const sub = s.reposts.subscribe(() => reposts++);
    put('sharedParams.sldd', disk('sharedParams.sldd'));
    await s.changed([DICT]);
    await sleep(20);
    expect(reposts).toBe(0);
    folder.delete('plantB.slx');
    await s.changed([file('plantB.slx').uriString]);
    await sleep(20);
    expect(reposts).toBe(1);
    sub.dispose();
  });

  it('hears its watch, a FolderReader-style one or a disposable one, and lets it go on dispose', async () => {
    let fire: (uris?: readonly string[]) => void = () => {};
    let stopped = 0;
    const asFunction: WatchFolder = (changed) => ((fire = changed), () => void stopped++);
    const s = session(asFunction);
    await tree(s);
    folder.delete('plantB.slx');
    fire([file('plantB.slx').uriString]);
    await expect.poll(() => tree(s)).not.toContain('plantB.slx');
    s.dispose();
    expect(stopped).toBe(1);
    const asObject: WatchFolder = () => ({ dispose: () => void stopped++ });
    session(asObject).dispose();
    expect(stopped).toBe(2);
  });

  it('does nothing more once disposed', async () => {
    const s = session();
    await tree(s);
    let reposts = 0;
    s.reposts.subscribe(() => reposts++);
    s.dispose();
    folder.delete('plantB.slx');
    await s.changed([file('plantB.slx').uriString]);
    await sleep(20);
    expect(lists).toBe(1);
    expect(reposts).toBe(0);
    // A subscription after dispose hears nothing either.
    s.reposts.subscribe(() => reposts++);
    await sleep(20);
    expect(reposts).toBe(0);
  });
});

describe('a workspace whose usage source comes later', () => {
  const usedBy = (rows: readonly TreeTableRow[], name: string): unknown => rows.find((r) => r.Name?.label === name)?.UsedBy;
  const blockNames = (cell: unknown): string[] => ((cell as { blockLinks?: { blockName: string }[] })?.blockLinks ?? []).map((b) => b.blockName);
  const blockCell = (rows: readonly TreeTableRow[], name: string): unknown => rows.find((r) => r._isBlockRow && r.Name?.label === name)?.UsedBy;
  const viewOf = (heard: { doc: string; change: TableChange }[], doc: string) =>
    (heard.filter((h) => h.doc === doc).at(-1)!.change as Extract<TableChange, { kind: 'replaceAll' }>).view;

  it('setUsage repaints every open table that is shown, refilled: dictionaries and models', async () => {
    const s = session();
    const ws = createWorkspace();
    try {
      const dict = await ws.open(disk('sharedParams.sldd'), 'sharedParams.sldd', DICT);
      const model = await ws.open(disk('ctrlA.slx'), 'ctrlA.slx', file('ctrlA.slx').uriString);
      const unshown = await ws.open(disk('plantB.slx'), 'plantB.slx', file('plantB.slx').uriString);
      expect(blockNames(usedBy((await dict.table.open()).rows, 'SharedGain'))).toEqual([]);
      // Before: a block's parameter cell is core's own answer, from the file alone.
      const sessionCell = blockCell((await model.table.open()).rows, 'GainA');
      const heard: { doc: string; change: TableChange }[] = [];
      dict.table.subscribe((change) => heard.push({ doc: 'dict', change }));
      model.table.subscribe((change) => heard.push({ doc: 'model', change }));
      await ws.setUsage(s.usage, s.reposts);
      expect(heard.map((h) => `${h.doc}:${h.change.kind}`).sort()).toEqual(['dict:replaceAll', 'model:replaceAll']);
      expect(blockNames(usedBy(viewOf(heard, 'dict').rows, 'SharedGain'))).toEqual(['GainA', 'LimitA', 'GainB']);
      // After: the graph's, which resolves the parameter to the dictionary that holds it, by uri.
      const graphCell = blockCell(viewOf(heard, 'model').rows, 'GainA');
      expect(graphCell).not.toEqual(sessionCell);
      expect(graphCell).toEqual({
        paramLinks: [expect.objectContaining({ paramName: 'SharedGain', source: 'sharedParams.sldd', linkTarget: `SharedGain@${DICT}` })],
      });
      // A table nobody shows is refilled at its next paint.
      expect(blockCell((await unshown.table.open()).rows, 'GainB')).toEqual({
        paramLinks: [expect.objectContaining({ paramName: 'SharedGain', linkTarget: `SharedGain@${DICT}` })],
      });
      // The repost subscriptions moved with it, and stay the dictionary's: a model created
      // repaints the dictionary, and not the model.
      heard.length = 0;
      put('copyA.slx', disk('ctrlA.slx'));
      await s.changed([file('copyA.slx').uriString]);
      await expect.poll(() => heard.length).toBe(1);
      await sleep(20);
      expect(heard.map((h) => h.doc)).toEqual(['dict']);
      expect(blockNames(usedBy(viewOf(heard, 'dict').rows, 'SharedGain'))).toEqual(['GainA', 'LimitA', 'GainA', 'LimitA', 'GainB']);
      // And without a source, every column is the files' own again.
      heard.length = 0;
      await ws.setUsage();
      expect(blockNames(usedBy(viewOf(heard, 'dict').rows, 'SharedGain'))).toEqual([]);
      expect(blockCell(viewOf(heard, 'model').rows, 'GainA')).toEqual(sessionCell);
    } finally {
      ws.dispose();
    }
  });

  it('doc.repaint paints the table again from the read it has', async () => {
    const ws = createWorkspace();
    try {
      const dict = await ws.open(disk('sharedParams.sldd'), 'sharedParams.sldd', DICT);
      const first = await dict.table.open();
      const heard: TableChange[] = [];
      dict.table.subscribe((change) => heard.push(change));
      await dict.repaint();
      expect(heard.map((c) => c.kind)).toEqual(['replaceAll']);
      const again = (heard[0] as Extract<TableChange, { kind: 'replaceAll' }>).view;
      expect(again).not.toBe(first);
      expect(again.rows.map((r) => r.ID)).toEqual(first.rows.map((r) => r.ID));
    } finally {
      ws.dispose();
    }
  });
});

describe('a folder whose listing was cut short', () => {
  it('ends the hierarchy with the row that says so, through the session', async () => {
    const s = createFolderSession({
      files: { list: async () => Object.assign([...folder.keys()].sort().map(file), { truncated: true }) },
      reader,
    });
    sessions.push(s);
    const roots = await s.hierarchy.roots();
    expect(roots.map((r) => r.kind)).toEqual(['group', 'notice']);
    expect(roots.at(-1)!.label).toBe(`Only the first ${folder.size} files are shown`);
  });
});

describe('a folder read across a channel', () => {
  it("follows the host's changes: the reader's onChange is the session's watch as it is", async () => {
    // The folder above, served where it is; the session, where the page is.
    const [host, page] = channel();
    const listing = async () => [...folder.keys()].sort().map(file);
    const server = serveFolder({ files: { list: listing }, reader }, host);
    const remote = folderReader(page);
    const heard: (readonly string[] | undefined)[] = [];
    const s = createFolderSession({
      files: remote,
      reader: () => remote,
      repostDelayMs: 1,
      watch: (changed) =>
        remote.onChange((uris) => {
          heard.push(uris);
          changed(uris);
        }),
    });
    sessions.push(s);
    try {
      expect(await tree(s)).not.toContain('copyA.slx');
      put('copyA.slx', disk('ctrlA.slx'));
      server.changed([file('copyA.slx').uriString]);
      await expect.poll(() => heard, { timeout: 10_000, interval: 5 }).toEqual([[file('copyA.slx').uriString]]);
      await expect.poll(() => tree(s), { timeout: 10_000, interval: 5 }).toContain('copyA.slx');
      await expect.poll(() => names(s), { timeout: 10_000, interval: 5 }).toEqual(
        ['GainA', 'GainA', 'GainB', 'LimitA', 'LimitA', 'SharedGain', 'UnusedVar'],
      );
      // And a change that names nothing: the session lists again all the same.
      folder.delete('copyA.slx');
      server.changed();
      await expect.poll(() => heard.length, { timeout: 10_000, interval: 5 }).toBe(2);
      expect(heard[1]).toBeUndefined();
      await expect.poll(() => tree(s), { timeout: 10_000, interval: 5 }).not.toContain('copyA.slx');
    } finally {
      server.dispose();
      remote.dispose();
    }
  });
});
