// Copyright 2026 The MathWorks, Inc.
//
// Watching open files in a browser (src/browser/watch.ts): a change another program makes is told
// once; the page's own saves, overlapping ones too, are none; a look that began before a save says
// nothing of what it saw; a hidden page is not looked at; and a page that throws on one change
// still hears of the rest. Ported from data-explorer-app test/unit/web/watch.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebFiles } from '../../src/browser/files.js';
import { POLL_MS, watchOpenFiles, type OpenFileWatch } from '../../src/browser/watch.js';
import { asFile, FakeFileHandle, fileOf } from './fakeFs.js';

let watcher: OpenFileWatch | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  watcher?.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** An open file read through a handle, watched from the stamp it was read at. */
async function watched(visibilityState: DocumentVisibilityState = 'visible') {
  const files = new WebFiles();
  const handle = new FakeFileHandle('plant.sldd', 'one');
  const path = await files.addPicked('plant.sldd', { kind: 'handle', handle: asFile(handle) });
  const changed: string[] = [];
  const document = { visibilityState };
  watcher = watchOpenFiles(files, (p) => changed.push(p), { document });
  watcher.watch(path, await files.stamp(path));
  return { files, handle, path, changed, document, watcher };
}

const tick = () => vi.advanceTimersByTimeAsync(POLL_MS);

describe('watchOpenFiles', () => {
  it('reports a file another program wrote, once', async () => {
    const { handle, path, changed } = await watched();
    await tick();
    expect(changed).toEqual([]);
    handle.writeOutside('two, from outside');
    await tick();
    expect(changed).toEqual([path]);
    await tick();
    await tick();
    expect(changed).toEqual([path]);
  });

  it('takes the page\'s own save for no change, and the next write outside it for one', async () => {
    const { files, handle, path, changed, watcher } = await watched();
    watcher.saving(path);
    handle.writeOutside('two, saved');
    await tick();
    watcher.ownWrite(path, await files.stamp(path));
    await tick();
    expect(changed).toEqual([]);
    handle.writeOutside('three, from outside');
    await tick();
    expect(changed).toEqual([path]);
  });

  it('does not report what a look begun before a save saw of it', async () => {
    const { files, handle, path, changed, watcher } = await watched();
    // The look's read of the file waits until the save is written.
    let release!: () => void;
    const read = handle.getFile.bind(handle);
    handle.getFile = () => new Promise<void>((r) => (release = r)).then(read);
    await tick();
    watcher.saving(path);
    handle.writeOutside('two, saved');
    release();
    await vi.advanceTimersByTimeAsync(0);
    handle.getFile = read;
    watcher.ownWrite(path, await files.stamp(path));
    await tick();
    expect(changed).toEqual([]);
  });

  it('takes overlapping saves of one file for no change until the last of them is written', async () => {
    const { files, handle, path, changed, watcher } = await watched();
    watcher.saving(path);
    watcher.saving(path);
    handle.writeOutside('two, the first save');
    watcher.ownWrite(path, await files.stamp(path));
    // The second save is still being written.
    handle.writeOutside('three, the second save');
    await tick();
    expect(changed).toEqual([]);
    watcher.ownWrite(path, await files.stamp(path));
    await tick();
    expect(changed).toEqual([]);
    handle.writeOutside('four, from outside');
    await tick();
    expect(changed).toEqual([path]);
  });

  it('tells every changed file though the page throws on one, and goes on looking', async () => {
    const files = new WebFiles();
    const a = new FakeFileHandle('a.sldd', 'one');
    const b = new FakeFileHandle('b.sldd', 'one');
    const pathA = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(a) });
    const pathB = await files.addPicked('b.sldd', { kind: 'handle', handle: asFile(b) });
    const changed: string[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    watcher = watchOpenFiles(
      files,
      (p) => {
        changed.push(p);
        if (p === pathA) throw new Error('the page broke');
      },
      { document: { visibilityState: 'visible' } },
    );
    watcher.watch(pathA, await files.stamp(pathA));
    watcher.watch(pathB, await files.stamp(pathB));
    a.writeOutside('two');
    b.writeOutside('two');
    await tick();
    expect(changed).toEqual([pathA, pathB]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(pathA), expect.objectContaining({ message: 'the page broke' }));
    b.writeOutside('three');
    await tick();
    expect(changed).toEqual([pathA, pathB, pathB]);
  });

  it('looks at nothing while the page is hidden, and again once it is shown', async () => {
    const { handle, path, changed, document } = await watched('hidden');
    const getFile = vi.spyOn(handle, 'getFile');
    handle.writeOutside('two, from outside');
    await tick();
    await tick();
    expect(getFile).not.toHaveBeenCalled();
    expect(changed).toEqual([]);
    document.visibilityState = 'visible';
    await tick();
    expect(changed).toEqual([path]);
  });

  it('stops looking at a file unwatched, and at every file once disposed', async () => {
    const { files, handle, path, changed, watcher } = await watched();
    const other = new FakeFileHandle('other.sldd', 'one');
    const otherPath = await files.addPicked('other.sldd', { kind: 'handle', handle: asFile(other) });
    watcher.watch(otherPath, await files.stamp(otherPath));
    watcher.unwatch(path);
    handle.writeOutside('two');
    await tick();
    expect(changed).toEqual([]);
    watcher.dispose();
    other.writeOutside('two');
    await tick();
    expect(changed).toEqual([]);
  });

  it('takes the first stamp it sees for a file watched without one, and leaves a File alone', async () => {
    const files = new WebFiles();
    const handle = new FakeFileHandle('a.sldd', 'one');
    const path = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(handle) });
    const copy = await files.addPicked('b.sldd', { kind: 'file', file: fileOf('b.sldd', 'one') });
    const changed: string[] = [];
    watcher = watchOpenFiles(files, (p) => changed.push(p), { document: { visibilityState: 'visible' } });
    watcher.watch(path);
    watcher.watch(copy);
    await tick();
    expect(changed).toEqual([]);
    handle.writeOutside('two');
    await tick();
    expect(changed).toEqual([path]);
  });

  it('reports a file that is gone', async () => {
    const { handle, path, changed } = await watched();
    handle.gone = true;
    await tick();
    await tick();
    expect(changed).toEqual([path]);
  });
});
