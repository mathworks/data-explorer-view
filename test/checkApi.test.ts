// Copyright 2026 The MathWorks, Inc.
//
// THE API CHECK (scripts/check-api.mjs): custom-elements.json against the one in the last release
// tag. A widget, property, method, attribute or event that is gone — or renamed, which is gone
// plus a new one — fails unless package.json's version says the API may break: a major bump, or a
// minor one while the version is 0.x. Additions pass, and so does a tag with no manifest.
//
// The rule is tested on a small manifest (test/fixtures/api/release.json) and edits of it; the
// script itself is run on files, and on a throwaway repository whose tags it has to find.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiOf, breakingAllowed, checkApi, diffApi } from '../scripts/check-api.mjs';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'check-api.mjs');
const RELEASE = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'api', 'release.json'), 'utf8'));

/** The release manifest with `edit` applied to its tree table. */
function edited(edit: (table: any) => void): any {
  const copy = structuredClone(RELEASE);
  edit(copy.modules[0].declarations[0]);
  return copy;
}
const without = (list: any[], name: string) => list.filter((x) => x.name !== name);

describe('what counts as the API', () => {
  it('is each widget, and its public properties, methods, attributes and events', () => {
    expect([...apiOf(RELEASE).keys()].sort()).toEqual([
      '<dex-icon>',
      '<dex-icon> attribute iconid',
      '<dex-icon> property iconId',
      '<dex-tree-table>',
      '<dex-tree-table> attribute rows',
      '<dex-tree-table> attribute storage-key',
      '<dex-tree-table> event dex-row-drag-end',
      '<dex-tree-table> event dex-row-selected',
      '<dex-tree-table> method expand()',
      '<dex-tree-table> property dropPredictor',
      '<dex-tree-table> property rows',
      '<dex-tree-table> property storageKey',
    ]);
  });

  it('covers every widget of this package', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'));
    const items = [...apiOf(manifest).keys()];
    expect(items.filter((k) => !k.includes(' ')).length).toBe(12);
    expect(items.filter((k) => k.includes(' event ')).length).toBe(24);
    expect(items).toContain('<dex-tree-table> attribute readonly');
    expect(items).toContain('<dex-tree-table> method expand()');
  });
});

describe('the diff', () => {
  it('is empty against itself', () => {
    expect(diffApi(RELEASE, RELEASE)).toEqual({ removed: [], added: [], changed: [] });
  });

  it('reads a rename as a removal and an addition', () => {
    const renamed = edited((t) => {
      t.attributes = t.attributes.map((a: any) => (a.name === 'storage-key' ? { ...a, name: 'storagekey' } : a));
    });
    expect(diffApi(RELEASE, renamed)).toEqual({
      removed: ['<dex-tree-table> attribute storage-key'],
      added: ['<dex-tree-table> attribute storagekey'],
      changed: [],
    });
  });

  it('reports a changed type apart from a removal', () => {
    const retyped = edited((t) => {
      t.events[0].type.text = 'CustomEvent<OtherDetail>';
    });
    expect(diffApi(RELEASE, retyped)).toEqual({
      removed: [],
      added: [],
      changed: ['<dex-tree-table> event dex-row-selected: CustomEvent<RowSelectedDetail> → CustomEvent<OtherDetail>'],
    });
  });

  it('ignores private members', () => {
    const less = edited((t) => {
      t.members = without(t.members, '_private');
    });
    expect(diffApi(RELEASE, less).removed).toEqual([]);
  });
});

describe('which versions may break the API', () => {
  it.each([
    ['0.2.0', '0.2.0', false],
    ['0.2.0', '0.2.1', false],
    ['0.2.0', '0.3.0', true],
    ['0.2.0', '1.0.0', true],
    ['1.2.0', '1.2.5', false],
    ['1.2.0', '1.3.0', false],
    ['1.2.0', '2.0.0', true],
    ['1.2.0', '0.9.0', false],
  ])('%s → %s: %s', (base, head, allowed) => {
    expect(breakingAllowed(base, head)).toBe(allowed);
  });
});

