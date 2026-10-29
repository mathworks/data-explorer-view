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
//
// And the same folder read across a channel (serveFolder where the files are, folderReader where
// the hierarchy is: test/goldens/channel.ts's, as a worker's) draws the same tree, finds the same
// row for every file (pathTo), and that row is the one its rule names, found in the tree drawn
// whole.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSupportedPath, type SourceFile } from 'data-explorer-core';
import { nodeSourceReader, readProjectStoreFromDisk } from 'data-explorer-core/node';
import { FolderHierarchy, folderReader, serveFolder, type FolderReads, type HierarchyItem } from '../../src/model/index.js';
import { channel } from './channel.js';

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

/** One fixture folder, listed as the extension lists it and read off disk by core's node readers. */
function readsOf(folder: string): FolderReads {
  const files = filesUnder(folder).map(fakeFile);
  return {
    files: { list: async () => files },
    reader: (listed) => ({
      ...nodeSourceReader(listed, { pathOf: diskPath }),
      projectStore: async (file) => readProjectStoreFromDisk(diskPath(file)),
    }),
  };
}

/** The hierarchy of one fixture folder, beside its reader. */
const hierarchyOf = (folder: string): FolderHierarchy => new FolderHierarchy(readsOf(folder));

/** The hierarchy of one fixture folder, its reader across a channel; its bytes moved, or copied. */
function acrossChannel(folder: string, transfer: boolean): { hierarchy: FolderHierarchy; stop: () => void } {
  const [host, page] = channel();
  const served = serveFolder(readsOf(folder), host, { transfer });
  const remote = folderReader(page);
  return {
    hierarchy: new FolderHierarchy({ files: remote, reader: () => remote }),
    stop: () => (served.dispose(), remote.dispose()),
  };
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

/** Every row of the tree, drawn whole: each with a twisty opened, as `expanded` opens them. */
interface Drawn {
  item: HierarchyItem;
  children: Drawn[];
}
async function drawn(hierarchy: FolderHierarchy, items: HierarchyItem[]): Promise<Drawn[]> {
  const out: Drawn[] = [];
  for (const item of items) {
    out.push({ item, children: item.collapsible === 'collapsed' ? await drawn(hierarchy, await hierarchy.children(item)) : [] });
  }
  return out;
}

/** pathTo's rule, read off the whole tree: the shallowest row of `uri`, the first of its depth from the top. */
function shallowest(tree: Drawn[], uri: string): string[] | undefined {
  let level = tree.map((node) => ({ node, path: [node.item.key] }));
  while (level.length > 0) {
    const found = level.find(({ node }) => node.item.id === uri);
    if (found) return found.path;
    level = level.flatMap(({ node, path }) => node.children.map((child) => ({ node: child, path: [...path, child.item.key] })));
  }
  return undefined;
}

const keysOf = (path: HierarchyItem[] | undefined): string[] | undefined => path?.map((item) => item.key);

describe('a folder hierarchy across a channel draws what it draws beside its reader', { timeout: 60_000 }, () => {
  for (const folder of FOLDERS) {
    it(folder, async () => {
      const near = hierarchyOf(folder);
      const nearRows = await expanded(near, await near.roots());
      const golden = readFileSync(join(SNAPSHOTS, folder.split('/').join('__'), 'hierarchy.json'), 'utf8');
      const tree = await drawn(near, await near.roots());
      const uris = [...opened(nearRows)];
      for (const transfer of [false, true]) {
        const { hierarchy: far, stop } = acrossChannel(folder, transfer);
        try {
          const farRows = await expanded(far, await far.roots());
          expect(JSON.stringify(farRows, null, 1) + '\n').toBe(golden);
          expect(farRows).toEqual(nearRows);
          for (const uri of uris) {
            const path = keysOf(await far.pathTo(uri));
            expect(path, uri).toEqual(keysOf(await near.pathTo(uri)));
            expect(path, uri).toEqual(shallowest(tree, uri));
          }
        } finally {
          stop();
        }
      }
    });
  }
});
