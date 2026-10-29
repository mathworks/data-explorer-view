// Copyright 2026 The MathWorks, Inc.
//
// Copy the VS Code extension's golden payloads, and the fixtures they were written from, into
// test/goldens/ here: the spec test/goldens/inPage.test.ts holds this package's in-page sources
// to, and test/goldens/hierarchy.test.ts its folder hierarchy.
//
//   node scripts/copy-goldens.mjs <data-explorer-vscode checkout>
//
// Copies, per fixture, the five kinds an in-page table answers (the first paint at the real and at
// a small row budget, the children of every deferred row, the inspector's page of every row, the
// cells of every matrix), and the fixture itself to the path it has there; and per fixture folder,
// its relationship tree (hierarchy.json) and every file the tree opens (a project's marker among
// them). Each when it is missing or differs. Kinds this package does not answer yet (usage,
// project) are left. Reports what changed; the diff is the review.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const KINDS = ['table', 'table-lazy', 'children-lazy', 'inspector', 'matrix'];

const vscode = process.argv[2];
if (!vscode) {
  console.error('usage: node scripts/copy-goldens.mjs <data-explorer-vscode checkout>');
  process.exit(2);
}
const here = resolve(import.meta.dirname, '..');
const from = join(resolve(vscode), 'test/goldens/__snapshots__');
const to = join(here, 'test/goldens/__snapshots__');

const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));
let changed = 0;
function copy(src, dst) {
  if (same(src, dst)) return;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`copied ${dst.slice(here.length + 1)}`);
  changed++;
}

// Every file a tree row opens, as its repo path: the ids are `file:///fx/<repo path>`.
function opened(rows, out = new Set()) {
  for (const row of rows) {
    if (row.id) out.add(row.id.replace(/^file:\/\/\/fx\//, ''));
    if (row.children) opened(row.children, out);
  }
  return out;
}

for (const key of readdirSync(from).sort()) {
  // The key is the fixture's repo path with '/' as '__' (vscode's test/goldens/fixtures.ts).
  const rel = key.split('__').join('/');
  if (existsSync(join(from, key, 'table.json'))) {
    for (const kind of KINDS) copy(join(from, key, `${kind}.json`), join(to, key, `${kind}.json`));
    copy(join(resolve(vscode), rel), join(here, rel));
  }
  const tree = join(from, key, 'hierarchy.json');
  if (existsSync(tree)) {
    copy(tree, join(to, key, 'hierarchy.json'));
    for (const file of opened(JSON.parse(readFileSync(tree, 'utf8')))) copy(join(resolve(vscode), file), join(here, file));
  }
}
console.log(changed ? `${changed} files copied` : 'up to date');
