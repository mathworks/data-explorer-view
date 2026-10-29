// Copyright 2026 The MathWorks, Inc.
//
// The public API against the last release: custom-elements.json here against the one in the
// latest `v*` tag this commit descends from (`git show <tag>:custom-elements.json`).
//
// The API is each widget's tag, and its public properties, methods, attributes and events, as
// the manifest lists them. One that is gone, or renamed (which is gone plus a new one), breaks
// an app written against the tag, so it fails here unless package.json's version says so: a
// major bump, or while the version is 0.x a minor one (0.2.0 → 0.3.0, not 0.2.1). An addition,
// or a changed type, is reported and passes. A tag with no manifest (v0.1.0 predates it) leaves
// nothing to compare with, and passes with a notice.
//
//   node scripts/check-api.mjs                     against the latest v* tag behind HEAD
//   node scripts/check-api.mjs --base <ref>        against another commit or tag
//   node scripts/check-api.mjs --base-manifest <file> --base-version <x.y.z>
//        [--head-manifest <file>] [--head-version <x.y.z>]   files, no git (what the tests use)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Every public item of a manifest, by a name that says what it is, with its type where it has one. */
export function apiOf(manifest) {
  const items = new Map();
  for (const mod of manifest?.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.customElement || !decl.tagName) continue;
      const tag = `<${decl.tagName}>`;
      items.set(tag, decl.name);
      for (const m of decl.members ?? []) {
        if (m.static || (m.privacy && m.privacy !== 'public')) continue;
        if (m.kind === 'field') items.set(`${tag} property ${m.name}`, m.type?.text ?? '');
        else if (m.kind === 'method') items.set(`${tag} method ${m.name}()`, signature(m));
      }
      for (const a of decl.attributes ?? []) items.set(`${tag} attribute ${a.name}`, a.fieldName ?? '');
      for (const e of decl.events ?? []) items.set(`${tag} event ${e.name}`, e.type?.text ?? '');
    }
  }
  return items;
}

function signature(method) {
  const params = (method.parameters ?? []).map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type?.text ?? ''}`);
  return `(${params.join(', ')}) => ${method.return?.type?.text ?? 'void'}`;
}

/** What is gone from `base`, new in `head`, and in both with another type. */
export function diffApi(base, head) {
  const a = apiOf(base);
  const b = apiOf(head);
  return {
    removed: [...a.keys()].filter((k) => !b.has(k)).sort(),
    added: [...b.keys()].filter((k) => !a.has(k)).sort(),
    changed: [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k)).sort().map((k) => `${k}: ${a.get(k)} → ${b.get(k)}`),
  };
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

/** The whole rule. `base` is null when the release has no manifest. */
export function checkApi({ base, baseVersion, baseName = `v${baseVersion}`, head, headVersion }) {
  const notices = [];
  if (!base) {
    notices.push(`${baseName} has no custom-elements.json, so there is no API to compare with yet`);
    return { ok: true, errors: [], notices };
  }
  const { removed, added, changed } = diffApi(base, head);
  const errors = [];
  if (removed.length && !breakingAllowed(baseVersion, headVersion)) {
    const next = parseVersion(baseVersion);
    const bump = next.major === 0 ? `0.${next.minor + 1}.0` : `${next.major + 1}.0.0`;
    errors.push(
      `Removed or renamed since ${baseName} (${baseVersion}), which breaks an app written against it. ` +
        `Keep them, or say so with package.json's version (at least ${bump}; it is ${headVersion}):\n  ${removed.join('\n  ')}`,
    );
  } else if (removed.length) {
    notices.push(`Removed or renamed since ${baseName}, as ${headVersion} allows:\n  ${removed.join('\n  ')}`);
  }
  if (added.length) notices.push(`New since ${baseName}:\n  ${added.join('\n  ')}`);
  if (changed.length) notices.push(`Type changed since ${baseName}:\n  ${changed.join('\n  ')}`);
  if (!errors.length && !removed.length && !added.length && !changed.length) notices.push(`The API is the one in ${baseName}`);
  return { ok: errors.length === 0, errors, notices };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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

export function main(args, cwd = process.cwd()) {
  const readJson = (file) => JSON.parse(readFileSync(join(cwd, file), 'utf8'));
  const head = readJson(option(args, '--head-manifest') ?? 'custom-elements.json');
  const headVersion = option(args, '--head-version') ?? readJson('package.json').version;

  if (option(args, '--base-manifest') !== undefined) {
    const baseManifest = option(args, '--base-manifest');
    const base = baseManifest === 'none' ? null : readJson(baseManifest);
    return report(checkApi({ base, baseVersion: option(args, '--base-version'), head, headVersion }));
  }

  let ref = option(args, '--base');
  if (ref === undefined) {
    try {
      ref = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'], cwd);
    } catch {
      // A shallow clone has no tags to find, which is not the same as there being none.
      if (git(['rev-parse', '--is-shallow-repository'], cwd) === 'true') {
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
  let base = null;
  try {
    base = JSON.parse(git(['show', `${ref}:custom-elements.json`], cwd));
  } catch {
    base = null;
  }
  return report(checkApi({ base, baseVersion, baseName: ref, head, headVersion }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
