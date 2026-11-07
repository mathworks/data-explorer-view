// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The browser host moving about the folder the user picked (the Folder view's host members): one
// level of a folder at a time, over a directory handle or the files the browser listed when it was
// picked; the folder above, up to the picked one and no further; another folder of it made the
// workspace folder, its files at the paths they had, so a tab open on one still reads it; this
// session's picked folders as the recent ones; and what ⟳ does for the folder shown.
//
// A page can reach no folder but what the user picked: a folder above it, or beside it, is none of
// the page's, and a path the page names outside it is refused.
import { afterEach, describe, expect, it } from 'vitest';
import { folderReader, portFromMessagePort } from '../../src/model/index.js';
import { browserHost, type BrowserHost } from '../../src/browser/host.js';
import type { BrowserDir } from '../../src/browser/walk.js';
import { asDir, fakeDir, listedDir } from './fakeFs.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A host that shows folders, and the folders it showed, in turn. */
function hostOf() {
  const folders: { root: string; port: MessagePort }[] = [];
  const host: BrowserHost = browserHost({
    window: new EventTarget(),
    document,
    navigator: {},
    onFolder: (root, port) => {
      folders.push({ root, port });
      stop.push(() => port.close());
    },
  });
  stop.push(() => host.dispose());
  return { host, folders };
}

/** What a page reads of the folder served on `port`. */
function readerOf(port: MessagePort) {
  const reader = folderReader(portFromMessagePort(port));
  stop.push(() => reader.dispose());
  return reader;
}

/** One level of `dir` in the folder served on `port`, as the Folder view reads it: sorted, `name kind` each. */
async function entriesAt(port: MessagePort, dir: string): Promise<string[] | null> {
  const entries = await readerOf(port).entries(dir);
  return entries && entries.map((e) => `${e.name} ${e.kind}`);
}

const FILES = {
  'b.sldd': 'bee',
  'A.slx': 'ay',
  'notes.md': '# notes',
  'models/ctrl.slx': 'ctrl',
  'models/deep/leaf.sldd': 'leaf',
  'models/gen.m': 'x',
  '.git/config': '',
  '.hidden.sldd': '',
};

