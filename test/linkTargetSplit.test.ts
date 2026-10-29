// Copyright 2026 The MathWorks, Inc.
//
// The split rule of a link target (ids/linkTarget.ts sourceAt) against every target the VS Code
// extension's golden payloads hold: rows (Data Type, Used By and parameter links), inspector pages
// and Usage cells. For each, the rule reads what both earlier rules read: the extension's own
// (navTarget.ts: the kind prefix off, then the LAST `@`) and the table's 0.x one (the FIRST `@`).
// The extension's uris spell an `@` as `%40`, so on what it writes the three cannot disagree; a
// target where they would is a case the table in navTarget.test.ts pins instead.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLinkTarget } from '../src/model/ids/linkTarget.js';
import { parseNavTarget } from '../src/model/usage/navTarget.js';

const SNAPSHOTS = join(import.meta.dirname, 'goldens', '__snapshots__');

/** Every `linkTarget` string in a JSON value, at any depth. */
function targetsIn(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) for (const v of value) targetsIn(v, out);
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'linkTarget' && typeof v === 'string' && v !== '') out.add(v);
      else targetsIn(v, out);
    }
  }
}

const TARGETS = new Set<string>();
for (const key of readdirSync(SNAPSHOTS)) {
  for (const file of readdirSync(join(SNAPSHOTS, key)).filter((f) => f.endsWith('.json'))) {
    targetsIn(JSON.parse(readFileSync(join(SNAPSHOTS, key, file), 'utf8')), TARGETS);
  }
}

/** The extension's navTarget.ts parseNavTarget, as it is: prefix off, then the last `@`. */
function lastAt(target: string): { name: string; source: string } | null {
  let rest = target;
  if (target.startsWith('blocks:')) rest = target.slice('blocks:'.length);
  else if (target.startsWith('workspace:')) rest = target.slice('workspace:'.length);
  const at = rest.lastIndexOf('@');
  if (at < 0) return null;
  const name = rest.slice(0, at);
  const source = rest.slice(at + 1);
  return name && source ? { name, source } : null;
}

/** The table's 0.x parseLinkTarget split: the first `@`. */
function firstAt(target: string): { name: string; source: string } | null {
  const at = target.indexOf('@');
  if (at < 0) return null;
  const head = target.slice(0, at);
  const name = head.startsWith('blocks:') ? head.slice('blocks:'.length) : head.startsWith('workspace:') ? head.slice('workspace:'.length) : head;
  const source = target.slice(at + 1);
  return name && source ? { name, source } : null;
}

describe("the split rule on every target the extension's goldens hold", () => {
  it('finds the targets: entries, blocks and workspace parameters, by uri and by file name', () => {
    expect(TARGETS.size).toBeGreaterThan(50);
    const all = [...TARGETS];
    expect(all.some((t) => t.startsWith('blocks:'))).toBe(true);
    expect(all.some((t) => t.startsWith('workspace:'))).toBe(true);
    expect(all.some((t) => /@file:\/\//.test(t))).toBe(true);
    expect(all.some((t) => /@[^@:]+\.(sldd|mat|slx)$/.test(t))).toBe(true);
  });

  it('reads each as the extension and the 0.x table both read it', () => {
    const disagree = [...TARGETS].filter((t) => {
      const now = parseNavTarget(t);
      return JSON.stringify(now) !== JSON.stringify(lastAt(t)) || JSON.stringify(now) !== JSON.stringify(firstAt(t));
    });
    expect(disagree).toEqual([]);
  });

  it('and the table reads each the same way as the link grammar does', () => {
    for (const t of TARGETS) {
      const link = parseLinkTarget(t);
      const nav = parseNavTarget(t);
      if (link.kind === 'file') expect(nav, t).toBeNull();
      else expect({ name: link.kind === 'block' ? link.block : link.name, source: link.source }, t).toEqual(nav);
    }
  });
});
