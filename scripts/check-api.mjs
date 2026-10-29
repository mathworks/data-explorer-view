// Copyright 2026 The MathWorks, Inc.
//
// The public API against the last release: this checkout against the latest `v*` tag it descends
// from, whose tree is written out with `git archive` and read the same way (api-surface.mjs).
//
// What is pinned, and what a change to it does:
//
//   the export map's keys, every entry's export names (a value, or a type)    gone: breaks
//   each widget's tag, properties, methods, attributes and events              gone: breaks
//   the attributes each widget class observes                                  gone: breaks
//   each event detail's fields, and each wire message's (both unions' ends)    gone or changed: breaks
//   the theme's tokens, the icon ids, sideEffects                              gone: breaks
//   a peer dependency's floor raised to another major                          breaks
//   anything added; a value's type changed; what tokens a widget reads; files  reported
//
// A break fails here unless package.json's version says so: a major bump, or while the version is
// 0.x a minor one (0.2.0 → 0.3.0, not 0.2.1). From 1.0 only a major does.
//
// `./host` is the VS Code extension's, outside the semver promise (README): a name gone from it, or
// changed, is reported and passes.
//
//   node scripts/check-api.mjs                     against the latest v* tag behind HEAD
//   node scripts/check-api.mjs --base <ref>        against another commit or tag
//   node scripts/check-api.mjs --base-dir <dir> --base-version <x.y.z>   against a package in a directory
//   node scripts/check-api.mjs --base-manifest <file> --base-version <x.y.z>
//        [--head-manifest <file>] [--head-version <x.y.z>]   the widgets' manifests alone, no git
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { elementItems, surfaceOf } from './api-surface.mjs';

/** Every public item of a manifest, by a name that says what it is, with its type where it has one. */
export function apiOf(manifest) {
  return new Map(elementItems(manifest).map((i) => [i.key, i.value]));
}

/** A manifest's items, or a surface's as they are. */
const itemsOf = (api) => (Array.isArray(api) ? api : elementItems(api).map((i) => ({ ...i, part: 'elements' })));

/** What is gone from `base`, new in `head`, and in both with another value. */
export function diffApi(base, head) {
  const { removed, added, changed } = compare(itemsOf(base), itemsOf(head));
  return { removed: removed.map((i) => i.key), added: added.map((i) => i.key), changed: changed.map(describeChange) };
}

