// Copyright 2026 The MathWorks, Inc.
//
// FolderTree: the Folder view's rows, a folder's entries merged with the index's hierarchy.
//
// What it protects. The index (FolderHierarchy) groups a folder's data files by directory and
// lists under a group only the files nothing else there references; the Folder view shows a
// folder as a file browser does, every entry one level at a time. So every data file of a folder
// is a row of that folder, the hierarchy's own row with its references under it (a file only ever
// referenced included), a folder is a folder row whether or not it holds data, and every other
// file a dimmed row that opens nothing. A row's key is its parent's key and one part of its own,
// the rule connectHierarchy walks a key back down by, and the same row has the same key on every
// call, so a tree keeps what was open. A host that lists no entries leaves the tree the
// hierarchy's, row for row; and none of the fields this adds ever appears on a row the hierarchy
// makes, which the VS Code extension's golden trees hold it to.
//
// Over a real FolderHierarchy of a folder held in memory (models, dictionaries and a MAT-file in
// the layouts core reads), and a fake `entries` over the same folder.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { SourceFile } from 'data-explorer-core';
import {
  FolderHierarchy,
  FolderTree,
  entryKindOf,
  folderFileList,
  rowPath,
  sourceUri,
  type FolderEntry,
  type GraphReader,
  type HierarchyItem,
} from '../src/model/index.js';

const buffer = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

/** A `.slx` with what the index reads of one: the models it references, its dictionary, its workspace's MAT-file. */
function slx(opts: { refs?: string[]; dictionary?: string; workspaceFile?: string } = {}): ArrayBuffer {
  const diagram: Record<string, unknown> = { ModelUUID: 'u1' };
  if (opts.dictionary) diagram.DataDictionary = opts.dictionary;
  if (opts.workspaceFile) diagram.ModelWorkspace = { WSDataSource: 'MAT-File', WSSourceFileName: opts.workspaceFile };
  const refs = (opts.refs ?? []).map((name, i) => ({ BlockPath: `m/Ref${i}`, ModelName: name }));
  return buffer(
    zipSync({
      'simulink/blockDiagram.json': strToU8(JSON.stringify({ BlockDiagram: diagram })),
      'simulink/graphicalInterface.json': strToU8(JSON.stringify({ GraphicalInterface: { ModelReferences: refs } })),
      'simulink/systems/system_root.xml': strToU8('<?xml version="1.0" encoding="utf-8"?><System></System>'),
      'metadata/coreProperties.xml': strToU8('<?xml version="1.0"?><coreProperties><version>R2026b</version></coreProperties>'),
    }),
  );
}

/** A compressed dictionary referencing `refs`. */
function sldd(...refs: string[]): ArrayBuffer {
  const objects = refs.map((r) => `<Object Class="DD.DICTIONARYREFERENCE"><P Name="Subdictionary">${r}</P></Object>`).join('');
  return buffer(zipSync({ 'data/chunk0.xml': strToU8(`<?xml version="1.0"?><DataSource FormatVersion="1">${objects}</DataSource>`) }));
}

// The folder: every file by its path (a data file's bytes, an other file's none), and the folders
// that hold no file. Reset per test.
let files: Map<string, ArrayBuffer | null>;
let emptyDirs: Set<string>;
let unreadable: Map<string, string>;
let indexLimit: number | null;
let entriesAsked: string[];

