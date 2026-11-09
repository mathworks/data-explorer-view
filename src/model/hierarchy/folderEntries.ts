// Copyright 2026 The MathWorks, Inc.
//
// One level of a folder, as the Folder view lists it: every entry, the folders, the data files and
// the other files, where the index (FolderFiles, FolderHierarchy) holds only the data files of the
// whole folder. A served folder answers it (FolderReads.entries, over the wire's `entries` ask), a
// folder row asks for it as it opens, so a folder nobody opens (a generated `slprj`) costs nothing.
//
// What is data is core's answer (isSupportedPath), never a list of extensions of its own here: a
// row the tree draws dimmed must be a file the app cannot open, and a row it opens one core reads.
//
// DOM-free.
import { isSupportedPath } from 'data-explorer-core';

/** What a folder row lists: a folder, a file the app opens, or any other file (drawn dimmed). */
export type FolderEntryKind = 'folder' | 'data' | 'other';

/** One entry of a folder, one level down. `path` is in the host's path scheme (as SourceFile.path). */
export interface FolderEntry {
  /** Its name in its folder: what its row reads. */
  name: string;
  /** Where it is, as the host names it: a folder's for listing it in turn, a file's for opening it. */
  path: string;
  kind: FolderEntryKind;
}

// Code-point order, so the same names sort the same in every locale: the order a user scans a
// folder by must not move with the machine's language (localeCompare's would).
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Folders first, then files; each by name, case-insensitively, then by code point (stable). The
 * code point decides between names that differ only in case (`A.slx` before `a.slx`), so a host
 * whose readdir answers in its own order gives one order every time, and a path decides between
 * two entries of one name (which no folder holds, but a host may send). A new array: the one given
 * is left as it was.
 */
export function sortEntries(entries: readonly FolderEntry[]): FolderEntry[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
      byCodePoint(a.name.toLowerCase(), b.name.toLowerCase()) ||
      byCodePoint(a.name, b.name) ||
      byCodePoint(a.path, b.path),
  );
}

/** 'data' for a path core opens (isSupportedPath from data-explorer-core), else 'other'. */
export function entryKindOf(path: string): 'data' | 'other' {
  return isSupportedPath(path) ? 'data' : 'other';
}
