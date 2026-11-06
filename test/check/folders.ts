// Copyright 2026 The MathWorks, Inc.
//
// Folders for a folder check (folderCheck.test.ts): one held in memory, made in the test from
// existing fixtures' bytes and hand-written dictionaries, so that a case holds just the files it is
// about; and one of this repo's own folders, read from disk by core's node readers, as the app's
// command line reads one.
//
// Never a new fixture in test/fixtures/: the goldens walk that folder whole.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceFile } from 'data-explorer-core';
import { listFolder, nodeSourceReader, readProjectStoreFromDisk } from 'data-explorer-core/node';
import type { CheckFinding, CheckFolderOptions, FolderCheck } from '../../src/model/check/folderCheck.js';
import { folderFileList, listedFiles } from '../../src/model/hierarchy/folderList.js';

const REPO = resolve(import.meta.dirname, '../..');

/** A folder held in memory: each file's bytes by name, at `file:///w/<name>` (path `/w/<name>`), listed in code-point order; projects' stores null. */
export function memoryFolder(files: Record<string, Uint8Array | string>, options: { truncated?: boolean } = {}): CheckFolderOptions {
  const bytes = new Map(Object.entries(files).map(([name, b]) => [`/w/${name}`, typeof b === 'string' ? new TextEncoder().encode(b) : b]));
  const listing: SourceFile[] = [...bytes.keys()].sort().map((path) => ({ uriString: `file://${path}`, path }));
  return {
    files: { list: async () => folderFileList(listing, options.truncated === true) },
    reader: (listed) => {
      const known = new Set(listed.map((f) => f.path));
      const at = (f: SourceFile): Uint8Array | undefined => (known.has(f.path) ? bytes.get(f.path) : undefined);
      return {
        version: async (f) => (at(f) ? 'v1' : null),
        // A copy each time, as a disk read is: the cache and a workspace may each keep what they are handed.
        bytes: async (f) => at(f)?.slice().buffer ?? null,
        projectStore: async () => null,
      };
    },
  };
}

/** A JSON data dictionary whose Design Data holds `entries` (name → value) and which references `references`. */
export function jsonDictionary(entries: Record<string, number>, references: readonly string[] = []): string {
  // What test/fixtures/params.sldd holds, on one line.
  return JSON.stringify({
    __MW_TEXT_COREPROPERTIES__: { release: 'R2026b' },
    __MW_TEXT_PARTS__: {
      '__MW_TEXT_PART__/data/chunk0': {
        __MW_TEXT_content: {
          entries: Object.entries(entries).map(([name, value]) => ({ name, metadata: { uuid: `u-${name}`, isderived: '0' }, value })),
          'Dictionary References': [...references],
          AllowAccessBWS: '0',
        },
      },
    },
  });
}

/** A fixture's bytes: `test/fixtures/<name>`, or `test/shell/fixtures/<name>` with `shell`. */
export function fixture(name: string, shell = false): Uint8Array {
  return new Uint8Array(readFileSync(resolve(REPO, shell ? 'test/shell/fixtures' : 'test/fixtures', name)));
}

/** A folder of this repo read from disk: its supported files, recursively, in code-point order, by core's node readers (`nodeSourceReader`, `readProjectStoreFromDisk`). */
export function diskFolder(rel: string): CheckFolderOptions {
  const root = resolve(REPO, rel);
  return {
    files: { list: async () => listedFiles(await listFolder(root)) },
    reader: (listed) => ({ ...nodeSourceReader(listed), projectStore: (f) => readProjectStoreFromDisk(f.path) }),
  };
}

/** `check` with every uri written as its path from `root` (`file:///w/a.sldd` with root `file:///w/` → `a.sldd`), for short expectations. */
export function named(check: FolderCheck, root: string): FolderCheck {
  const name = (uri: string): string => (uri.startsWith(root) ? uri.slice(root.length) : uri);
  const finding = (f: CheckFinding): CheckFinding => {
    switch (f.kind) {
      case 'unresolved-reference':
      case 'unused':
        return { ...f, file: name(f.file) };
      case 'cycle':
      case 'duplicate':
        return { ...f, files: f.files.map(name) };
      case 'shadowed':
        return { ...f, model: name(f.model), hidden: name(f.hidden) };
    }
  };
  return {
    ...check,
    findings: check.findings.map(finding),
    notChecked: check.notChecked.map(name),
    unreadable: check.unreadable.map((u) => ({ ...u, file: name(u.file) })),
  };
}
