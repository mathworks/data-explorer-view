// Copyright 2026 The MathWorks, Inc.
//
// A folder's listing in a browser (src/browser/walk.ts), whose rules are core's listFolder's,
// copied because that walks node:fs: the same files, the same directories passed over, the same
// order and limit, over a directory handle and over the files a browser listed when the folder was
// picked. Folder order decides which of two same-named files a name means, so a listing that
// differed from the desktop's would answer a Usage question differently; one case lists a folder on
// disk with core itself and compares. Ported from data-explorer-app test/unit/web/walk.test.ts.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFolder } from 'data-explorer-core/node/folder';
import { listDirectory, type WebDir } from '../../src/browser/walk.js';
import { asDir, fakeDir, listedDir } from './fakeFs.js';

// A folder in no order of its own, with what core's listing skips and drops.
const FOLDER = {
  'a/x.slx': '',
  'Z.sldd': '',
  'notes.txt': '',
  'a-b.slx': '',
  'a.sldd': '',
  '.git/HEAD.sldd': '',
  'node_modules/pkg/p.sldd': '',
  'slprj/sim/cache.slx': '',
  'sub/.hidden/h.mat': '',
  'sub/.dotfile.mat': '',
  'sub/deep/m.MDL': '',
  'proj/Proj.prj': '',
  'proj/resources/project/Root.type.Root/x.xml': '',
  'toml/matlab.toml': '',
  'toml/Cargo.toml': '',
};
const LISTED = [
  'Z.sldd',
  'a-b.slx',
  'a.sldd',
  'a/x.slx',
  'proj/Proj.prj',
  'sub/.dotfile.mat',
  'sub/deep/m.MDL',
  'toml/matlab.toml',
];

const handleDir = (files: Record<string, string>): WebDir => ({ kind: 'handle', handle: asDir(fakeDir('root', files)) });
const listDir = (files: Record<string, string>): WebDir => listedDir('root', files);

describe.each([
  ['a directory handle', handleDir],
  ['the files a browser listed', listDir],
])('listDirectory over %s', (_, dirOf) => {
  it('lists the supported files in code-unit order of their path, as core\'s listFolder does', async () => {
    const listing = await listDirectory(dirOf(FOLDER));
    // `-` sorts before `/`, and capitals before lower case.
    expect(listing.files).toEqual(LISTED);
    expect(listing.truncated).toBe(false);
  });

  it('enters no hidden directory, node_modules or slprj, keeps hidden files, and drops what core does not read', async () => {
    const { files } = await listDirectory(dirOf(FOLDER));
    expect(files.filter((f) => /\.git|node_modules|slprj|\.hidden/.test(f))).toEqual([]);
    expect(files).toContain('sub/.dotfile.mat');
    expect(files.filter((f) => /notes\.txt|Cargo\.toml|\.xml$/.test(f))).toEqual([]);
  });

  it('stops at the limit with the first files in that order, and says it cut', async () => {
    expect(await listDirectory(dirOf(FOLDER), { limit: 3 })).toMatchObject({ files: LISTED.slice(0, 3), truncated: true });
    expect(await listDirectory(dirOf(FOLDER), { limit: LISTED.length })).toMatchObject({ files: LISTED, truncated: false });
    expect(await listDirectory(dirOf(FOLDER), { limit: 0 })).toMatchObject({ files: [], truncated: true });
  });

  it('gives what reads each file', async () => {
    const listing = await listDirectory(dirOf({ 'a/x.slx': 'model' }));
    const source = listing.sources.get('a/x.slx')!;
    const file = source.kind === 'handle' ? await source.handle.getFile() : source.kind === 'file' ? source.file : null;
    expect(file?.name).toBe('x.slx');
    expect(await file?.text()).toBe('model');
    expect(source.kind).toBe(dirOf === handleDir ? 'handle' : 'file');
  });

  it('refuses a limit that is not a non-negative whole number', async () => {
    await expect(listDirectory(dirOf(FOLDER), { limit: -1 })).rejects.toThrow(RangeError);
    await expect(listDirectory(dirOf(FOLDER), { limit: 1.5 })).rejects.toThrow(RangeError);
  });
});

describe('listDirectory over a directory handle', () => {
  it('lists what core\'s listFolder lists for the same folder on disk', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dex-web-walk-'));
    for (const [rel, content] of Object.entries(FOLDER)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), content);
    }
    for (const limit of [6, 10_000]) {
      const core = await listFolder(root, { limit });
      const web = await listDirectory(handleDir(FOLDER), { limit });
      expect(web.files).toEqual(core.files.map((f) => path.relative(root, f).split(path.sep).join('/')));
      expect(web.truncated).toBe(core.truncated);
    }
  });

  it('passes over a directory it cannot read', async () => {
    const root = fakeDir('root', { 'a.sldd': '', 'locked/b.sldd': '', 'c.sldd': '' });
    root.dir('locked').unreadable = true;
    expect((await listDirectory({ kind: 'handle', handle: asDir(root) })).files).toEqual(['a.sldd', 'c.sldd']);
  });
});
