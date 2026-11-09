// Copyright 2026 The MathWorks, Inc.
//
// The browser host's registry of files (src/browser/files.ts): the paths it makes up for what a
// browser hands out, which the shell keeps as its tabs' and links resolve beside, and what each path
// reads. A path that changed meaning, or two files under one path, would open one file's tab on
// another's bytes, and save into it. And an app's own files added to a group it names, which share
// one folder whenever each is added, so a model fetched first finds the dictionary fetched after it
// beside it. Ported from data-explorer-app test/unit/web/files.test.ts.
import { describe, expect, it } from 'vitest';
import { titleOfPath, WebFiles } from '../../src/browser/files.js';
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

  it("gives a handle to a file inside a shown folder its place there, though the folder never listed it", async () => {
    // Chromium's New or Save As writing a file into the folder the Explorer shows: the folder's next
    // look lists it under its place, so a path of a pick's would show it twice, and open it twice.
    const files = new WebFiles();
    const proj = fakeDir('proj', { 'models/a.slx': '' });
    const root = await files.folderRoot({ kind: 'handle', handle: asDir(proj) });
    const made = proj.add('models/new.sldd', 'made');
    const path = await files.pathOf(asFile(made.again()));
    expect(path).toBe('/proj/models/new.sldd');
    // Held as the folder's listing would hold it: a read goes through the handle.
    expect(text(await files.bytes(path!))).toBe('made');
    expect(files.get(path!)?.name).toBe('new.sldd');
    expect(await files.addPicked('new.sldd', { kind: 'handle', handle: asFile(made) })).toBe(path);
    // The latest folder shown first: one shown inside the first names the file by its place in it.
    const models = await files.folderRoot({ kind: 'handle', handle: asDir(proj.dir('models')) });
    expect(models).toBe('/models');
    expect(await files.pathOf(asFile(proj.add('models/b.sldd')))).toBe('/models/b.sldd');
    expect(root).toBe('/proj');
    // A file under none of them, or a folder listed from Files, which has no handle to ask: none.
    await files.folderRoot(listedDir('list', { 'c.sldd': '' }));
    expect(await files.pathOf(asFile(new FakeFileHandle('c.sldd')))).toBeUndefined();
  });

  it("says what a path means to the user, for a tooltip: a pick's file by its name, a folder's by its place in the folder", async () => {
    // The shell's tooltips showed the path, and a pick's folder is the page's own making.
    const files = new WebFiles();
    expect(titleOfPath(await files.addPicked('a.sldd', { kind: 'file', file: fileOf('a.sldd') }))).toBe('a.sldd');
    expect(titleOfPath(files.addInFolder('/proj (2)', 'data/a.sldd', { kind: 'file', file: fileOf('a.sldd') }))).toBe('proj (2)/data/a.sldd');
    expect(titleOfPath(files.addInFolder('/files (2)', 'b.mat', { kind: 'file', file: fileOf('b.mat') }))).toBe('files (2)/b.mat');
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

  it("puts an app's files added under one group in one folder, whenever each comes", async () => {
    const files = new WebFiles();
    const added = await files.addToGroup('site', [{ name: 'plant.slx', source: { kind: 'bytes', bytes: bytesOf('model') } }]);
    // A pick in between takes a folder of its own, and the group keeps its.
    expect(await files.addPicked('other.sldd', { kind: 'bytes', bytes: bytesOf('picked') })).toBe('/files/2/other.sldd');
    const later = await files.addToGroup('site', [
      { name: 'plant.sldd', source: { kind: 'bytes', bytes: bytesOf('dictionary') } },
      { name: 'base.sldd', source: { kind: 'file', file: fileOf('base.sldd') } },
    ]);
    expect(added.paths).toEqual(['/files/1/plant.slx']);
    expect(later.paths).toEqual(['/files/1/plant.sldd', '/files/1/base.sldd']);
    expect([added.replaced, later.replaced]).toEqual([[], []]);
    expect(text(await files.bytes('/files/1/plant.sldd'))).toBe('dictionary');
    expect(files.get('/files/1/base.sldd')?.name).toBe('base.sldd');
  });

  it('keeps two groups apart, and apart from the picks', async () => {
    const files = new WebFiles();
    const one = await files.addToGroup('samples', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('one') } }]);
    const two = await files.addToGroup('other', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('two') } }]);
    const picked = await files.addPick([{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('three') } }]);
    const again = await files.addToGroup('samples', [{ name: 'b.sldd', source: { kind: 'bytes', bytes: bytesOf('four') } }]);
    expect([one.paths, two.paths, picked, again.paths]).toEqual([['/files/1/a.sldd'], ['/files/2/a.sldd'], ['/files/3/a.sldd'], ['/files/1/b.sldd']]);
  });

  it('takes a name the group has for the same file: its path, read from what was added last, and says so', async () => {
    const files = new WebFiles();
    const first = await files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('first') } }]);
    const second = await files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('second') } }]);
    expect(second).toEqual({ paths: first.paths, replaced: first.paths });
    expect(text(await files.bytes(first.paths[0]!))).toBe('second');
    // Twice in one call: the later one, at the one path.
    const twice = await files.addToGroup('site', [
      { name: 'c.sldd', source: { kind: 'bytes', bytes: bytesOf('one') } },
      { name: 'c.sldd', source: { kind: 'bytes', bytes: bytesOf('two') } },
    ]);
    expect(twice).toEqual({ paths: ['/files/1/c.sldd', '/files/1/c.sldd'], replaced: [] });
    expect(text(await files.bytes('/files/1/c.sldd'))).toBe('two');
  });

  it('takes a file added again as it was for no change: equal bytes, or a File of the same size and date', async () => {
    const files = new WebFiles();
    const bytes = (s: string) => ({ kind: 'bytes' as const, bytes: bytesOf(s) });
    const file = (content: string, date: number) => ({ kind: 'file' as const, file: fileOf('b.sldd', content, date) });
    const [a] = (await files.addToGroup('site', [{ name: 'a.sldd', source: bytes('same') }])).paths;
    const [b] = (await files.addToGroup('site', [{ name: 'b.sldd', source: file('same', 7_000) }])).paths;
    // Fetched again, as a second press of a page's Samples button fetches them: nothing replaced.
    expect(await files.addToGroup('site', [{ name: 'a.sldd', source: bytes('same') }, { name: 'b.sldd', source: file('same', 7_000) }])).toEqual({ paths: [a, b], replaced: [] });
    // Other bytes, another date or size, or another kind of source is another file.
    expect((await files.addToGroup('site', [{ name: 'a.sldd', source: bytes('other') }])).replaced).toEqual([a]);
    expect((await files.addToGroup('site', [{ name: 'b.sldd', source: file('same', 8_000) }])).replaced).toEqual([b]);
    expect((await files.addToGroup('site', [{ name: 'b.sldd', source: file('longer', 8_000) }])).replaced).toEqual([b]);
    expect((await files.addToGroup('site', [{ name: 'b.sldd', source: bytes('longer') }])).replaced).toEqual([b]);
    expect(text(await files.bytes(b!))).toBe('longer');
  });

  it("replaces a file whose path a handle of the same call kept, and says so", async () => {
    const files = new WebFiles();
    const h = new FakeFileHandle('b.sldd', 'handle');
    const [kept] = (await files.addToGroup('site', [{ name: 'b.sldd', source: { kind: 'handle', handle: asFile(h) } }])).paths;
    // The handle again keeps its path; a file of its name after it in the call takes its place.
    const both = await files.addToGroup('site', [
      { name: 'b.sldd', source: { kind: 'handle', handle: asFile(h.again()) } },
      { name: 'b.sldd', source: { kind: 'bytes', bytes: bytesOf('bytes') } },
    ]);
    expect(both).toEqual({ paths: [kept, kept], replaced: [kept] });
    expect(text(await files.bytes(kept!))).toBe('bytes');
  });

  it('gives a handle to a file the page has a path for that path, as a pick does, and replaces nothing', async () => {
    const files = new WebFiles();
    const a = new FakeFileHandle('a.sldd', 'picked');
    const picked = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(a) });
    expect(await files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'handle', handle: asFile(a.again()) } }])).toEqual({ paths: [picked], replaced: [] });
    // The group's own file again, through another handle: the same path, and nothing replaced.
    const b = new FakeFileHandle('b.sldd');
    const [inGroup] = (await files.addToGroup('site', [{ name: 'b.sldd', source: { kind: 'handle', handle: asFile(b) } }])).paths;
    expect(await files.addToGroup('site', [{ name: 'b.sldd', source: { kind: 'handle', handle: asFile(b.again()) } }])).toEqual({ paths: [inGroup], replaced: [] });
  });

  it('makes no folder for a group given no files', async () => {
    const files = new WebFiles();
    expect(await files.addToGroup('site', [])).toEqual({ paths: [], replaced: [] });
    expect(await files.addPicked('x.sldd', { kind: 'bytes', bytes: bytesOf('x') })).toBe('/files/1/x.sldd');
  });

  it('reads a path from another source once it is replaced, under the name it had', async () => {
    const files = new WebFiles();
    const path = await files.addPicked('a.sldd', { kind: 'file', file: fileOf('a.sldd', 'old') });
    files.replace(path, { kind: 'bytes', bytes: bytesOf('new') });
    expect(text(await files.bytes(path))).toBe('new');
    expect(files.get(path)?.name).toBe('a.sldd');
  });
});
