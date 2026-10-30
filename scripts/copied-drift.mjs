// Copyright 2026 The MathWorks, Inc.
//
// Which of the VS Code extension's files view holds a copy of have changed there since the copy was
// taken: a report for CI's downstream-vscode job, which has the extension's checkout with its
// history. It never fails the job. A change there is not wrong here; it is a copy to bring up to
// date (or a reason to say why not) before the two drift apart unseen.
//
// A copy says what it copies in its header, one line per file:
//   // Copied from data-explorer-vscode src/host/transfer.ts at c73da3c.
// and a ported test the same way, with `Ported from`, and code lifted out of a larger file with
// `Lifted from`.
//
//   node scripts/copied-drift.mjs <the extension's checkout>
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const STAMP = /(?:Copied|Ported|Lifted) from data-explorer-vscode (\S+) at ([0-9a-f]{7,40})\b/g;

function files(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...files(path));
    else if (entry.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Every copy's stamp: which file of ours copies which of theirs, as of which commit. */
export function stamps(root = ROOT) {
  const out = [];
  for (const file of [...files(join(root, 'src')), ...files(join(root, 'test'))]) {
    for (const [, path, commit] of readFileSync(file, 'utf8').matchAll(STAMP)) {
      out.push({ copy: relative(root, file), path, commit });
    }
  }
  return out;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** What each stamp's file has had since its commit, in `vscode`; null where the commit is not there to ask. */
export function drift(vscode, list = stamps()) {
  return list.map((s) => {
    try {
      git(['cat-file', '-e', `${s.commit}^{commit}`], vscode);
    } catch {
      return { ...s, commits: null };
    }
    const log = git(['log', '--oneline', `${s.commit}..HEAD`, '--', s.path], vscode);
    return { ...s, commits: log ? log.split('\n') : [] };
  });
}

function main(args) {
  const vscode = args[0];
  if (!vscode) {
    console.log('usage: node scripts/copied-drift.mjs <the extension\'s checkout>');
    return;
  }
  const annotate = process.env.GITHUB_ACTIONS === 'true';
  const say = (level, title, text) =>
    console.log(annotate ? `::${level} title=${title}::${text.replace(/\n/g, '%0A')}` : `${title}: ${text}`);
  const results = drift(vscode);
  const moved = results.filter((r) => r.commits && r.commits.length);
  const unknown = results.filter((r) => r.commits === null);
  for (const r of moved) {
    say('warning', 'Copy behind the extension', `${r.copy} copies ${r.path} as of ${r.commit}, which has changed since:\n${r.commits.join('\n')}`);
  }
  for (const r of unknown) say('notice', 'Copy not checked', `${r.copy}: ${r.commit} is not in the extension's checkout, so ${r.path} cannot be compared`);
  say('notice', 'Copies of the extension', `${results.length} stamp(s); ${moved.length} behind, ${unknown.length} not checked`);
}

try {
  if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
} catch (err) {
  // A report: whatever goes wrong here is said, and passes.
  console.log(`The copies could not be checked: ${err?.message ?? err}`);
}
