// Copyright 2026 The MathWorks, Inc.
// The dev server pre-bundles every module the package imports. The package itself is left out of
// pre-bundling, so Vite does not look inside it; a module it imports and the config does not name
// is found only as a page asks for it, and the dev server then optimizes again and reloads that
// page, which a test sees as requests answered "504 Outdated Optimize Dep".
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import config from '../vite.config';

function bareImports(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) bareImports(path, found);
    else if (entry.name.endsWith('.js')) {
      for (const m of readFileSync(path, 'utf8').matchAll(/\bfrom\s+'([^'.][^']*)'/g)) found.add(m[1]);
    }
  }
  return found;
}

const REPO = join(import.meta.dirname, '..', '..');

test('the dev server pre-bundles every module the package imports', () => {
  const imported = [...bareImports(join(REPO, 'dist'))].sort();
  expect(imported.length).toBeGreaterThan(0);
  expect([...(config.optimizeDeps?.include ?? [])].sort()).toEqual(imported);

  // And the README gives an app the same list.
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const listed = /^\s*include: \[(.*)\],$/m.exec(readme)?.[1];
  expect(listed, "the README's optimizeDeps.include").toBeDefined();
  expect([...listed!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(imported);
});