function compare(baseItems, headItems) {
  const a = new Map(baseItems.map((i) => [i.key, i]));
  const b = new Map(headItems.map((i) => [i.key, i]));
  const byKey = (x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
  return {
    removed: [...a.values()].filter((i) => !b.has(i.key)).sort(byKey),
    added: [...b.values()].filter((i) => !a.has(i.key)).sort(byKey),
    changed: [...a.values()].filter((i) => b.has(i.key) && b.get(i.key).value !== i.value).map((i) => ({ ...b.get(i.key), was: i.value })).sort(byKey),
  };
}

const describeChange = (i) => `${i.key}: ${i.was} → ${i.value}`;

/** The floor a `^x.y.z`, `~x.y.z` or `>=x.y.z` range starts at, as numbers, or null for another range. */
function floorOf(range) {
  const m = /^\s*(?:\^|~|>=)?\s*v?(\d+)\.(\d+)\.(\d+)/.exec(String(range ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether a change to `item` breaks an app ('fail') or is only said ('report'). */
function ruleFor(item, how) {
  if (item.part === 'names' && item.entry === './host') return 'report';
  if (item.part === 'tokens' && / reads /.test(item.key)) return 'report';
  if (item.part === 'package') {
    if (/^package\.json files /.test(item.key)) return 'report';
    if (/^package\.json peerDependencies /.test(item.key)) {
      if (how !== 'changed') return 'report';
      const was = floorOf(item.was);
      const now = floorOf(item.value);
      return was && now && now[0] > was[0] ? 'fail' : 'report';
    }
    return how === 'removed' ? 'fail' : 'report';
  }
  if (how === 'removed') return 'fail';
  return item.part === 'details' || item.part === 'wire' ? 'fail' : 'report';
}

function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? '').trim());
  if (!m) throw new Error(`not a version: ${text}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Whether going from `baseVersion` to `headVersion` may break the API: a major bump, or a minor one while 0.x. */
export function breakingAllowed(baseVersion, headVersion) {
  const a = parseVersion(baseVersion);
  const b = parseVersion(headVersion);
  if (b.major !== a.major) return b.major > a.major;
  return a.major === 0 && b.minor > a.minor;
}

/**
 * The whole rule. `base` and `head` are surfaces (surfaceOf), or the widgets' manifests alone;
 * `base` is null when the release has no manifest to compare with.
 */
export function checkApi({ base, baseVersion, baseName = `v${baseVersion}`, head, headVersion }) {
  const notices = [];
  if (!base) {
    notices.push(`${baseName} has no custom-elements.json, so there is no API to compare with yet`);
    return { ok: true, errors: [], notices };
  }
  const { removed, added, changed } = compare(itemsOf(base), itemsOf(head));
  const allowed = breakingAllowed(baseVersion, headVersion);
  const breaksRemoved = removed.filter((i) => ruleFor(i, 'removed') === 'fail');
  const breaksChanged = changed.filter((i) => ruleFor(i, 'changed') === 'fail');
  const saidRemoved = removed.filter((i) => ruleFor(i, 'removed') !== 'fail');
  const saidChanged = changed.filter((i) => ruleFor(i, 'changed') !== 'fail');
  const list = (items, describe = (i) => i.key) => `\n  ${items.map(describe).join('\n  ')}`;
  const errors = [];
  if ((breaksRemoved.length || breaksChanged.length) && !allowed) {
    const next = parseVersion(baseVersion);
    const bump = next.major === 0 ? `0.${next.minor + 1}.0` : `${next.major + 1}.0.0`;
    const say = `Keep them, or say so with package.json's version (at least ${bump}; it is ${headVersion}):`;
    if (breaksRemoved.length) errors.push(`Removed or renamed since ${baseName} (${baseVersion}), which breaks an app written against it. ${say}${list(breaksRemoved)}`);
    if (breaksChanged.length) errors.push(`Changed since ${baseName} (${baseVersion}) in a way that breaks an app written against it. ${say}${list(breaksChanged, describeChange)}`);
  } else {
    if (breaksRemoved.length) notices.push(`Removed or renamed since ${baseName}, as ${headVersion} allows:${list(breaksRemoved)}`);
    if (breaksChanged.length) notices.push(`Changed since ${baseName}, as ${headVersion} allows:${list(breaksChanged, describeChange)}`);
  }
  if (saidRemoved.length) notices.push(`Gone since ${baseName}, which breaks nothing pinned (./host, a widget's token reads, files, a peer):${list(saidRemoved)}`);
  if (added.length) notices.push(`New since ${baseName}:${list(added)}`);
  if (saidChanged.length) notices.push(`Type changed since ${baseName}:${list(saidChanged, describeChange)}`);
  if (!errors.length && !removed.length && !added.length && !changed.length) notices.push(`The API is the one in ${baseName}`);
  return { ok: errors.length === 0, errors, notices };
}

function git(args, cwd, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function option(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function report({ ok, errors, notices }) {
  const annotate = process.env.GITHUB_ACTIONS === 'true';
  for (const n of notices) console.log(annotate ? `::notice title=API check::${n.replace(/\n/g, '%0A')}` : n);
  for (const e of errors) console.error(annotate ? `::error title=API check::${e.replace(/\n/g, '%0A')}` : e);
  return ok ? 0 : 1;
}

/**
 * `ref`'s package, written out into a directory of its own, with this checkout's node_modules for
 * what its declarations and widgets import. What `use` answers; the directory is gone after.
 */
function withTree(ref, cwd, use) {
  const wanted = ['package.json', 'custom-elements.json', 'dist', 'icons', 'src/theme'];
  const present = git(['ls-tree', '--name-only', ref, '--', ...wanted], cwd).split('\n').filter(Boolean);
  const dir = mkdtempSync(join(tmpdir(), 'check-api-'));
  try {
    const tar = execFileSync('git', ['archive', '--format=tar', ref, '--', ...present], { cwd, maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    if (existsSync(join(cwd, 'node_modules'))) symlinkSync(resolve(cwd, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function main(args, cwd = process.cwd()) {
  const readJson = (file) => JSON.parse(readFileSync(join(cwd, file), 'utf8'));
  const headVersion = option(args, '--head-version') ?? readJson('package.json').version;

  if (option(args, '--base-manifest') !== undefined) {
    const baseManifest = option(args, '--base-manifest');
    const base = baseManifest === 'none' ? null : readJson(baseManifest);
    const head = readJson(option(args, '--head-manifest') ?? 'custom-elements.json');
    return report(checkApi({ base, baseVersion: option(args, '--base-version'), head, headVersion }));
  }
  if (option(args, '--base-dir') !== undefined) {
    const dir = resolve(cwd, option(args, '--base-dir'));
    const baseVersion = option(args, '--base-version') ?? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    return report(checkApi({ base: surfaceOf(dir), baseVersion, baseName: option(args, '--base-dir'), head: surfaceOf(cwd), headVersion }));
  }

  let ref = option(args, '--base');
  if (ref === undefined) {
    try {
      ref = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'], cwd).trim();
    } catch {
      // A shallow clone has no tags to find, which is not the same as there being none.
      if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'true') {
        return report({ ok: false, notices: [], errors: ['A shallow clone has no tags to compare with: check out with fetch-depth 0'] });
      }
      return report({ ok: true, errors: [], notices: ['No v* tag behind HEAD: nothing to compare with'] });
    }
  }
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  } catch {
    return report({ ok: false, notices: [], errors: [`${ref} is not a commit or tag here`] });
  }
  let baseVersion;
  try {
    baseVersion = JSON.parse(git(['show', `${ref}:package.json`], cwd)).version;
  } catch {
    baseVersion = ref;
  }
  return report(
    withTree(ref, cwd, (dir) => {
      const base = existsSync(join(dir, 'custom-elements.json')) ? surfaceOf(dir) : null;
      return checkApi({ base, baseVersion, baseName: ref, head: surfaceOf(cwd), headVersion });
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
