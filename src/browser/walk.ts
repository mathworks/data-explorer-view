// Copyright 2026 The MathWorks, Inc.
//
// A shown folder's files, over what a browser gives for a folder: a directory handle (Chromium's
// showDirectoryPicker, or a folder dropped there), or the list of files the browser read from it
// when it was picked (an `<input webkitdirectory>`, or a folder dropped in Firefox or Safari). Core's
// `listFolder` walks `node:fs`, behind its Node-only entry, which a page cannot load, so its rules are
// copied here as core v1.58.0 has them: which files count (a name `isSupportedPath` takes, a hidden
// one too), which directories are not entered (a hidden one, `node_modules`, `slprj`), the order
// (code-unit order of the path in the folder, `/` between its parts), and the limit, which keeps the
// first files in that order and says it cut. The order is the rule that matters most and shows
// least: folder order decides which of two same-named dictionaries a name means, so a browser page
// that listed a folder in another order would answer a Usage question differently from the desktop.
// test/browserHost/walk.test.ts lists one folder both ways and compares.
//
// Lifted from data-explorer-app src/web/walk.ts at b13a860 (its friction entry F56 asks core for a
// listing over any filesystem, which would take this file's rules back into core).

import { isSupportedPath } from 'data-explorer-core';
import { entriesOf } from './fsAccess.js';
import type { BrowserSource } from './files.js';

/** A file of a folder the browser listed when it was picked, by its `/`-separated path in the folder. */
export interface ListedFile {
  /** The file's path in the folder, the folder's own name not included: `sub/plant.sldd`. */
  rel: string;
  /** The file, as the browser gave it then: a reference that reads what the file holds now, if the browser lets it. */
  file: File;
}

/**
 * A folder the user picked: a handle to read it through, as it is each time it is read; or the
 * files the browser listed in it then, which a look at the folder later cannot add to.
 */
export type BrowserDir =
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  | {
      kind: 'list';
      /** The folder's own name. */
      root: string;
      files: readonly ListedFile[];
      /** The browser's reading of the folder stopped at a limit (a dropped folder's): it holds more than `files`. */
      truncated?: boolean;
    };

/** The most files a listing holds unless told otherwise: core's FOLDER_FILE_LIMIT. */
export const FOLDER_FILE_LIMIT = 10_000;

/** A folder's supported files, as listDirectory finds them. */
export interface WebListing {
  /** The supported files by their `/`-separated path in the folder, in the listing's order. */
  files: string[];
  /** True when the folder holds more supported files than `files`. */
  truncated: boolean;
  /** What reads each of `files`. */
  sources: ReadonlyMap<string, BrowserSource>;
}

/** The folder's own name. */
export const dirName = (dir: BrowserDir): string => (dir.kind === 'handle' ? dir.handle.name : dir.root);

/** A directory the listing does not enter: core's skipDirectory. */
export const skipDirectory = (name: string): boolean => name.startsWith('.') || name === 'node_modules' || name === 'slprj';

/** Code-unit order (JavaScript's `<`): the same on every machine, unlike `localeCompare`. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The supported files of `dir`, by core's listing rules, up to `limit` (FOLDER_FILE_LIMIT by
 * default; a non-negative whole number). Never rejects for the folder's contents: a directory that
 * cannot be read is passed over.
 */
export async function listDirectory(dir: BrowserDir, { limit = FOLDER_FILE_LIMIT }: { limit?: number } = {}): Promise<WebListing> {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`listDirectory: limit must be a non-negative integer, got ${limit}`);
  }
  return dir.kind === 'handle' ? walk(dir.handle, limit) : listPicked(dir.files, limit, dir.truncated === true);
}

/**
 * Core's walk: each directory's entries sorted as their paths will sort (a directory's name with
 * its `/`, a file's bare), depth first, so it can stop at the limit without reading the rest.
 */
async function walk(root: FileSystemDirectoryHandle, limit: number): Promise<WebListing> {
  const files: string[] = [];
  const sources = new Map<string, BrowserSource>();
  let truncated = false;
  // False once the limit is passed, so every level of the walk stops where it is.
  const visit = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<boolean> => {
    const entries: { key: string; handle: FileSystemHandle }[] = [];
    try {
      for await (const handle of entriesOf(dir)) {
        if (handle.kind === 'directory') {
          if (!skipDirectory(handle.name)) entries.push({ key: `${handle.name}/`, handle });
        } else if (isSupportedPath(handle.name)) {
          entries.push({ key: handle.name, handle });
        }
      }
    } catch {
      return true; // a directory that cannot be read is passed over
    }
    entries.sort((a, b) => byCodeUnit(a.key, b.key));
    for (const { key, handle } of entries) {
      if (handle.kind === 'directory') {
        if (!(await visit(handle as FileSystemDirectoryHandle, prefix + key))) return false;
      } else if (files.length === limit) {
        truncated = true;
        return false;
      } else {
        files.push(prefix + key);
        sources.set(prefix + key, { kind: 'handle', handle: handle as FileSystemFileHandle });
      }
    }
    return true;
  };
  await visit(root, '');
  return { files, truncated, sources };
}

/**
 * A listed folder's files. The browser has entered every directory already, so a file under one
 * the walk would not enter is dropped; and the walk's order is code-unit order of the whole paths,
 * so they are sorted as they are. A list the browser's reading cut short (`cut`) is a listing cut
 * short too, though which files it holds is the reading's order, not the walk's.
 */
function listPicked(picked: readonly ListedFile[], limit: number, cut: boolean): WebListing {
  const byPath = new Map<string, File>();
  for (const { rel, file } of picked) {
    const parts = rel.split('/');
    const name = parts.at(-1);
    if (name && isSupportedPath(name) && !parts.slice(0, -1).some(skipDirectory)) byPath.set(rel, file);
  }
  const all = [...byPath.keys()].sort(byCodeUnit);
  const files = all.slice(0, limit);
  return {
    files,
    truncated: cut || all.length > files.length,
    sources: new Map(files.map((rel) => [rel, { kind: 'file', file: byPath.get(rel)! }])),
  };
}
