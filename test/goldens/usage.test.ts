// Copyright 2026 The MathWorks, Inc.
//
// The Usage column of an in-page document against the VS Code extension's golden Usage cells: for
// every fixture the extension pins one for, a document opened in a workspace whose `usage` is its
// fixture folder fills the cells the extension's table shows for it.
//
// THE GOLDENS ARE THE EXTENSION'S. Each __snapshots__/<fixture>/usage.json is a copy of
// data-explorer-vscode's (its test/goldens/usage.test.ts writes them: the file opened with its
// fixture folder as the workspace, the graph over the summaries core's planSummaries scopes for it,
// and the provider's annotation; every row id mapped to the cell the fill left on it, an empty cell
// left out). `node scripts/copy-goldens.mjs <vscode checkout>` refreshes them. Here the folder is
// listed as the extension's goldens list it — its supported files that a usage graph reads,
// recursively, in code-point order, each under `file:///fx/<its path>` — read off disk by core's
// node reader, through UsageGraphs as the workspace's UsageSource, which is all an app writes.
// Nothing is normalised.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGraphPath, isSupportedPath, type SourceFile } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import { createWorkspace, UsageGraphs, type UsageSource } from '../../src/model/index.js';
import { snapshotText } from './snapshotText.js';

const REPO = resolve(import.meta.dirname, '../..');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');
const keyOf = (rel: string): string => rel.split('/').join('__');
const relOf = (key: string): string => key.split('__').join('/');
const has = (key: string, kind: string): boolean => readdirSync(join(SNAPSHOTS, key)).includes(`${kind}.json`);

/** The fixture folders, each a workspace: the ones a relationship tree is pinned for. */
const FOLDERS = readdirSync(SNAPSHOTS).filter((key) => has(key, 'hierarchy')).map(relOf).sort();
/** Every fixture with Usage cells pinned. */
const FIXTURES = readdirSync(SNAPSHOTS).filter((key) => has(key, 'usage')).map(relOf).sort();

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

/** The fixture folder `rel` is in: the deepest one that holds it. */
const folderOf = (rel: string): string =>
  FOLDERS.filter((f) => rel.startsWith(`${f}/`)).sort((a, b) => b.length - a.length)[0]!;

// One per folder, as one window's: its files, read through one cache for every document in it.
const usageOf = new Map<string, UsageSource>();
function folderUsage(folder: string): UsageSource {
  let usage = usageOf.get(folder);
  if (!usage) {
    // The files a usage graph reads (core's isGraphPath): no projects, which define no variables.
    const files = filesUnder(folder).filter((rel) => isGraphPath(rel)).map(fakeFile);
    usage = new UsageGraphs({
      inputs: {
        // A folder and nothing else: no editor's open files to key the graphs by.
        inputsKey: () => '',
        candidates: async () => files,
        readerFor: (listed) => nodeSourceReader(listed, { pathOf: diskPath }),
      },
    });
    usageOf.set(folder, usage);
  }
  return usage;
}

describe('in-page Usage cells fill as the extension fills them', { timeout: 60_000 }, () => {
  it('has every Usage golden the extension pins, each in a folder', () => {
    // A floor, as the extension's: a copy that lost its snapshots would pass with none.
    expect(FIXTURES.length).toBe(62);
    for (const rel of FIXTURES) expect(folderOf(rel), rel).toBeDefined();
    // Some of them have something to say: a dictionary whose entries models use, and a model.
    const said = FIXTURES.filter((rel) => readFileSync(join(SNAPSHOTS, keyOf(rel), 'usage.json'), 'utf8') !== '{}\n');
    expect(said.length).toBeGreaterThan(20);
    expect(said.some((rel) => rel.endsWith('.sldd'))).toBe(true);
    expect(said.some((rel) => rel.endsWith('.mat'))).toBe(true);
    expect(said.some((rel) => rel.endsWith('.slx'))).toBe(true);
  });

  for (const rel of FIXTURES) {
    it(rel, async () => {
      const ws = createWorkspace({ usage: folderUsage(folderOf(rel)) });
      try {
        const doc = await ws.open(new Uint8Array(readFileSync(join(REPO, rel))), rel.slice(rel.lastIndexOf('/') + 1), fakeFile(rel).uriString);
        const view = await doc.table.open();
        const cells: Record<string, unknown> = {};
        for (const row of view.rows) {
          // An empty cell is left out, as the extension's goldens leave it out.
          if (row.UsedBy === undefined || row.UsedBy === '') continue;
          const id = String(row.ID);
          if (Object.hasOwn(cells, id)) throw new Error(`${rel}: two rows answer for ${id}`);
          cells[id] = row.UsedBy;
        }
        expect(snapshotText(cells)).toBe(readFileSync(join(SNAPSHOTS, keyOf(rel), 'usage.json'), 'utf8'));
      } finally {
        ws.dispose();
      }
    });
  }
});
