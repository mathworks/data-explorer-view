// Copyright 2026 The MathWorks, Inc.
//
// The browser host's registry of files (src/browser/files.ts): the paths it makes up for what a
// browser hands out, which the shell keeps as its tabs' and links resolve beside, and what each path
// reads. A path that changed meaning, or two files under one path, would open one file's tab on
// another's bytes, and save into it. Ported from data-explorer-app test/unit/web/files.test.ts.
import { describe, expect, it } from 'vitest';
import { WebFiles } from '../../src/browser/files.js';
import { asDir, asFile, changedSincePicked, fakeDir, FakeFileHandle, fileOf, listedDir } from './fakeFs.js';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytesOf = (s: string) => new TextEncoder().encode(s);

describe('WebFiles', () => {
  it('names each pick\'s files under a folder of its own, counting the picks', async () => {
    const files = new WebFiles();
    expect(await files.addPicked('a.sldd', { kind: 'file', file: fileOf('a.sldd') })).toBe('/files/1/a.sldd');
    expect(await files.addPicked('b.mat', { kind: 'file', file: fileOf('b.mat') })).toBe('/files/2/b.mat');
    expect(
      await files.addPick([
        { name: 'plant.slx', source: { kind: 'file', file: fileOf('plant.slx') } },
        { name: 'plant.sldd', source: { kind: 'file', file: fileOf('plant.sldd') } },
      ]),
    ).toEqual(['/files/3/plant.slx', '/files/3/plant.sldd']);
    expect(files.get('/files/3/plant.sldd')?.name).toBe('plant.sldd');
  });

  it('keeps two files of one name apart, from two picks or twice in one', async () => {
    const files = new WebFiles();
    const one = await files.addPicked('a.sldd', { kind: 'bytes', bytes: bytesOf('one') });
    const two = await files.addPicked('a.sldd', { kind: 'bytes', bytes: bytesOf('two') });
    expect(one).not.toBe(two);
    const [three, four] = await files.addPick([
      { name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('three') } },
      { name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('four') } },
    ]);
    expect([three, four]).toEqual(['/files/3/a.sldd', '/files/4/a.sldd']);
  });

  it('gives a file picked again through another handle the path it has, and a File one of its own', async () => {
    const files = new WebFiles();
    const a = new FakeFileHandle('a.sldd', 'one');
    const first = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(a) });
    // Another handle object to the same file, as a second pick gives, and another file of that name.
    expect(await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(a.again()) })).toBe(first);
    const other = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(new FakeFileHandle('a.sldd', 'other')) });
    expect(other).not.toBe(first);
    // A pick of the known file and a new one: only the new one takes the pick's folder.
    const b = new FakeFileHandle('b.sldd');
    expect(
      await files.addPick([
        { name: 'a.sldd', source: { kind: 'handle', handle: asFile(a.again()) } },
        { name: 'b.sldd', source: { kind: 'handle', handle: asFile(b) } },
      ]),
    ).toEqual([first, '/files/3/b.sldd']);
    // A file of a shown folder, picked: its folder path.
    const proj = fakeDir('proj', { 'sub/c.sldd': '' });
    const inFolder = files.addInFolder('/proj', 'sub/c.sldd', { kind: 'handle', handle: asFile(proj.file('sub/c.sldd')) });
    expect(await files.addPicked('c.sldd', { kind: 'handle', handle: asFile(proj.file('sub/c.sldd').again()) })).toBe(inFolder);
    // Files cannot be told apart.
    const file = fileOf('d.sldd');
    expect(await files.addPicked('d.sldd', { kind: 'file', file })).not.toBe(await files.addPicked('d.sldd', { kind: 'file', file }));
    expect(await files.pathOf(asFile(new FakeFileHandle('e.sldd')))).toBeUndefined();
  });

  it('names a shown folder\'s files under its root', () => {
    const files = new WebFiles();
    const path = files.addInFolder('/proj', 'data/a.sldd', { kind: 'file', file: fileOf('a.sldd') });
    expect(path).toBe('/proj/data/a.sldd');
    expect(files.has(path)).toBe(true);
    expect(files.get(path)?.name).toBe('a.sldd');
    expect(files.has('/proj/a.sldd')).toBe(false);
  });

  it('roots a folder at its name, a second of that name apart, and the same one again where it was', async () => {
    const files = new WebFiles();
    const proj = fakeDir('proj');
    expect(await files.folderRoot({ kind: 'handle', handle: asDir(proj) })).toBe('/proj');
    expect(await files.folderRoot({ kind: 'handle', handle: asDir(fakeDir('proj')) })).toBe('/proj (2)');
    expect(await files.folderRoot(listedDir('proj', { 'a.sldd': '' }))).toBe('/proj (3)');
    // Picked again: another handle object to the same directory.
    expect(await files.folderRoot({ kind: 'handle', handle: asDir(proj.again()) })).toBe('/proj');
    // The picks' folder is not a shown folder's.
    expect(await files.folderRoot({ kind: 'handle', handle: asDir(fakeDir('files')) })).toBe('/files (2)');
  });

  it('reads each kind of source: a handle as its file is now, a File as picked, bytes as held', async () => {
    const files = new WebFiles();
    const handle = new FakeFileHandle('h.sldd', 'from the handle');
    const h = await files.addPicked('h.sldd', { kind: 'handle', handle: asFile(handle) });
    const f = await files.addPicked('f.sldd', { kind: 'file', file: fileOf('f.sldd', 'from the file') });
    const b = await files.addPicked('b.sldd', { kind: 'bytes', bytes: bytesOf('held') });
    expect(text(await files.bytes(h))).toBe('from the handle');
    expect(text(await files.bytes(f))).toBe('from the file');
    expect(text(await files.bytes(b))).toBe('held');
    handle.writeOutside('written since');
    expect(text(await files.bytes(h))).toBe('written since');
    // A copy, so what the page does with it is not what the next read gets.
    (await files.bytes(b)).fill(0);
    expect(text(await files.bytes(b))).toBe('held');
  });

  it('says to open again a File another program wrote since it was picked', async () => {
    const files = new WebFiles();
    const path = await files.addPicked('a.sldd', { kind: 'file', file: changedSincePicked(fileOf('a.sldd', 'old')) });
    await expect(files.bytes(path)).rejects.toThrow('a.sldd changed since it was picked: open it again.');
  });

  it('rejects a read of a path it never made, as a missing file does', async () => {
    await expect(new WebFiles().bytes('/files/1/nothing.sldd')).rejects.toThrow(/ENOENT.*\/files\/1\/nothing\.sldd/);
  });

  it('stamps a file by its lastModified and size; none for held bytes, an unknown path or a file gone', async () => {
    const files = new WebFiles();
    const handle = new FakeFileHandle('h.sldd', 'four');
    const h = await files.addPicked('h.sldd', { kind: 'handle', handle: asFile(handle) });
    expect(await files.stamp(h)).toBe(`${handle.lastModified}:4`);
    handle.writeOutside('longer now');
    expect(await files.stamp(h)).toBe(`${handle.lastModified}:10`);
    expect(await files.stamp(await files.addPicked('f.sldd', { kind: 'file', file: fileOf('f.sldd', 'abc', 7_000) }))).toBe('7000:3');
    expect(await files.stamp(await files.addPicked('b.sldd', { kind: 'bytes', bytes: bytesOf('x') }))).toBeNull();
    expect(await files.stamp('/files/9/none.sldd')).toBeNull();
    handle.gone = true;
    expect(await files.stamp(h)).toBeNull();
  });

  it('reads a path from another source once it is replaced, under the name it had', async () => {
    const files = new WebFiles();
    const path = await files.addPicked('a.sldd', { kind: 'file', file: fileOf('a.sldd', 'old') });
    files.replace(path, { kind: 'bytes', bytes: bytesOf('new') });
    expect(text(await files.bytes(path))).toBe('new');
    expect(files.get(path)?.name).toBe('a.sldd');
  });
});
