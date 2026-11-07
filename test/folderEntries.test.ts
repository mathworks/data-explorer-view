// Copyright 2026 The MathWorks, Inc.
//
// One level of a folder, as the Folder view lists it: which entries come first, and which files
// are the app's to open.
//
// The order is what a user scans a folder by, and it must not move: folders first, then files,
// each by name with case not mattering, and two names that differ only in case in one order
// every time (a host's readdir answers in whatever order its file system keeps). Whether a file
// is data is core's question (isSupportedPath), asked here and nowhere else, so a row the tree
// dims is a file the app really cannot open, and one it opens is one core reads.
import { describe, expect, it } from 'vitest';
import { entryKindOf, sortEntries, type FolderEntry } from '../src/model/index.js';

const entry = (name: string, kind: FolderEntry['kind'] = 'data'): FolderEntry => ({ name, path: `/w/${name}`, kind });
const names = (entries: readonly FolderEntry[]): string[] => entries.map((e) => e.name);

describe('sortEntries', () => {
  it('sorts files by name, case not mattering, then by code point', () => {
    expect(names(sortEntries([entry('b.sldd'), entry('A.slx'), entry('a.mat')]))).toEqual(['a.mat', 'A.slx', 'b.sldd']);
    // Two names that differ only in case: the upper-case one first (its code point is lower),
    // whichever order they came in.
    expect(names(sortEntries([entry('a.slx'), entry('A.slx')]))).toEqual(['A.slx', 'a.slx']);
    expect(names(sortEntries([entry('A.slx'), entry('a.slx')]))).toEqual(['A.slx', 'a.slx']);
  });

  it('puts the folders first, each part by name', () => {
    const sorted = sortEntries([entry('a.sldd'), entry('z', 'folder'), entry('notes.md', 'other'), entry('B', 'folder')]);
    expect(names(sorted)).toEqual(['B', 'z', 'a.sldd', 'notes.md']);
  });

  it('mixes data and other files: only a folder is set apart', () => {
    expect(names(sortEntries([entry('c.sldd'), entry('b.md', 'other'), entry('a.slx')]))).toEqual(['a.slx', 'b.md', 'c.sldd']);
  });

  it('returns a new array, and leaves the one it was given as it was', () => {
    const given = Object.freeze([entry('b.sldd'), entry('a.sldd')]);
    const sorted = sortEntries(given);
    expect(sorted).not.toBe(given);
    expect(names(given)).toEqual(['b.sldd', 'a.sldd']);
  });
});

describe('entryKindOf', () => {
  it.each(['x/a.sldd', 'a.slx', 'a.mdl', 'a.mat', 'p/MyProject.prj', 'p/matlab.toml', 'C:\\w\\A.SLX'])('%s is data', (path) => {
    expect(entryKindOf(path)).toBe('data');
  });

  it.each(['notes.md', 'gen.m', 'a.slxc', 'x/README', 'a.sldd.bak'])('%s is another file', (path) => {
    expect(entryKindOf(path)).toBe('other');
  });
});
