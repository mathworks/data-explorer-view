// Copyright 2026 The MathWorks, Inc.
// The folders the gallery shows as a hierarchy: fixture files, each an asset of the build
// (`?url`), fetched as bytes the way a page reads a folder the user dropped on it. A page has no
// filesystem, so the folder is the list below, a file's version is its URL (the build's files do
// not change), and no project store can be walked.
import workspaceBinary from '../../test-integration/fixtures/workspace/binary.sldd?url';
import workspaceData from '../../test-integration/fixtures/workspace/data.sldd?url';
import workspaceModel from '../../test-integration/fixtures/workspace/model.slx?url';
import workspaceParams from '../../test-integration/fixtures/workspace/params.sldd?url';
import type { SourceFile } from 'data-explorer-core';
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

/** The folder's hierarchy, read in the page. `isDirty` marks the files with unsaved changes. */
export function folderHierarchy(folder: GalleryFolder, isDirty?: (uri: string) => boolean): FolderHierarchy {
  const files: SourceFile[] = Object.keys(folder.files)
    .map((name) => `${folder.path}/${name}`)
    .sort(byCodePoint)
    .map((path) => ({ uriString: uriOf(path), path }));
  const urls = new Map(Object.entries(folder.files).map(([name, url]) => [uriOf(`${folder.path}/${name}`), url]));
  return new FolderHierarchy({
    files: { list: async () => files },
    reader: readerFor(urls),
    ...(isDirty ? { isDirty } : {}),
  });
}
