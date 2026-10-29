// Copyright 2026 The MathWorks, Inc.
//
// A folder's hierarchy against the VS Code extension's golden trees: for every fixture folder the
// extension pins, FolderHierarchy here draws the tree its sidebar draws, expanded all the way
// down, byte for byte.
//
// THE GOLDENS ARE THE EXTENSION'S. Each __snapshots__/<folder>/hierarchy.json is a copy of
// data-explorer-vscode's (its test/goldens/hierarchy.test.ts writes them: every node as its
// SectionsTreeProvider's getTreeItem draws it, every row with a twisty expanded through
// getChildren), and every file the trees open is at the same path here;
// `node scripts/copy-goldens.mjs <vscode checkout>` refreshes both. The folder is listed as the
// extension's goldens list it — its supported files, recursively, in code-point order, each under
// `file:///fx/<its path>` — and read from disk through core's own node readers.
//
// Nothing is normalised. A row is written out with the fields the extension's goldens record, in
// the order they record them, and the text is compared whole.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSupportedPath, type SourceFile } from 'data-explorer-core';
import { nodeSourceReader, readProjectStoreFromDisk } from 'data-explorer-core/node';
import { FolderHierarchy, type HierarchyItem } from '../../src/model/index.js';

const REPO = resolve(import.meta.dirname, '../..');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');

/** Every fixture folder with a tree pinned, by its repo path (the key with '__' as '/'). */
const FOLDERS = readdirSync(SNAPSHOTS)
  .filter((key) => readdirSync(join(SNAPSHOTS, key)).includes('hierarchy.json'))
  .map((key) => key.split('__').join('/'))
  .sort();

/** Code-point order, never `localeCompare`: folder order decides which same-named file a reference means. */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The supported files under `rel`, recursively, as the extension's goldens list a folder. */
function filesUnder(rel: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesUnder(child));
    else if (entry.isFile() && isSupportedPath(entry.name)) out.push(child);
  }
  return out.sort(byCodePoint);
}

const fakeFile = (rel: string): SourceFile => ({ uriString: `file:///fx/${rel}`, path: `/fx/${rel}` });
const diskPath = (file: SourceFile): string => join(REPO, file.path.replace(/^\/fx\//, ''));

/** The hierarchy of one fixture folder, read off disk by core's node readers. */
function hierarchyOf(folder: string): FolderHierarchy {
  const files = filesUnder(folder).map(fakeFile);
  return new FolderHierarchy({
    files: { list: async () => files },
    reader: (listed) => ({
      ...nodeSourceReader(listed, { pathOf: diskPath }),
      projectStore: async (file) => readProjectStoreFromDisk(diskPath(file)),
    }),
  });
}

/** One row as the extension's goldens record it: these fields, in this order. */
interface TreeRow {
  label: string;
  kind: string;
  groupKind?: string;
  id?: string;
  health?: string | null;
  collapsible: string;
  description?: string;
  children?: TreeRow[];
}

function recorded(item: HierarchyItem): TreeRow {
  const row: TreeRow = { label: item.label, kind: item.kind };
  if (item.groupKind !== undefined) row.groupKind = item.groupKind;
  if (item.id !== undefined) row.id = item.id;
  if (item.health !== undefined) row.health = item.health;
  row.collapsible = item.collapsible;
  if (item.description !== undefined) row.description = item.description;
  return row;
}

/** `items` recorded, and every one with a twisty expanded, as a user clicking every twisty would. */
async function expanded(hierarchy: FolderHierarchy, items: HierarchyItem[]): Promise<TreeRow[]> {
  const rows: TreeRow[] = [];
  for (const item of items) {
    const row = recorded(item);
    if (item.collapsible === 'collapsed') row.children = await expanded(hierarchy, await hierarchy.children(item));
    rows.push(row);
  }
  return rows;
}

/** Every file a row opens, at any depth. */
function opened(rows: TreeRow[], out = new Set<string>()): Set<string> {
  for (const row of rows) {
    if (row.id) out.add(row.id);
    if (row.children) opened(row.children, out);
  }
  return out;
}

describe('a folder hierarchy draws what the extension draws', { timeout: 60_000 }, () => {
  it('has every tree the extension pins', () => {
    // A floor, as the extension's: a copy that lost its snapshots would pass with none. The unit
    // fixtures, the projects (the only `.prj` groups), and each integration folder.
    expect(FOLDERS.length).toBe(14);
    expect(FOLDERS).toContain('test/fixtures');
    expect(FOLDERS).toContain('test/parity/artifacts/project');
    expect(FOLDERS).toContain('test-integration/fixtures/tomlproject');
  });

  for (const folder of FOLDERS) {
    it(folder, async () => {
      const hierarchy = hierarchyOf(folder);
      const rows = await expanded(hierarchy, await hierarchy.roots());
      const golden = readFileSync(join(SNAPSHOTS, folder.split('/').join('__'), 'hierarchy.json'), 'utf8');
      expect(JSON.stringify(rows, null, 1) + '\n').toBe(golden);
      // Every file of the folder is a row somewhere: a file the tree dropped would be gone from
      // the view the user is reading, and no edge could show it.
      expect([...opened(rows)].sort(byCodePoint)).toEqual(filesUnder(folder).map((rel) => fakeFile(rel).uriString));
    });
  }
});
