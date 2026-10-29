// Copyright 2026 The MathWorks, Inc.
// The folders the gallery shows as a hierarchy, and reads Usage over: fixture files, each an
// asset of the build (`?url`), fetched as bytes the way a page reads a folder the user dropped on
// it. A page has no filesystem, so a folder is the list below, a file's version is its URL (the
// build's files do not change), and no project store can be walked.
import workspaceBinary from '../../test-integration/fixtures/workspace/binary.sldd?url';
import workspaceData from '../../test-integration/fixtures/workspace/data.sldd?url';
import workspaceModel from '../../test-integration/fixtures/workspace/model.slx?url';
import workspaceParams from '../../test-integration/fixtures/workspace/params.sldd?url';
import usageCtrlA from '../../test-integration/fixtures/usageorder/ctrlA.slx?url';
import usagePlantB from '../../test-integration/fixtures/usageorder/plantB.slx?url';
import usageShared from '../../test-integration/fixtures/usageorder/sharedParams.sldd?url';
import { newSourceCache, type SourceCache, type SourceFile } from 'data-explorer-core';
import { FolderHierarchy, type GraphReader } from 'data-explorer-view/model';
import { FIXTURES } from './fixtures';

/** A folder: its path, and each file's name and URL. */
export interface GalleryFolder {
  path: string;
  files: Readonly<Record<string, string>>;
}

/** The integration suite's workspace: a model, the dictionaries it links, and one it does not. */
export const WORKSPACE: GalleryFolder = {
  path: '/fixtures/workspace',
  files: {
    'binary.sldd': workspaceBinary,
    'data.sldd': workspaceData,
    'model.slx': workspaceModel,
    'params.sldd': workspaceParams,
  },
};

/** Two models sharing one dictionary: its entry's Usage names the blocks of both. */
export const USAGE_ORDER: GalleryFolder = {
  path: '/fixtures/usageorder',
  files: { 'ctrlA.slx': usageCtrlA, 'plantB.slx': usagePlantB, 'sharedParams.sldd': usageShared },
};

/** The files the other pages open, as one folder: the uris openFixture opens them under. */
export const FIXTURE_FOLDER: GalleryFolder = {
  path: '/fixtures',
  files: Object.fromEntries(FIXTURES.map((f) => [f.name, f.url])),
};

/** The uri a file of a folder is listed, and opened, under. */
export const uriOf = (path: string): string => `file://${path}`;

/** Code-point order, as the hierarchy wants a folder listed: the same on every machine. */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function readerFor(urls: ReadonlyMap<string, string>): (files: readonly SourceFile[]) => GraphReader {
  return (files) => {
    const known = new Set(files.map((f) => f.uriString));
    const urlOf = (file: SourceFile): string | undefined => (known.has(file.uriString) ? urls.get(file.uriString) : undefined);
    return {
      version: async (file) => urlOf(file) ?? null,
      bytes: async (file) => {
        const url = urlOf(file);
        if (!url) return null;
        const response = await fetch(url);
        return response.ok ? response.arrayBuffer() : null;
      },
      projectStore: async () => null,
    };
  };
}

/** Folders read in the page: their files, in folder order, a reader for them, and one cache. */
export interface Reading {
  files: SourceFile[];
  /** Each file's URL, by its uri. */
  urls: ReadonlyMap<string, string>;
  reader: (files: readonly SourceFile[]) => GraphReader;
  cache: SourceCache;
}

/** `folders` as one read: what their hierarchy and their Usage both read, through one cache. */
export function readingOf(...folders: GalleryFolder[]): Reading {
  const listed = folders.flatMap((folder) =>
    Object.entries(folder.files).map(([name, url]) => ({ path: `${folder.path}/${name}`, url })),
  );
  const files = listed.map((f) => f.path).sort(byCodePoint).map((path): SourceFile => ({ uriString: uriOf(path), path }));
  const urls = new Map(listed.map((f) => [uriOf(f.path), f.url]));
  return { files, urls, reader: readerFor(urls), cache: newSourceCache() };
}

/** The folders' hierarchy, read in the page. `isDirty` marks the files with unsaved changes. */
export function folderHierarchy(reading: Reading, isDirty?: (uri: string) => boolean): FolderHierarchy {
  return new FolderHierarchy({
    files: { list: async () => reading.files },
    reader: reading.reader,
    cache: reading.cache,
    ...(isDirty ? { isDirty } : {}),
  });
}
