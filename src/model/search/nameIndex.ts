// Copyright 2026 The MathWorks, Inc.
// A folder's index of entry NAMES inside its Simulink data sources, for a search over them by
// name. From the VS Code extension's nameIndex.ts, with what is VS Code's (its folder search, an
// open document's unsaved text) behind FolderFiles and NameReader. Deliberately standalone: it
// does not depend on the relationship graph or the usage graph, and it reads only names (never
// resolves them).
//
// The index is a Map<uriString, NameRecord[]> — one bucket per file — so that (a) duplicate names
// within and across files are preserved (each occurrence is its own record), and (b) an
// incremental update after a file change is a single-key replace rather than a full rebuild.
// Built LAZILY on first query and kept; invalidated wholesale by invalidate().
//
// Where each name comes FROM — the shared source cache for a model's parse and a dictionary's or
// a MAT-file's scan, and an unsaved buffer over both — is nameScan.ts, and the name extraction is
// nameExtract.ts.
import { mapLimited, newSourceCache, type SourceCache, type SourceFile } from 'data-explorer-core';
import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import type { NameRecord } from './nameExtract.js';
import { namesOfFile, type NameReader } from './nameScan.js';

/** What a NameIndex reads its folder with. */
export interface NameIndexOptions {
  /** The folder's files a name index reads: the kinds a usage graph reads (core's `isGraphPath`), no projects. */
  files: FolderFiles;
  /**
   * The reader for one pass's files: it answers only for them, and gives an open file's unsaved
   * bytes (`dirtyBytes`), which the index prefers over the file on disk and caches nowhere.
   */
  reader(files: readonly SourceFile[]): NameReader;
  /**
   * The cache the reads go through. Share the one the app's other folder passes read (its
   * FolderHierarchy's, its UsageGraphs'), so a folder is read once for all of them. Default: one
   * of its own.
   */
  cache?: SourceCache;
}

/** A folder's entry names: every dictionary entry, MAT-file variable, model-workspace variable and block. */
export class NameIndex {
  /** The cache its reads go through. */
  readonly cache: SourceCache;
  private readonly options: NameIndexOptions;
  // uriString -> that file's name records. Null while the lazy build has not run.
  private index: Map<string, NameRecord[]> | null = null;
  private building: Promise<void> | null = null;

  constructor(options: NameIndexOptions) {
    this.options = options;
    this.cache = options.cache ?? newSourceCache();
  }

  /** Drop the whole index; the next query reads the folder again. For a change a targeted reindex does not cover. */
  invalidate(): void {
    this.index = null;
    this.building = null;
  }

  /** Build the index if it is not built (once, however many ask at once). */
  ensure(): Promise<void> {
    if (!this.building) {
      const building = this.build();
      this.building = building;
      // A build that failed is not kept: the next ask builds again.
      building.catch(() => {
        if (this.building === building) this.building = null;
      });
    }
    return this.building;
  }

  /** Every name record of the folder, file by file, each occurrence its own. */
  async list(): Promise<NameRecord[]> {
    await this.ensure();
    const out: NameRecord[] = [];
    // NB: append with a loop, not `out.push(...bucket)`. A data source can hold tens of
    // thousands of entries, and spreading a huge array as call arguments overflows the engine's
    // argument limit ("Maximum call stack size exceeded").
    for (const bucket of this.index?.values() ?? []) {
      for (const rec of bucket) out.push(rec);
    }
    return out;
  }

  /**
   * Read `file` again and replace its bucket: for a file saved, or edited (its unsaved bytes,
   * through the reader's `dirtyBytes`). Before the first build this does nothing — an index built
   * off a single file would give incomplete answers, so the first query does the full scan.
   */
  async reindex(file: SourceFile): Promise<void> {
    if (!this.index) return;
    const index = this.index;
    const records = await namesOfFile(this.cache, this.options.reader([file]), file);
    // Only into the index it was read for: an invalidate meanwhile dropped that one.
    if (this.index === index) index.set(file.uriString, records);
  }

  /** Drop one file's bucket (the file was deleted). Safe before the build. */
  remove(uriString: string): void {
    this.index?.delete(uriString);
  }

  private async build(): Promise<void> {
    const map = new Map<string, NameRecord[]>();
    const files = await this.options.files.list();
    // A few files at a time: this scan is the heaviest of a folder's passes (it needs each
    // model's full parse to collect its block names), so it is also the one that must not hold
    // the whole folder at once. One reader for the whole pass, so every file is versioned and
    // read the same way.
    const reader = this.options.reader(files);
    await mapLimited(files, async (file) => {
      const records = await namesOfFile(this.cache, reader, file);
      if (records.length > 0) map.set(file.uriString, records);
    });
    // Assigned on exactly ONE path, deliberately: `index` non-null is what marks the build as
    // done. reindex() does nothing while it is null, and list() reads through it.
    this.index = map;
  }
}