describe.each([
  ['a directory handle', (): BrowserDir => ({ kind: 'handle', handle: asDir(fakeDir('proj', FILES)) })],
  ['the files a browser listed', (): BrowserDir => listedDir('proj', FILES)],
])('a folder picked as %s', (_, dirOf) => {
  it('lists one level of a folder of it: folders first, then files, a hidden name left out', async () => {
    const { host, folders } = hostOf();
    await host.openFolder(dirOf());
    const { root, port } = folders[0]!;
    expect(root).toBe('/proj');
    expect(await entriesAt(port, '/proj')).toEqual(['models folder', 'A.slx data', 'b.sldd data', 'notes.md other']);
    expect(await entriesAt(port, '/proj/models')).toEqual(['deep folder', 'ctrl.slx data', 'gen.m other']);
    expect(await entriesAt(port, '/proj/models/deep')).toEqual(['leaf.sldd data']);
    const [entry] = (await readerOf(port).entries('/proj/models/deep'))!;
    expect(entry!.path).toBe('/proj/models/deep/leaf.sldd');
  });

  it('refuses a folder outside the folder shown, and any path that only looks like one in it', async () => {
    const { host, folders } = hostOf();
    await host.openFolder(dirOf());
    const reader = readerOf(folders[0]!.port);
    for (const dir of ['/other', '/proj-x', '/proj/../other', '/proj/./models', '/proj//models', 'proj', '/proj/models/']) {
      await expect(reader.entries(dir), dir).rejects.toThrow('Not a folder of the shown folder.');
    }
    // One that is in it and is no folder of it.
    await expect(reader.entries('/proj/nowhere')).rejects.toThrow();
  });

  it('goes up to the folder picked, and no further', async () => {
    const { host } = hostOf();
    await host.openFolder(dirOf());
    expect(host.folderParent!('/proj/models/deep')).toBe('/proj/models');
    expect(host.folderParent!('/proj/models')).toBe('/proj');
    expect(host.folderParent!('/proj')).toBeNull();
    expect(host.folderParent!('/elsewhere')).toBeNull();
    expect(host.folderParent!('/')).toBeNull();
    // Another spelling of a folder of it is none: its parent would be another spelling again.
    for (const path of ['/proj/', '/proj/models/', '/proj//models', '/proj/./models', '/proj/../other']) {
      expect(host.folderParent!(path), path).toBeNull();
    }
  });

  it('makes a folder of it the workspace folder, its files at the paths they had, and back up again', async () => {
    const { host, folders } = hostOf();
    await host.openFolder(dirOf());
    // The shell lists the folder shown, and a tab is open on a file of it, before the move.
    await readerOf(folders[0]!.port).list();
    expect(text(await host.readFile('/proj/models/deep/leaf.sldd'))).toBe('leaf');
    expect(await host.openFolderAt!('/proj/models')).toBe(true);
    expect(folders.map((f) => f.root)).toEqual(['/proj', '/proj/models']);
    const reader = readerOf(folders[1]!.port);
    expect((await reader.list()).map((f) => f.path)).toEqual(['/proj/models/ctrl.slx', '/proj/models/deep/leaf.sldd']);
    expect(text(await host.readFile('/proj/models/deep/leaf.sldd'))).toBe('leaf');
    expect(await entriesAt(folders[1]!.port, '/proj/models')).toEqual(['deep folder', 'ctrl.slx data', 'gen.m other']);
    // Its entries are its own: the folder above is not the shown folder's.
    await expect(reader.entries('/proj')).rejects.toThrow('Not a folder of the shown folder.');
    expect(host.folderParent!('/proj/models')).toBe('/proj');
    expect(await host.openFolderAt!('/proj')).toBe(true);
    expect(folders.map((f) => f.root)).toEqual(['/proj', '/proj/models', '/proj']);
    // The index's listing, by core's rules: a hidden data file is one of it, as on the desktop.
    expect((await readerOf(folders[2]!.port).list()).map((f) => f.path)).toEqual([
      '/proj/.hidden.sldd',
      '/proj/A.slx',
      '/proj/b.sldd',
      '/proj/models/ctrl.slx',
      '/proj/models/deep/leaf.sldd',
    ]);
  });

  it('opens no folder outside the folders picked, and says why for one in it that is none', async () => {
    const { host, folders } = hostOf();
    await host.openFolder(dirOf());
    expect(await host.openFolderAt!('/elsewhere')).toBe(false);
    expect(await host.openFolderAt!('/proj-x')).toBe(false);
    // Another spelling of the folder or of a folder of it: served at it, its files would be at
    // paths they never had (`/proj//a.sldd`).
    for (const path of ['/proj/', '/proj/models/', '/proj//models', '/proj/./models', '/proj/../proj']) {
      expect(await host.openFolderAt!(path), path).toBe(false);
    }
    await expect(host.openFolderAt!('/proj/nowhere')).rejects.toThrow('nowhere');
    expect(folders.map((f) => f.root)).toEqual(['/proj']);
  });
});

describe('the folders of this session', () => {
  it('are the folders picked or dropped, newest first, and a move within one is none of them', async () => {
    const { host } = hostOf();
    expect(await host.recentFolders!()).toEqual([]);
    const one: BrowserDir = { kind: 'handle', handle: asDir(fakeDir('one', { 'a.sldd': '', 'sub/b.sldd': '' })) };
    await host.openFolder(one);
    await host.openFolder(listedDir('two', { 'b.sldd': '' }));
    expect(await host.recentFolders!()).toEqual(['/two', '/one']);
    // A move into a folder of one picked before: it is that one's, and no folder picked.
    expect(await host.openFolderAt!('/one/sub')).toBe(true);
    expect(await host.recentFolders!()).toEqual(['/two', '/one']);
    // The same directory picked again comes first again; a listed folder picked again is another.
    await host.openFolder(one);
    expect(await host.recentFolders!()).toEqual(['/one', '/two']);
    await host.openFolder(listedDir('two', { 'b.sldd': '' }));
    expect(await host.recentFolders!()).toEqual(['/two (2)', '/one', '/two']);
  });

  it('read ⟳ as reading the folder again for a handle, and as picking it again for a folder the browser listed', async () => {
    const { host } = hostOf();
    expect(host.folderRefresh).toBe('read');
    await host.openFolder(listedDir('two', { 'b.sldd': '' }));
    expect(host.folderRefresh).toBe('pick');
    await host.openFolder({ kind: 'handle', handle: asDir(fakeDir('one', { 'a.sldd': '' })) });
    expect(host.folderRefresh).toBe('read');
  });

  it('are no members of a host that shows no folders', () => {
    const host = browserHost({ window: new EventTarget(), document, navigator: {} });
    stop.push(() => host.dispose());
    expect([host.folderParent, host.openFolderAt, host.recentFolders]).toEqual([undefined, undefined, undefined]);
  });
});