describe('the rule', () => {
  const removals: [string, (t: any) => void][] = [
    ['a property', (t) => (t.members = without(t.members, 'dropPredictor'))],
    ['a method', (t) => (t.members = without(t.members, 'expand'))],
    ['an attribute', (t) => (t.attributes = without(t.attributes, 'rows'))],
    ['an event', (t) => (t.events = without(t.events, 'dex-row-drag-end'))],
    ['a widget', (t) => (t.tagName = 'dex-table')],
  ];

  it.each(removals)('fails on a removed %s at a patch release', (_what, edit) => {
    const result = checkApi({ base: RELEASE, baseVersion: '0.2.0', head: edited(edit), headVersion: '0.2.1' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/at least 0\.3\.0; it is 0\.2\.1/);
  });

  it.each(removals)('lets a removed %s through a 0.x minor bump, and says so', (_what, edit) => {
    const result = checkApi({ base: RELEASE, baseVersion: '0.2.0', head: edited(edit), headVersion: '0.3.0' });
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(result.notices.join('\n')).toMatch(/Removed or renamed since v0\.2\.0, as 0\.3\.0 allows/);
  });

  it('after 1.0, wants a major bump', () => {
    const head = edited(removals[0]![1]);
    expect(checkApi({ base: RELEASE, baseVersion: '1.2.0', head, headVersion: '1.3.0' }).ok).toBe(false);
    expect(checkApi({ base: RELEASE, baseVersion: '1.2.0', head, headVersion: '2.0.0' }).ok).toBe(true);
  });

  it('passes an addition at a patch release', () => {
    const head = edited((t) => t.members.push({ kind: 'field', name: 'readonly', type: { text: 'boolean' } }));
    const result = checkApi({ base: RELEASE, baseVersion: '0.2.0', head, headVersion: '0.2.1' });
    expect(result.ok).toBe(true);
    expect(result.notices.join('\n')).toMatch(/New since v0\.2\.0:\n {2}<dex-tree-table> property readonly/);
  });

  it('passes a release with no manifest, with a notice', () => {
    expect(checkApi({ base: null, baseVersion: '0.1.0', head: RELEASE, headVersion: '0.1.1' })).toEqual({
      ok: true,
      errors: [],
      notices: ['v0.1.0 has no custom-elements.json, so there is no API to compare with yet'],
    });
  });
});

describe('the script', () => {
  let dir: string;
  const run = (args: string[], cwd = dir) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } });
  const write = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value));

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'check-api-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('compares two files, and exits 1 on a break', () => {
    write('base.json', RELEASE);
    write('head.json', edited((t) => (t.events = without(t.events, 'dex-row-selected'))));
    const broke = run(['--base-manifest', 'base.json', '--base-version', '0.2.0', '--head-manifest', 'head.json', '--head-version', '0.2.1']);
    expect(broke.status).toBe(1);
    expect(broke.stderr).toContain('<dex-tree-table> event dex-row-selected');
    const bumped = run(['--base-manifest', 'base.json', '--base-version', '0.2.0', '--head-manifest', 'head.json', '--head-version', '0.3.0']);
    expect(bumped.status).toBe(0);
  });

  // A repository built with git's plumbing (no working-tree commit, so no hook and no identity
  // of the machine's): v0.1.0 with no manifest, v0.2.0 with one, and HEAD after both.
  describe('in a repository', () => {
    const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' };
    const git = (args: string[], input?: string) => execFileSync('git', args, { cwd: dir, env, input, encoding: 'utf8' }).trim();
    function commit(files: Record<string, unknown>, parent?: string): string {
      const entries = Object.entries(files).map(([name, value]) => `100644 blob ${git(['hash-object', '-w', '--stdin'], JSON.stringify(value))}\t${name}`);
      const tree = git(['mktree'], `${entries.join('\n')}\n`);
      return git(['commit-tree', tree, '-m', 'release', ...(parent ? ['-p', parent] : [])]);
    }

    beforeAll(() => {
      git(['init', '-q']);
      const v010 = commit({ 'package.json': { version: '0.1.0' } });
      git(['tag', 'v0.1.0', v010]);
      const v020 = commit({ 'package.json': { version: '0.2.0' }, 'custom-elements.json': RELEASE }, v010);
      git(['tag', 'v0.2.0', v020]);
      git(['update-ref', 'HEAD', commit({ 'package.json': { version: '0.2.0' } }, v020)]);
    });

    it('finds the latest tag behind HEAD and checks against it', () => {
      write('package.json', { version: '0.2.1' });
      write('custom-elements.json', RELEASE);
      const same = run([]);
      expect(same.status).toBe(0);
      expect(same.stdout).toContain('The API is the one in v0.2.0');

      write('custom-elements.json', edited((t) => (t.members = without(t.members, 'rows'))));
      const broke = run([]);
      expect(broke.status).toBe(1);
      expect(broke.stderr).toContain('Removed or renamed since v0.2.0 (0.2.0)');
      expect(broke.stderr).toContain('<dex-tree-table> property rows');

      write('package.json', { version: '0.3.0' });
      expect(run([]).status).toBe(0);
    });

    it('passes against a tag that has no manifest, with a notice', () => {
      write('package.json', { version: '0.1.1' });
      const result = run(['--base', 'v0.1.0']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('v0.1.0 has no custom-elements.json');
    });

    it('fails on a base that is not there', () => {
      expect(run(['--base', 'v9.9.9']).status).toBe(1);
    });
  });
});