beforeEach(() => {
  files = new Map<string, ArrayBuffer | null>([
    ['/w/top.slx', slx({ refs: ['child'], dictionary: 'params.sldd', workspaceFile: 'ws.mat' })],
    ['/w/child.slx', slx({ refs: ['gone'] })],
    ['/w/params.sldd', sldd('base.sldd', 'lost.sldd')],
    ['/w/base.sldd', sldd()],
    ['/w/ws.mat', new ArrayBuffer(0)],
    ['/w/notes.md', null],
    ['/w/docs/readme.md', null],
    ['/w/docs/guide.txt', null],
    ['/w/models/sub.sldd', sldd()],
    ['/w/proj/MyProj.prj', new ArrayBuffer(0)],
    ['/w/proj/p.sldd', sldd()],
  ]);
  emptyDirs = new Set(['/w/empty']);
  unreadable = new Map();
  indexLimit = null;
  entriesAsked = [];
});

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/';
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The index's listing: the data files, recursively, in code-point order, cut at `indexLimit`. */
function listing(): SourceFile[] {
  const data = [...files.keys()].filter((path) => entryKindOf(path) === 'data').sort(byCodePoint);
  const kept = indexLimit === null ? data : data.slice(0, indexLimit);
  return folderFileList(
    kept.map((path) => ({ uriString: sourceUri(path), path })),
    kept.length < data.length,
  ) as SourceFile[];
}

const reader = (): GraphReader => ({
  version: async (f) => (files.has(f.path) ? `v:${f.path}` : null),
  bytes: async (f) => files.get(f.path) ?? null,
  projectStore: async () => null,
});

/** One level of `dir`, in an order of the host's own (reversed), as a host's readdir may answer. */
async function entries(dir: string): Promise<FolderEntry[]> {
  entriesAsked.push(dir);
  const why = unreadable.get(dir);
  if (why) throw new Error(why);
  const out = new Map<string, FolderEntry>();
  for (const path of [...files.keys(), ...emptyDirs]) {
    if (!path.startsWith(`${dir}/`)) continue;
    const rest = path.slice(dir.length + 1);
    const name = rest.split('/')[0]!;
    const isDir = rest.includes('/') || emptyDirs.has(path);
    out.set(name, { name, path: `${dir}/${name}`, kind: isDir ? 'folder' : entryKindOf(path) });
  }
  return [...out.values()].reverse();
}

const hierarchy = (): FolderHierarchy => new FolderHierarchy({ files: { list: async () => listing() }, reader });
const treeOf = (h = hierarchy()): FolderTree => new FolderTree({ hierarchy: h, entries, root: '/w' });

/** A row as these tests read it: its label, what it is, and what this tree adds. */
function line(item: HierarchyItem): string {
  const what = item.kind === 'group' ? `group/${item.groupKind}` : item.kind;
  const marks = [item.relation && `(${item.relation})`, item.dimmed && 'dimmed', item.description && `- ${item.description}`].filter(Boolean);
  return [item.label, `[${what}]`, ...marks].join(' ');
}

/** Every row, depth first, every twisty opened, as `line`s. */
async function draw(tree: { roots(): Promise<HierarchyItem[]>; children(item: HierarchyItem): Promise<HierarchyItem[]> }, items?: HierarchyItem[], depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (const item of items ?? (await tree.roots())) {
    out.push(`${'  '.repeat(depth)}${line(item)}`);
    if (item.collapsible === 'collapsed') out.push(...(await draw(tree, await tree.children(item), depth + 1)));
  }
  return out;
}

/** Every row, depth first, every twisty opened, with the row it is under. */
async function everyRow(
  tree: { roots(): Promise<HierarchyItem[]>; children(item: HierarchyItem): Promise<HierarchyItem[]> },
  items?: HierarchyItem[],
  parent: HierarchyItem | null = null,
): Promise<{ item: HierarchyItem; parent: HierarchyItem | null }[]> {
  const out: { item: HierarchyItem; parent: HierarchyItem | null }[] = [];
  for (const item of items ?? (await tree.roots())) {
    out.push({ item, parent });
    if (item.collapsible === 'collapsed') out.push(...(await everyRow(tree, await tree.children(item), item)));
  }
  return out;
}

async function rootRow(tree: FolderTree): Promise<HierarchyItem> {
  return (await tree.roots())[0]!;
}

