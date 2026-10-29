// Copyright 2026 The MathWorks, Inc.
//
// The docs as an app that installs the package reads them, in node_modules: every relative link
// in a markdown file npm packs (the README, docs/) names a file npm packs too. A link to what the
// package deliberately leaves out (the gallery, the repository's policies) is a link to the
// repository, by its URL. A doc's own links are read beside it, as a markdown viewer reads them.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** What `npm pack` puts in the tarball, by path. */
function packed(): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  return (JSON.parse(out) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
}

/** Every link target in `text` that is a path, not a URL or an anchor: its file part. */
function relativeLinks(text: string): string[] {
  const out: string[] = [];
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target!) || target!.startsWith('#')) continue;
    out.push(target!.split('#')[0]!);
  }
  return out;
}

describe('the packed docs', () => {
  const files = packed();
  const docs = files.filter((f) => f.endsWith('.md'));

  it('are the README and every doc, the widgets pages and the folder session among them', () => {
    expect(docs).toContain('README.md');
    expect(docs).toContain('docs/folder-session.md');
    expect(docs.filter((f) => f.startsWith('docs/widgets/')).length).toBeGreaterThan(10);
  });

  it('link only to files the package holds', () => {
    const dead: string[] = [];
    for (const doc of docs) {
      for (const link of relativeLinks(readFileSync(join(ROOT, doc), 'utf8'))) {
        const target = normalize(join(dirname(doc), link)).replace(/\\/g, '/');
        if (!files.includes(target)) dead.push(`${doc} → ${link}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
