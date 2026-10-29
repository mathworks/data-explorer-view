// Copyright 2026 The MathWorks, Inc.
//
// Copy the VS Code extension's golden table payloads, and the fixtures they were written from,
// into test/goldens/ here: the spec test/goldens/inPage.test.ts holds this package's in-page
// sources to.
//
//   node scripts/copy-goldens.mjs <data-explorer-vscode checkout>
//
// Copies, per fixture, the five kinds an in-page table answers (the first paint at the real and at
// a small row budget, the children of every deferred row, the inspector's page of every row, the
// cells of every matrix), and the fixture itself to the path it has there, when it is missing or
// differs. Kinds this package's sources do not answer yet (usage, hierarchy, project) are left.
// Reports what changed; the diff is the review.
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

for (const key of readdirSync(from).sort()) {
  if (!existsSync(join(from, key, 'table.json'))) continue;
  for (const kind of KINDS) copy(join(from, key, `${kind}.json`), join(to, key, `${kind}.json`));
  // The key is the fixture's repo path with '/' as '__' (vscode's test/goldens/fixtures.ts).
  const rel = key.split('__').join('/');
  copy(join(resolve(vscode), rel), join(here, rel));
}
console.log(changed ? `${changed} files copied` : 'up to date');