async function child(tree: FolderTree, parent: HierarchyItem, label: string): Promise<HierarchyItem> {
  const found = (await tree.children(parent)).find((item) => item.label === label);
  expect(found, `${label} under ${parent.label}`).toBeDefined();
  return found!;
}

describe('a folder tree', () => {
  it("draws the workspace folder as one row, its path set, and the index's notice after it", async () => {
    const tree = treeOf();
    expect(await tree.roots()).toEqual([
      { label: 'w', kind: 'group', groupKind: 'folder', collapsible: 'collapsed', icon: 'simulink_folder', key: '/dir%3A%2Fw', path: '/w' },
    ]);
    indexLimit = 3;
    const cut = await treeOf().roots();
    expect(cut.map(line)).toEqual(['w [group/folder]', 'Only the first 3 files are shown [notice]']);
  });

  it('lists a folder: its folders first, then its files, each by name, whatever order the host answers in', async () => {
    const tree = treeOf();
    const rows = await tree.children(await rootRow(tree));
    expect(rows.map((r) => r.path)).toEqual([
      '/w/docs',
      '/w/empty',
      '/w/models',
      '/w/proj',
      '/w/base.sldd',
      '/w/child.slx',
      '/w/notes.md',
      '/w/params.sldd',
      '/w/top.slx',
      '/w/ws.mat',
    ]);
    expect(entriesAsked).toContain('/w');
  });

  it("draws every data file of a folder as the hierarchy's row for it, its references under it, a file only referenced too", async () => {
    // In the hierarchy, only top.slx is a row of /w: the others are reached through it.
    expect(await draw(hierarchy())).toEqual([
      'MyProj [group/project]',
      '  p.sldd [sldd]',
      'models [group/folder]',
      '  sub.sldd [sldd]',
      'w [group/folder]',
      '  top.slx [model]',
      '    child.slx [model]',
      '      gone.slx [missing] - unresolved reference',
      '    External Data [group/external-data]',
      '      params.sldd [sldd]',
      '        base.sldd [sldd]',
      '        lost.sldd [missing] - unresolved reference',
      '      ws.mat [mat]',
    ]);
    const tree = treeOf();
    const rows = await tree.children(await rootRow(tree));
    const files = rows.filter((r) => r.kind !== 'group');
    expect(files.map((r) => [r.label, r.kind, r.id, r.icon, r.health, r.collapsible])).toEqual([
      ['base.sldd', 'sldd', 'file:///w/base.sldd', 'simulink_database', null, 'none'],
      ['child.slx', 'model', 'file:///w/child.slx', 'simulink', null, 'collapsed'],
      ['notes.md', 'other', undefined, 'documentList', undefined, 'none'],
      ['params.sldd', 'sldd', 'file:///w/params.sldd', 'simulink_database', null, 'collapsed'],
      ['top.slx', 'model', 'file:///w/top.slx', 'simulink', null, 'collapsed'],
      ['ws.mat', 'mat', 'file:///w/ws.mat', 'matlabWorkspaceFile', null, 'none'],
    ]);
    expect(await draw(tree, files)).toEqual([
      'base.sldd [sldd]',
      'child.slx [model]',
      '  gone.slx [missing] (model reference) - unresolved reference',
      'notes.md [other] dimmed',
      'params.sldd [sldd]',
      '  base.sldd [sldd] (referenced dictionary)',
      '  lost.sldd [missing] (referenced dictionary) - unresolved reference',
      'top.slx [model]',
      '  child.slx [model] (model reference)',
      '    gone.slx [missing] (model reference) - unresolved reference',
      '  External Data [group/external-data]',
      '    params.sldd [sldd] (data dictionary)',
      '      base.sldd [sldd] (referenced dictionary)',
      '      lost.sldd [missing] (referenced dictionary) - unresolved reference',
      '    ws.mat [mat] (MAT-file)',
      'ws.mat [mat]',
    ]);
  });

  it("draws a data file's references as its own expansion: a cycle marked only where it closes", async () => {
    // r → a → b → a: in the hierarchy, b is reached through r and a only.
    files.set('/w/c/r.sldd', sldd('a.sldd'));
    files.set('/w/c/a.sldd', sldd('b.sldd'));
    files.set('/w/c/b.sldd', sldd('a.sldd'));
    const tree = treeOf();
    const b = await child(tree, await child(tree, await rootRow(tree), 'c'), 'b.sldd');
    expect(await draw(tree, [b])).toEqual([
      'b.sldd [sldd]',
      '  a.sldd [sldd] (referenced dictionary)',
      '    b.sldd [sldd] (referenced dictionary) - ↻ circular reference',
    ]);
  });

  it('says what each reference is to the file it is under, and only what the graph says', async () => {
    const tree = treeOf();
    const top = await child(tree, await rootRow(tree), 'top.slx');
    const [ref, external] = await tree.children(top);
    expect([ref!.label, ref!.relation]).toEqual(['child.slx', 'model reference']);
    // External Data is the model's, and no reference: the files under it are.
    expect(external!.label).toBe('External Data');
    expect(external!).not.toHaveProperty('relation');
    expect((await tree.children(external!)).map((r) => [r.label, r.relation])).toEqual([
      ['params.sldd', 'data dictionary'],
      ['ws.mat', 'MAT-file'],
    ]);
    const params = await child(tree, external!, 'params.sldd');
    expect((await tree.children(params)).map((r) => [r.label, r.relation])).toEqual([
      ['base.sldd', 'referenced dictionary'],
      ['lost.sldd', 'referenced dictionary'],
    ]);
    // A file of the folder is an entry, no reference.
    expect((await tree.children(await rootRow(tree))).filter((r) => r.relation !== undefined)).toEqual([]);
  });

  it('draws a missing reference under External Data with no relation: the graph does not say which kind it is', async () => {
    files.set('/w/top.slx', slx({ dictionary: 'nowhere.sldd' }));
    const tree = treeOf();
    const top = await child(tree, await rootRow(tree), 'top.slx');
    const [external] = await tree.children(top);
    const [missing] = await tree.children(external!);
    expect([missing!.label, missing!.kind]).toEqual(['nowhere.sldd', 'missing']);
    expect(missing!).not.toHaveProperty('relation');
  });

  it("draws a data file the index lacks (past its cap) as a plain row that opens it, with no rows under it", async () => {
    // The index keeps the first three of its code-point order: /w/base.sldd, /w/child.slx, /w/models/sub.sldd.
    indexLimit = 3;
    const tree = treeOf();
    const top = await child(tree, await rootRow(tree), 'top.slx');
    expect(top).toEqual({
      label: 'top.slx',
      kind: 'model',
      id: 'file:///w/top.slx',
      health: null,
      collapsible: 'none',
      icon: 'simulink',
      key: `/dir%3A%2Fw/${encodeURIComponent('file:///w/top.slx')}`,
      path: '/w/top.slx',
    });
    // The same key it has once the index holds it, so a tree keeps its place when it does.
    indexLimit = null;
    const whole = treeOf();
    const later = await child(whole, await rootRow(whole), 'top.slx');
    expect(later.key).toBe(top.key);
    expect(later.collapsible).toBe('collapsed');
  });

  it('draws a folder with no data files, and lists its other files dimmed when it opens', async () => {
    const tree = treeOf();
    const root = await rootRow(tree);
    const docs = await child(tree, root, 'docs');
    expect(docs).toEqual({
      label: 'docs',
      kind: 'group',
      groupKind: 'folder',
      collapsible: 'collapsed',
      icon: 'simulink_folder',
      key: '/dir%3A%2Fw/dir%3Adocs',
      path: '/w/docs',
    });
    expect((await tree.children(docs)).map(line)).toEqual(['guide.txt [other] dimmed', 'readme.md [other] dimmed']);
    // A folder holding nothing opens to nothing.
    expect(await tree.children(await child(tree, root, 'empty'))).toEqual([]);
  });

  it('draws an other file dimmed, as a plain document that opens nothing, its path kept for Reveal and Copy Path', async () => {
    const tree = treeOf();
    const notes = await child(tree, await rootRow(tree), 'notes.md');
    expect(notes).toEqual({
      label: 'notes.md',
      kind: 'other',
      dimmed: true,
      collapsible: 'none',
      icon: 'documentList',
      key: '/dir%3A%2Fw/other%3Anotes.md',
      path: '/w/notes.md',
    });
    expect(notes).not.toHaveProperty('id');
    expect(await tree.children(notes)).toEqual([]);
  });

  it('draws a file the host calls data and core does not read as an other file', async () => {
    const tree = new FolderTree({
      hierarchy: hierarchy(),
      root: '/w',
      entries: async () => [{ name: 'odd.xyz', path: '/w/odd.xyz', kind: 'data' }],
    });
    expect((await tree.children(await rootRow(tree))).map(line)).toEqual(['odd.xyz [other] dimmed']);
  });

  it("draws a project's folder by its own name, with the project's icon and name, opening the project's page", async () => {
    const tree = treeOf();
    const proj = await child(tree, await rootRow(tree), 'proj');
    expect(proj).toEqual({
      label: 'proj',
      kind: 'group',
      groupKind: 'project',
      id: 'file:///w/proj/MyProj.prj',
      description: 'MyProj',
      tooltip: 'Open the project page for "MyProj".',
      icon: 'simulink_project',
      collapsible: 'collapsed',
      key: '/dir%3A%2Fw/dir%3Aproj',
      path: '/w/proj',
    });
    // Its rows are its entries, not the project group's members.
    expect((await tree.children(proj)).map((r) => [r.label, r.kind, r.id, r.collapsible])).toEqual([
      ['MyProj.prj', 'project', 'file:///w/proj/MyProj.prj', 'none'],
      ['p.sldd', 'sldd', 'file:///w/proj/p.sldd', 'none'],
    ]);
  });

  it("says nothing more of a project's folder named as its project is", async () => {
    files.delete('/w/proj/MyProj.prj');
    files.set('/w/proj/proj.prj', new ArrayBuffer(0));
    const tree = treeOf();
    const proj = await child(tree, await rootRow(tree), 'proj');
    expect([proj.label, proj.groupKind, proj.icon]).toEqual(['proj', 'project', 'simulink_project']);
    expect(proj).not.toHaveProperty('description');
  });

  it("lists the root once for its row and its first opening, and again for each opening after", async () => {
    const tree = treeOf();
    const root = await rootRow(tree);
    await tree.children(root);
    expect(entriesAsked).toEqual(['/w']);
    await tree.children(root);
    expect(entriesAsked).toEqual(['/w', '/w']);
  });

  it("draws the folder still when the index cannot be read: its data files as plain rows that open them", async () => {
    let fail = true;
    const failing = new FolderHierarchy({
      files: {
        list: async () => {
          if (fail) throw new Error('the index is gone');
          return listing();
        },
      },
      reader,
    });
    const tree = treeOf(failing);
    const root = await rootRow(tree);
    expect(root).toMatchObject({ label: 'w', groupKind: 'folder' });
    const rows = await tree.children(root);
    expect(rows.map((r) => [r.label, r.kind, r.collapsible, r.id ?? null])).toEqual([
      ['docs', 'group', 'collapsed', null],
      ['empty', 'group', 'collapsed', null],
      ['models', 'group', 'collapsed', null],
      ['proj', 'group', 'collapsed', null],
      ['base.sldd', 'sldd', 'none', 'file:///w/base.sldd'],
      ['child.slx', 'model', 'none', 'file:///w/child.slx'],
      ['notes.md', 'other', 'none', null],
      ['params.sldd', 'sldd', 'none', 'file:///w/params.sldd'],
      ['top.slx', 'model', 'none', 'file:///w/top.slx'],
      ['ws.mat', 'mat', 'none', 'file:///w/ws.mat'],
    ]);
    // The index read again, once it can be: the same rows, with their references.
    fail = false;
    const again = await tree.children(root);
    expect(again.map((r) => r.key)).toEqual(rows.map((r) => r.key));
    expect(again.find((r) => r.label === 'top.slx')?.collapsible).toBe('collapsed');
    expect(again.find((r) => r.label === 'proj')?.groupKind).toBe('project');
  });

  it("says in a row after the root's that the index could not be read, and tells it once for each failure", async () => {
    let failWith: string | null = 'EACCES: permission denied';
    const failing = new FolderHierarchy({
      files: {
        list: async () => {
          if (failWith) throw new Error(failWith);
          return listing();
        },
      },
      reader,
    });
    const told: string[] = [];
    const tree = new FolderTree({ hierarchy: failing, entries, root: '/w', indexFailed: (err) => told.push((err as Error).message) });
    const notice = {
      label: "The folder's data files could not be read: EACCES: permission denied",
      kind: 'notice',
      collapsible: 'none',
      tooltip: 'Used By, the graph and Search have nothing of this folder until they can be read. Read the folder again to try once more.',
      key: '/notice%3Aunindexed',
    };
    expect((await tree.roots()).map((r) => r.label)).toEqual(['w', notice.label]);
    expect((await tree.roots())[1]).toEqual(notice);
    // Drawn again: the same failure, not told twice.
    expect(told).toEqual(['EACCES: permission denied']);
    // Read again: the notice goes; a failure after that is told again.
    failWith = null;
    failing.rebuild();
    expect((await tree.roots()).map((r) => r.label)).toEqual(['w']);
    failWith = 'EACCES: permission denied';
    failing.rebuild();
    await tree.roots();
    expect(told).toEqual(['EACCES: permission denied', 'EACCES: permission denied']);
  });

  it("fails as the hierarchy fails for a host that lists no entries: the tree is the hierarchy's", async () => {
    const failing = new FolderHierarchy({
      files: {
        list: async () => {
          throw new Error('the folder is gone');
        },
      },
      reader,
    });
    const told: unknown[] = [];
    const tree = new FolderTree({ hierarchy: failing, entries: async () => null, root: '/w', indexFailed: (err) => told.push(err) });
    await expect(tree.roots()).rejects.toThrow('the folder is gone');
    expect(told).toEqual([]);
  });

  it('asks the index nothing for a level of other files alone', async () => {
    const h = hierarchy();
    const tree = treeOf(h);
    const docs = await child(tree, await rootRow(tree), 'docs');
    const roots = vi.spyOn(h, 'roots');
    const rowOf = vi.spyOn(h, 'rowOf');
    expect((await tree.children(docs)).map(line)).toEqual(['guide.txt [other] dimmed', 'readme.md [other] dimmed']);
    expect(roots).not.toHaveBeenCalled();
    expect(rowOf).not.toHaveBeenCalled();
  });

  it('says a folder could not be read in a row of its own, rather than failing the tree', async () => {
    unreadable.set('/w/docs', "EACCES: permission denied, scandir '/w/docs'");
    const tree = treeOf();
    const docs = await child(tree, await rootRow(tree), 'docs');
    expect(await tree.children(docs)).toEqual([
      {
        label: "This folder could not be read: EACCES: permission denied, scandir '/w/docs'",
        kind: 'notice',
        collapsible: 'none',
        key: '/dir%3A%2Fw/dir%3Adocs/notice%3Aunreadable',
      },
    ]);
  });

  it("keeps each row's key on every call, each its parent's key and one part of its own", async () => {
    const first = await everyRow(treeOf());
    const again = await everyRow(treeOf());
    expect(again.map(({ item }) => item.key)).toEqual(first.map(({ item }) => item.key));
    // The same tree asked twice answers the same keys too.
    const tree = treeOf();
    const root = await rootRow(tree);
    expect((await tree.children(root)).map((r) => r.key)).toEqual((await tree.children(root)).map((r) => r.key));
    // connectHierarchy walks a key back down by its parts: `${parent.key}/<one encoded part>`.
    for (const { item, parent } of first) {
      const part = item.key.slice((parent?.key ?? '').length);
      expect(item.key.startsWith(parent?.key ?? ''), item.key).toBe(true);
      expect(part, item.key).toMatch(/^\/[^/]+$/);
    }
    // Siblings never share a key.
    const byParent = new Map<string, string[]>();
    for (const { item, parent } of first) byParent.set(parent?.key ?? '', [...(byParent.get(parent?.key ?? '') ?? []), item.key]);
    for (const keys of byParent.values()) expect(new Set(keys).size).toBe(keys.length);
  });

  it('finds the row of a file along its folders, for revealing the active tab', async () => {
    const tree = treeOf();
    const path = await tree.pathTo(sourceUri('/w/models/sub.sldd'));
    expect(path?.map((r) => r.label)).toEqual(['w', 'models', 'sub.sldd']);
    // The rows are the tree's own: each the one children() answers under the one before it.
    const [root, models, sub] = path!;
    expect((await tree.children(root!)).map((r) => r.key)).toContain(models!.key);
    expect((await tree.children(models!)).map((r) => r.key)).toContain(sub!.key);
    // A file the index reaches only through another is found in its own folder.
    expect((await tree.pathTo(sourceUri('/w/params.sldd')))?.map((r) => r.key)).toEqual([
      '/dir%3A%2Fw',
      `/dir%3A%2Fw/${encodeURIComponent('file:///w/params.sldd')}`,
    ]);
    // A project's marker is its plain row in the project's folder, not the folder.
    expect((await tree.pathTo(sourceUri('/w/proj/MyProj.prj')))?.map((r) => r.label)).toEqual(['w', 'proj', 'MyProj.prj']);
  });

  it('finds no row for a file outside the folder, and lists nothing to know it', async () => {
    const tree = treeOf();
    await tree.roots();
    entriesAsked = [];
    expect(await tree.pathTo(sourceUri('/elsewhere/a.sldd'))).toBeUndefined();
    expect(await tree.pathTo(sourceUri('/w-other/a.sldd'))).toBeUndefined();
    expect(entriesAsked).toEqual([]);
    // Inside it, but in no folder it lists.
    expect(await tree.pathTo(sourceUri('/w/gone/a.sldd'))).toBeUndefined();
  });

  it("gives a menu each row's path: an entry's own, a reference's file's, none for a row of no file", async () => {
    const tree = treeOf();
    const root = await rootRow(tree);
    const top = await child(tree, root, 'top.slx');
    const [ref, external] = await tree.children(top);
    // A reference row's path is its file's, as that file's own row in its folder has it.
    expect(ref!.path).toBe('/w/child.slx');
    expect(rowPath(ref!)).toBe((await child(tree, root, 'child.slx')).path);
    expect(rowPath(top)).toBe('/w/top.slx');
    expect(rowPath(root)).toBe('/w');
    expect(rowPath(await child(tree, root, 'notes.md'))).toBe('/w/notes.md');
    expect(rowPath(await child(tree, root, 'docs'))).toBe('/w/docs');
    expect(rowPath(external!)).toBeUndefined();
    const [gone] = await tree.children(await child(tree, root, 'child.slx'));
    expect(gone!.kind).toBe('missing');
    expect(rowPath(gone!)).toBeUndefined();
    // A row the hierarchy made: its file's path read back from its uri.
    const theirs = (await hierarchy().rowOf(sourceUri('/w/top.slx')))!;
    expect(theirs).not.toHaveProperty('path');
    expect(rowPath(theirs)).toBe('/w/top.slx');
  });

  it("spells a reference row's path as the root is, under a Windows drive, where its uri reads back lower-cased", async () => {
    const win = new Map<string, ArrayBuffer>([
      ['C:\\Work\\top.slx', slx({ refs: ['child'] })],
      ['C:\\Work\\child.slx', slx()],
    ]);
    const h = new FolderHierarchy({
      files: { list: async () => [...win.keys()].sort(byCodePoint).map((path) => ({ uriString: sourceUri(path), path })) },
      reader: () => ({ version: async (f) => `v:${f.path}`, bytes: async (f) => win.get(f.path) ?? null, projectStore: async () => null }),
    });
    const tree = new FolderTree({
      hierarchy: h,
      root: 'C:\\Work',
      entries: async (dir) =>
        dir === 'C:\\Work' ? ['top.slx', 'child.slx'].map((name) => ({ name, path: `C:\\Work\\${name}`, kind: 'data' as const })) : [],
    });
    const root = await rootRow(tree);
    const own = await child(tree, root, 'child.slx');
    const [ref] = await tree.children(await child(tree, root, 'top.slx'));
    expect(ref!.id).toBe('file:///c%3A/Work/child.slx');
    // Read back from the uri alone, the drive letter is lower-cased: the row's own path is not.
    expect(ref!.path).toBe('C:\\Work\\child.slx');
    expect(rowPath(ref!)).toBe(own.path);
    expect(rowPath({ ...ref!, path: undefined })).toBe('c:\\Work\\child.slx');
  });

  it('names every icon its rows draw from icons/', async () => {
    const icons = new Set((await everyRow(treeOf())).map(({ item }) => item.icon).filter((id): id is string => !!id));
    expect([...icons].sort()).toEqual([
      'documentList',
      'link_database',
      'matlabWorkspaceFile',
      'simulink',
      'simulink_database',
      'simulink_folder',
      'simulink_project',
    ]);
    for (const id of icons) expect(existsSync(join(process.cwd(), 'icons', `${id}.svg`)), id).toBe(true);
  });
});

