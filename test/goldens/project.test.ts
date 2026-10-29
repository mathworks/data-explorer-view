// Copyright 2026 The MathWorks, Inc.
//
// A project's page against the VS Code extension's golden project pages: for every project the
// extension pins, readProjectPage here reads the message its project page is sent.
//
// THE GOLDENS ARE THE EXTENSION'S. Each __snapshots__/<project marker>/project.json is a copy of
// data-explorer-vscode's (its test/goldens/project.test.ts writes them: the `setProject` message
// its BinaryEditorProvider posts, with the root spelled `<root>`, since the page only resolves
// links against it), and the projects are at the same paths here; `node scripts/copy-goldens.mjs
// <vscode checkout>` refreshes both. The store is read off disk through core's nodeStoreFs, which
// is what an app in Electron or Node hands readProjectPage. Nothing is normalised.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTomlProjectFile } from 'data-explorer-core';
import { nodeStoreFs } from 'data-explorer-core/node';
import { readProjectPage } from '../../src/model/index.js';
import { snapshotText } from './snapshotText.js';

const REPO = resolve(import.meta.dirname, '../..');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');

/** Every project with a page pinned, by its marker's repo path (the key with '__' as '/'). */
const PROJECTS = readdirSync(SNAPSHOTS)
  .filter((key) => readdirSync(join(SNAPSHOTS, key)).includes('project.json'))
  .map((key) => key.split('__').join('/'))
  .sort();

describe("a project's page is sent what the extension sends", () => {
  it('has both project formats the extension pins', () => {
    expect(PROJECTS.length).toBe(3);
    expect(PROJECTS.some((rel) => rel.endsWith('.prj'))).toBe(true);
    expect(PROJECTS.some((rel) => isTomlProjectFile(rel))).toBe(true);
  });

  for (const rel of PROJECTS) {
    it(rel, async () => {
      const message = await readProjectPage(join(REPO, rel), nodeStoreFs, '<root>');
      expect(snapshotText(message)).toBe(readFileSync(join(SNAPSHOTS, rel.split('/').join('__'), 'project.json'), 'utf8'));
    });
  }
});
