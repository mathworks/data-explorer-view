// Copyright 2026 The MathWorks, Inc.
//
// FolderHierarchy: a folder's rows, read once and kept until the folder changes. The rows
// themselves are pinned against the VS Code extension's trees (goldens/hierarchy.test.ts); this
// is the rest of it — when the folder is read, what a rebuild and a refresh do, the marks, the
// keys a tree keeps its state by, and how a reference resolves — over a folder held in memory.
import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { newSourceCache, type SourceFile } from 'data-explorer-core';
import { FolderHierarchy, folderFileList, type GraphReader, type HierarchyItem } from '../src/model/index.js';

/** A compressed dictionary referencing `refs`, in the layout core reads. */
function sldd(...refs: string[]): Uint8Array {
  const objects = refs.map((r) => `<Object Class="DD.DICTIONARYREFERENCE"><P Name="Subdictionary">${r}</P></Object>`).join('');
  return zipSync({ 'data/chunk0.xml': strToU8(`<?xml version="1.0"?><DataSource FormatVersion="1">${objects}</DataSource>`) });
}

const file = (path: string): SourceFile => ({ uriString: `file://${path}`, path });

// The folder: bytes and a version per path, which a test may change. Reset per test.
let folder: Map<string, { bytes: Uint8Array; version: string }>;
let lists = 0;
let reads: string[] = [];
let failList = false;

function put(path: string, bytes: Uint8Array): void {
  const was = folder.get(path);
  folder.set(path, { bytes, version: `v${was ? Number(was.version.slice(1)) + 1 : 1}` });
}

const reader = (files: readonly SourceFile[]): GraphReader => {
  const known = new Set(files.map((f) => f.uriString));
  return {
    version: async (f) => (known.has(f.uriString) ? (folder.get(f.path)?.version ?? null) : null),
    bytes: async (f) => {
      reads.push(f.path);
      const b = known.has(f.uriString) ? folder.get(f.path)?.bytes : undefined;
      return b ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : null;
    },
    projectStore: async () => null,
  };
};

function hierarchy(isDirty?: (uri: string) => boolean): FolderHierarchy {
  return new FolderHierarchy({
    files: {
      list: async () => {
        lists++;
        if (failList) throw new Error('the folder is gone');
        return [...folder.keys()].sort().map(file);
      },
    },
    reader,
    ...(isDirty ? { isDirty } : {}),
  });
}

/** Every row, depth first, as `label (key)`, with every twisty opened. */
async function all(h: FolderHierarchy, items?: HierarchyItem[], depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (const item of items ?? (await h.roots())) {
    out.push(`${'  '.repeat(depth)}${item.label}`);
    if (item.collapsible === 'collapsed') out.push(...(await all(h, await h.children(item), depth + 1)));
  }
  return out;
}

async function find(h: FolderHierarchy, label: string, items?: HierarchyItem[]): Promise<HierarchyItem | undefined> {
  for (const item of items ?? (await h.roots())) {
    if (item.label === label) return item;
    if (item.collapsible === 'collapsed') {
      const found = await find(h, label, await h.children(item));
      if (found) return found;
    }
  }
  return undefined;
}

beforeEach(() => {
  folder = new Map();
  lists = 0;
  reads = [];
  failList = false;
  put('/w/top.sldd', sldd('mid.sldd', 'gone.sldd'));
  put('/w/mid.sldd', sldd('leaf.sldd'));
  put('/w/leaf.sldd', sldd());
});