describe('a host that lists no entries', () => {
  const none = async (): Promise<null> => null;

  it("is the hierarchy's tree, row for row and key for key", async () => {
    const h = hierarchy();
    const tree = new FolderTree({ hierarchy: h, entries: none, root: '/w' });
    const theirs = await everyRow(hierarchy());
    const ours = await everyRow(tree);
    expect(ours.map(({ item }) => item)).toEqual(theirs.map(({ item }) => item));
  });

  it("answers children with the hierarchy's own rows", async () => {
    const h = hierarchy();
    const tree = new FolderTree({ hierarchy: h, entries: none, root: '/w' });
    const [w] = await tree.roots();
    expect(await tree.children(w!)).toEqual(await h.children(w!));
  });

  it("finds a file's row as the hierarchy does", async () => {
    const h = hierarchy();
    const tree = new FolderTree({ hierarchy: h, entries: none, root: '/w' });
    expect((await tree.pathTo(sourceUri('/w/params.sldd')))?.map((r) => r.key)).toEqual(
      (await h.pathTo(sourceUri('/w/params.sldd')))?.map((r) => r.key),
    );
  });
});

describe("the hierarchy's own rows", () => {
  it('never carry what a folder tree adds, before a folder tree has drawn or after', async () => {
    const h = hierarchy();
    const before = await everyRow(h);
    await everyRow(new FolderTree({ hierarchy: h, entries, root: '/w' }));
    const after = await everyRow(h);
    for (const { item } of [...before, ...after]) {
      expect(item, item.key).not.toHaveProperty('dimmed');
      expect(item, item.key).not.toHaveProperty('path');
      expect(item, item.key).not.toHaveProperty('relation');
    }
  });
});
