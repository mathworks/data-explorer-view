// Copyright 2026 The MathWorks, Inc.
//
// What a drop from the OS holds, as the browser host reads it (src/browser/drop.ts): Chromium's
// handles, Firefox's and Safari's entries, or the drop's Files alone, each read as what it is, in
// the order dropped. A DataTransfer's items can be read only while the drop is being handled, so
// every case closes the fake's drag data store as soon as dropSources is called: a read put after
// an await would throw there, as it does in a browser.
import { describe, expect, it } from 'vitest';
import { dropSources } from '../../src/browser/drop.js';
import { dataTransferOf, entryOf, fakeDir, FakeEntry, FakeFileHandle, fileOf } from './fakeFs.js';

/** The drop of `items`, read as a listener reads it: the store closed once the call returns. */
async function drop(...args: Parameters<typeof dataTransferOf>) {
  const { data, state } = dataTransferOf(...args);
  const read = dropSources(data);
  state.live = false;
  return read;
}

describe('dropSources', () => {
  it('reads Chromium\'s handles: a file as one that reads it now, a folder as one listed afresh', async () => {
    const a = new FakeFileHandle('a.sldd');
    const proj = fakeDir('proj');
    expect(await drop([{ handle: a, file: fileOf('a.sldd') }, { handle: proj }])).toEqual([
      { kind: 'file', name: 'a.sldd', source: { kind: 'handle', handle: a } },
      { kind: 'folder', dir: { kind: 'handle', handle: proj } },
    ]);
  });

  it('reads Firefox\'s and Safari\'s entries: a file by its File, a folder read through into its files', async () => {
    const plant = fileOf('plant.sldd');
    const folder = entryOf('proj', { 'a.sldd': '1', 'b.slx': '2', 'c.mat': '3', 'sub/d.sldd': '4', 'sub/deep/e.mdl': '5', 'notes.txt': '6' });
    const [file, dir] = await drop([{ entry: new FakeEntry('plant.sldd', ''), file: plant }, { entry: folder }], { handles: false });
    expect(file).toEqual({ kind: 'file', name: 'plant.sldd', source: { kind: 'file', file: plant } });
    if (dir.kind !== 'folder' || dir.dir.kind !== 'list') throw new Error('not a listed folder');
    expect(dir.dir.root).toBe('proj');
    // Every file, a text one too (a project's store is read from them), each by its path in the folder.
    expect(dir.dir.files.map((f) => f.rel).sort()).toEqual(['a.sldd', 'b.slx', 'c.mat', 'notes.txt', 'sub/d.sldd', 'sub/deep/e.mdl']);
    expect(await dir.dir.files.find((f) => f.rel === 'sub/d.sldd')?.file.text()).toBe('4');
  });

  it('reads nothing under a directory the listing would not enter, and passes over one it cannot read', async () => {
    const folder = entryOf('proj', { 'a.sldd': '', 'node_modules/pkg/x.sldd': '', '.git/HEAD.sldd': '', 'slprj/c.slx': '', 'locked/b.sldd': '' });
    folder.children.find((c) => c.name === 'locked')!.unreadable = true;
    const [dir] = await drop([{ entry: folder }], { handles: false });
    expect(dir.kind === 'folder' && dir.dir.kind === 'list' && dir.dir.files.map((f) => f.rel)).toEqual(['a.sldd']);
  });

  it('stops reading a dropped folder at the limit, and says it did', async () => {
    const folder = entryOf('proj', { 'a.sldd': '', 'b.sldd': '', 'c.sldd': '', 'sub/d.sldd': '', 'sub/e.sldd': '' });
    const read = async (limit: number) => {
      const { data, state } = dataTransferOf([{ entry: folder }], { handles: false });
      const dropped = dropSources(data, limit);
      state.live = false;
      const [dir] = await dropped;
      if (dir.kind !== 'folder' || dir.dir.kind !== 'list') throw new Error('not a listed folder');
      return { files: dir.dir.files.map((f) => f.rel).sort(), truncated: dir.dir.truncated };
    };
    expect(await read(3)).toEqual({ files: ['a.sldd', 'b.sldd', 'c.sldd'], truncated: true });
    expect(await read(5)).toEqual({ files: ['a.sldd', 'b.sldd', 'c.sldd', 'sub/d.sldd', 'sub/e.sldd'], truncated: false });
  });

  it('takes a drop with no items, or a browser with neither handles nor entries, by its Files', async () => {
    const a = fileOf('a.sldd');
    const { data } = dataTransferOf([], { files: [a] });
    expect(await dropSources(data)).toEqual([{ kind: 'file', name: 'a.sldd', source: { kind: 'file', file: a } }]);
    expect(await drop([{ file: a }], { handles: false, entries: false })).toEqual([{ kind: 'file', name: 'a.sldd', source: { kind: 'file', file: a } }]);
  });

  it('falls back to the entry and the File when the browser will not give a handle', async () => {
    const a = fileOf('a.sldd');
    const { data, state } = dataTransferOf([{ file: a, entry: new FakeEntry('a.sldd', '') }]);
    (data.items[0] as unknown as { getAsFileSystemHandle: () => Promise<never> }).getAsFileSystemHandle = () =>
      Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
    const read = dropSources(data);
    state.live = false;
    expect(await read).toEqual([{ kind: 'file', name: 'a.sldd', source: { kind: 'file', file: a } }]);
  });

  it('leaves out what is not a file, and an item that hands out nothing', async () => {
    const { data, state } = dataTransferOf([{ file: fileOf('a.sldd') }, {}], { handles: false, entries: false });
    const items = data.items as unknown as { kind: string }[];
    items.push({ kind: 'string' });
    const read = dropSources(data);
    state.live = false;
    expect((await read).map((d) => d.kind === 'file' && d.name)).toEqual(['a.sldd']);
  });
});
