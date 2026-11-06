// Copyright 2026 The MathWorks, Inc.
//
// A folder served in the page (src/browser/folder.ts): what an Electron main process serves over
// core's node/folder, over a directory handle or the files a browser listed. Its listing registers
// each file to be read as a picked one is, its reader keeps core's reader rules, a project's store
// reads as core reads it from disk, the port it returns answers a folder session as the shell
// reads one, and a look at the folder later tells what changed. Ported from data-explorer-app
// test/unit/web/folder.test.ts, over the parity suite's projects.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectStoreFromDisk } from 'data-explorer-core/node/folder';
import { createFolderSession, folderReader, portFromMessagePort, sourceUri } from '../../src/model/index.js';
import { WebFiles } from '../../src/browser/files.js';
import { folderLooks, serveWebFolder, webFolderReads } from '../../src/browser/folder.js';
import type { BrowserDir } from '../../src/browser/walk.js';
import { asDir, fakeDir, filesOnDisk, listedDir } from './fakeFs.js';

// The parity suite's projects, read where they are: MyProj and LibProj, with their `resources/project` stores.
const FIXTURES = path.resolve(import.meta.dirname, '../parity/artifacts');
const text = (buffer: ArrayBuffer | null) => (buffer ? new TextDecoder().decode(buffer) : buffer);
const file = (p: string) => ({ uriString: sourceUri(p), path: p });

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

const handleDir = (name: string, files: Record<string, string | Uint8Array>): BrowserDir => ({ kind: 'handle', handle: asDir(fakeDir(name, files)) });
const listDir = (name: string, files: Record<string, string | Uint8Array>): BrowserDir => listedDir(name, files);

describe.each([
  ['a directory handle', handleDir],
  ['the files a browser listed', listDir],
])('webFolderReads over %s', (_, dirOf) => {
  it('lists the folder under its root, registering each file to be read as a picked one is', async () => {
    const files = new WebFiles();
    const reads = webFolderReads('/work', dirOf('work', { 'b.sldd': 'bee', 'a/x.slx': 'ex', 'notes.txt': '' }), files);
    const list = await reads.files.list();
    expect(list.map((f) => f.path)).toEqual(['/work/a/x.slx', '/work/b.sldd']);
    expect(list.map((f) => f.uriString)).toEqual(['/work/a/x.slx', '/work/b.sldd'].map(sourceUri));
    expect(list.truncated).toBeFalsy();
    expect(new TextDecoder().decode(await files.bytes('/work/b.sldd'))).toBe('bee');
  });

  it('says when its listing was cut at the limit', async () => {
    const reads = webFolderReads('/work', dirOf('work', { 'a.sldd': '', 'b.sldd': '', 'c.sldd': '' }), new WebFiles(), 2);
    const list = await reads.files.list();
    expect(list.map((f) => f.path)).toEqual(['/work/a.sldd', '/work/b.sldd']);
    expect(list.truncated).toBe(true);
  });

  it('reads a listed file\'s version and bytes, and nothing for a file it was not given', async () => {
    const files = new WebFiles();
    const reads = webFolderReads('/work', dirOf('work', { 'a.sldd': 'four', 'b.sldd': 'other' }), files);
    const list = await reads.files.list();
    const reader = reads.reader(list.slice(0, 1));
    expect(await reader.version(list[0])).toBe(await files.stamp('/work/a.sldd'));
    expect(await reader.version(list[0])).toMatch(/^\d+:4$/);
    expect(text(await reader.bytes(list[0]))).toBe('four');
    expect(await reader.version(list[1])).toBeNull();
    expect(await reader.bytes(list[1])).toBeNull();
  });

  it('reads a .prj project\'s store as core reads it from disk, and a matlab.toml\'s, and none for another file', async () => {
    const files = new WebFiles();
    const onDisk = filesOnDisk(path.join(FIXTURES, 'project'));
    const reads = webFolderReads('/project', dirOf('project', { ...onDisk, 'Toml/matlab.toml': 'name = "T"' }), files);
    const list = await reads.files.list();
    const reader = reads.reader(list);
    const store = await reader.projectStore(file('/project/MyProj/MyProj.prj'));
    const expected = await readProjectStoreFromDisk(path.join(FIXTURES, 'project/MyProj/MyProj.prj'));
    expect(Object.keys(expected).length).toBeGreaterThan(10);
    // The same documents, in the same (sorted) order.
    expect(Object.entries(store ?? {})).toEqual(Object.entries(expected));
    expect(await reader.projectStore(file('/project/Toml/matlab.toml'))).toEqual({ 'matlab.toml': 'name = "T"' });
    expect(await reader.projectStore(file('/project/MyProj/models/projmodel.slx'))).toEqual({});
    // A marker without its store is an empty one, as on disk.
    expect(await reader.projectStore(file('/project/Gone/Gone.prj'))).toEqual({});
  });
});