describe('a folder hierarchy', () => {
  it('draws the folder, its references under each file', async () => {
    expect(await all(hierarchy())).toEqual(['w', '  top.sldd', '    mid.sldd', '      leaf.sldd', '    gone.sldd']);
  });

  it('reads the folder once, however many rows are asked for', async () => {
    const h = hierarchy();
    await all(h);
    await all(h);
    expect(lists).toBe(1);
    expect(reads.sort()).toEqual(['/w/leaf.sldd', '/w/mid.sldd', '/w/top.sldd']);
  });

  it('reads it again on rebuild(), and only what changed, through the cache', async () => {
    const h = hierarchy();
    await all(h);
    reads = [];
    put('/w/mid.sldd', sldd());
    h.rebuild();
    // leaf.sldd is referenced by nothing now, so it is a root of the folder of its own.
    expect(await all(h)).toEqual(['w', '  leaf.sldd', '  top.sldd', '    mid.sldd', '    gone.sldd']);
    expect(lists).toBe(2);
    expect(reads).toEqual(['/w/mid.sldd']);
  });

  it('keeps the graph on refresh(), and draws the marks again', async () => {
    const dirty = new Set<string>();
    const h = hierarchy((uri) => dirty.has(uri));
    expect((await find(h, 'mid.sldd'))?.health).toBeNull();
    dirty.add('file:///w/mid.sldd');
    h.refresh();
    expect((await find(h, 'mid.sldd'))?.health).toBe('modified');
    expect(lists).toBe(1);
  });

  it('tells its subscribers of each refresh and rebuild, until they stop', async () => {
    const h = hierarchy();
    let heard = 0;
    const stop = h.subscribe(() => heard++);
    h.refresh();
    h.rebuild();
    stop();
    h.refresh();
    expect(heard).toBe(2);
  });

  it('reads the folder again after a build that failed', async () => {
    const h = hierarchy();
    failList = true;
    await expect(h.roots()).rejects.toThrow('the folder is gone');
    failList = false;
    expect((await h.roots()).map((r) => r.label)).toEqual(['w']);
  });

  it('marks a cycle before an unsaved change, and does not expand it', async () => {
    put('/w/leaf.sldd', sldd('mid.sldd'));
    const h = hierarchy(() => true);
    // mid → leaf → mid: the repeat of mid is the cycle row.
    const leaf = await find(h, 'leaf.sldd');
    const [repeat] = await h.children(leaf!);
    expect(repeat).toMatchObject({
      label: 'mid.sldd',
      health: 'cycle',
      collapsible: 'none',
      description: '↻ circular reference',
      tooltip: '"mid.sldd" is part of a circular reference chain; expand it from its top-level occurrence.',
    });
    expect(leaf!.health).toBe('modified');
  });

  it('draws a reference no file answers as a warning, with no file to open', async () => {
    const gone = await find(hierarchy(), 'gone.sldd');
    expect(gone).toEqual({
      label: 'gone.sldd',
      kind: 'missing',
      collapsible: 'none',
      description: 'unresolved reference',
      tooltip: 'Referenced file "gone.sldd" was not found in the workspace.',
      key: expect.any(String),
    });
  });

  it('names each row by its icon', async () => {
    put('/w/m.slx', zipSync({}));
    put('/w/v.mat', new Uint8Array(0));
    const h = hierarchy();
    const [group] = await h.roots();
    expect(group).toMatchObject({ kind: 'group', groupKind: 'folder', icon: 'simulink_folder' });
    const icons = Object.fromEntries((await h.children(group!)).map((i) => [i.label, i.icon]));
    expect(icons).toEqual({ 'm.slx': 'simulink', 'top.sldd': 'simulink_database', 'v.mat': 'matlabWorkspaceFile' });
  });

  it('keys a row the same after a rebuild, and two rows under one parent apart', async () => {
    put('/w/top.sldd', sldd('mid.sldd', 'gone.sldd', 'gone.sldd'));
    const h = hierarchy();
    const before = await find(h, 'mid.sldd');
    h.rebuild();
    const after = await find(h, 'mid.sldd');
    expect(after).not.toBe(before);
    expect(after!.key).toBe(before!.key);
    const top = await find(h, 'top.sldd');
    const keys = (await h.children(top!)).map((i) => i.key);
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(key.startsWith(`${top!.key}/`)).toBe(true);
  });

  it('answers an item from before a rebuild with what its file holds now', async () => {
    const h = hierarchy();
    const mid = await find(h, 'mid.sldd');
    put('/w/mid.sldd', sldd('other.sldd'));
    h.rebuild();
    expect((await h.children(mid!)).map((i) => i.label)).toEqual(['other.sldd']);
  });

  it('has no rows under an item it did not make', async () => {
    const h = hierarchy();
    const [group] = await h.roots();
    expect(await h.children({ ...group! })).toEqual([]);
  });

  it("resolves a reference to the copy in the referrer's folder, else the first in the folder", async () => {
    put('/a/shared.sldd', sldd());
    put('/b/shared.sldd', sldd());
    put('/b/user.sldd', sldd('shared.sldd'));
    const h = hierarchy();
    expect(await h.resolveReference('shared.sldd', 'file:///b/user.sldd')).toBe('file:///b/shared.sldd');
    expect(await h.resolveReference('shared.sldd', 'file:///w/top.sldd')).toBe('file:///a/shared.sldd');
    expect(await h.resolveReference('nowhere.sldd', 'file:///w/top.sldd')).toBeUndefined();
  });

  it('resolves a link that names its file by a bare name by the same rule, and leaves any other alone', async () => {
    put('/a/shared.sldd', sldd());
    put('/b/shared.sldd', sldd());
    put('/b/user.sldd', sldd('shared.sldd'));
    const h = hierarchy();
    const from = 'file:///b/user.sldd';
    expect(await h.resolveLink({ kind: 'file', file: 'shared.sldd' }, from)).toBe('file:///b/shared.sldd');
    expect(await h.resolveLink({ kind: 'entry', name: 'Kp', source: 'SHARED.SLDD' }, from)).toBe('file:///b/shared.sldd');
    expect(await h.resolveLink({ kind: 'block', block: '65', source: 'shared.sldd' }, 'file:///w/top.sldd')).toBe('file:///a/shared.sldd');
    // A uri, a path or a Windows path names its file outright; a name no file has is no answer.
    for (const source of ['file:///b/shared.sldd', 'binedit:file:///b/shared.sldd', '/b/shared.sldd', 'C:\\b\\shared.sldd']) {
      expect(await h.resolveLink({ kind: 'entry', name: 'Kp', source }, from), source).toBeUndefined();
    }
    expect(await h.resolveLink({ kind: 'file', file: 'nowhere.sldd' }, from)).toBeUndefined();
    expect(await h.resolveLink({ kind: 'file', file: '' }, from)).toBeUndefined();
  });

  it("finds the path to a file's row: the shallowest, and of one depth the first from the top", async () => {
    const h = hierarchy();
    const labelsTo = async (uri: string) => (await h.pathTo(uri))?.map((item) => item.label);
    expect(await labelsTo('file:///w/leaf.sldd')).toEqual(['w', 'top.sldd', 'mid.sldd', 'leaf.sldd']);
    expect(await labelsTo('file:///w/top.sldd')).toEqual(['w', 'top.sldd']);
    expect(await labelsTo('file:///w/nowhere.sldd')).toBeUndefined();
    // Two files that reference x.sldd, at one depth: the first. A shorter way to leaf.sldd wins.
    put('/w/a.sldd', sldd('x.sldd'));
    put('/w/b.sldd', sldd('x.sldd', 'leaf.sldd'));
    put('/w/x.sldd', sldd());
    h.rebuild();
    expect(await labelsTo('file:///w/x.sldd')).toEqual(['w', 'a.sldd', 'x.sldd']);
    expect(await labelsTo('file:///w/leaf.sldd')).toEqual(['w', 'b.sldd', 'leaf.sldd']);
    const path = await h.pathTo('file:///w/x.sldd');
    // The tree's own rows: each the child of the one before it.
    expect(path!.map((item) => item.key)).toEqual([
      path![0]!.key,
      ...(await Promise.all(path!.slice(0, -1).map(async (item, i) => (await h.children(item)).find((c) => c.key === path![i + 1]!.key)!.key))),
    ]);
  });

  it('ends a folder whose listing was cut short with a row that says so, and only then', async () => {
    let cut = true;
    const h = new FolderHierarchy({
      files: { list: async () => folderFileList([...folder.keys()].sort().map(file), cut) },
      reader,
    });
    const roots = await h.roots();
    const notice = roots[roots.length - 1]!;
    expect(notice).toEqual({
      label: 'Only the first 3 files are shown',
      kind: 'notice',
      collapsible: 'none',
      tooltip: 'This folder holds more data files than the 3 listed. Open a folder inside it to see the rest.',
      key: '/notice%3Atruncated',
    });
    // It is no file and holds none: nothing opens it, nothing is under it, no path leads to it.
    expect(await h.children(notice)).toEqual([]);
    expect((await h.pathTo('file:///w/leaf.sldd'))?.map((i) => i.label)).toEqual(['w', 'top.sldd', 'mid.sldd', 'leaf.sldd']);
    cut = false;
    h.rebuild();
    expect((await h.roots()).map((r) => r.kind)).toEqual(['group']);
    // One file: the wording says one, and a count says where it was cut.
    const one = new FolderHierarchy({ files: { list: async () => folderFileList([file('/w/top.sldd')], true) }, reader });
    expect((await one.roots()).at(-1)!.label).toBe('Only the first file is shown');
    expect(
      (await new FolderHierarchy({ files: { list: async () => Object.assign(Array.from({ length: 12345 }, (_, i) => file(`/w/f${i}.sldd`)), { truncated: true }) }, reader }).roots()).at(-1)!.label,
    ).toBe('Only the first 12,345 files are shown');
  });

  it('reads through the cache it is given, which another pass may already hold', async () => {
    const cache = newSourceCache();
    const h1 = new FolderHierarchy({ files: { list: async () => [...folder.keys()].map(file) }, reader, cache });
    await h1.roots();
    reads = [];
    const h2 = new FolderHierarchy({ files: { list: async () => [...folder.keys()].map(file) }, reader, cache });
    await h2.roots();
    expect(reads).toEqual([]);
  });
});