describe('folderLooks', () => {
  it('tells the files created, deleted or written since its last look, the first look only learning the folder', async () => {
    const proj = fakeDir('proj', { 'a.sldd': '', 'b.sldd': 'one', 'sub/c.slx': '', 'notes.txt': '' });
    const look = folderLooks('/proj', { kind: 'handle', handle: asDir(proj) });
    expect(await look()).toEqual([]);
    expect(await look()).toEqual([]);
    proj.file('b.sldd').writeOutside('two');
    proj.add('sub/d.sldd');
    proj.remove('a.sldd');
    // A file core does not read is no change to the folder's files.
    proj.file('notes.txt').writeOutside('more');
    expect(await look()).toEqual(['/proj/b.sldd', '/proj/sub/d.sldd', '/proj/a.sldd'].map(sourceUri));
    expect(await look()).toEqual([]);
  });

  it('finds nothing in the files a browser listed, which are the folder as it was picked', async () => {
    const look = folderLooks('/proj', listedDir('proj', { 'a.sldd': '' }));
    expect(await look()).toEqual([]);
    expect(await look()).toEqual([]);
  });
});

describe('serveWebFolder', () => {
  it('tells the page the folder changed, with the files that did', async () => {
    const served = serveWebFolder('/work', handleDir('work', { 'a.sldd': '' }), new WebFiles());
    const reader = folderReader(portFromMessagePort(served.port));
    stop.push(
      () => reader.dispose(),
      () => served.close(),
      () => served.port.close(),
    );
    const heard = new Promise<readonly string[] | undefined>((resolve) => reader.onChange(resolve));
    served.changed([sourceUri('/work/a.sldd')]);
    expect(await heard).toEqual([sourceUri('/work/a.sldd')]);
  });

  it('serves the folder on the port it returns, to a folder session as the page reads one', async () => {
    const files = new WebFiles();
    const onDisk = filesOnDisk(path.join(FIXTURES, 'project'));
    const served = serveWebFolder('/project', handleDir('project', onDisk), files);
    const reader = folderReader(portFromMessagePort(served.port));
    const session = createFolderSession({ files: reader, reader: () => reader });
    stop.push(
      () => session.dispose(),
      () => reader.dispose(),
      () => served.close(),
      () => served.port.close(),
    );

    const list = await reader.list();
    expect(list.map((f) => f.path)).toContain('/project/MyProj/models/projmodel.slx');
    const model = list.find((f) => f.path.endsWith('projmodel.slx'))!;
    expect(new Uint8Array((await reader.bytes(model))!)).toEqual(new Uint8Array(readFileSync(path.join(FIXTURES, 'project/MyProj/models/projmodel.slx'))));
    expect(await reader.version(model)).toBe(await files.stamp(model.path));
    expect(Object.keys((await reader.projectStore(file('/project/MyProj/MyProj.prj'))) ?? {})).toContain('resources/project/Project.xml');

    // The session lists the folder, reads its projects' stores, and shows the model under its project.
    await session.listed();
    expect(session.has(model.uriString)).toBe(true);
    const labels = (await session.hierarchy.roots()).map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(['MyProj', 'LibProj']));
    expect((await session.hierarchy.pathTo(model.uriString))?.map((r) => r.label)).toContain('MyProj');
  });
});
