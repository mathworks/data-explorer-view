// Copyright 2026 The MathWorks, Inc.
//
// THE WIDGET DOCS (docs/widgets/<widget>.md): one page per widget, whose API half is written from
// custom-elements.json by scripts/gen-widget-docs.mjs, and which the README's table of entries
// links. A page that is not what the manifest says, a widget with no page, or a link to a page
// that is not there fails here.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs', 'widgets');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'));
const TAGS: string[] = MANIFEST.modules.flatMap((m: any) => (m.declarations ?? []).filter((d: any) => d.customElement).map((d: any) => d.tagName));
const page = (tag: string) => `${tag.replace(/^dex-/, '')}.md`;

describe('docs/widgets', () => {
  it('has a page for every widget, and none for a widget there is not', () => {
    expect(TAGS.length).toBe(11);
    expect(readdirSync(DOCS).sort()).toEqual(TAGS.map(page).sort());
  });

  it('is what custom-elements.json says (npm run build writes it)', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen-widget-docs.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each(TAGS)('%s: says what it is for above the generated half, and links only pages that exist', (tag) => {
    const text = readFileSync(join(DOCS, page(tag)), 'utf8');
    const [intent] = text.split('<!-- Everything below is written by');
    expect(intent!.startsWith(`# \`<${tag}>\`\n\n`)).toBe(true);
    expect(intent!.length, 'a sentence or two, and an example').toBeGreaterThan(300);
    expect(intent).toContain('```');
    for (const [, target] of text.matchAll(/\]\(([\w-]+\.md)\)/g)) expect(existsSync(join(DOCS, target!)), target).toBe(true);
  });

  it("is linked from the README's table of entries, a page for each entry's widget", () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    for (const tag of ['dex-tree-table', 'dex-property-inspector', 'dex-variable-editor', 'dex-context-menu', 'dex-error-dialog', 'dex-icon']) {
      expect(readme, tag).toContain(`](docs/widgets/${page(tag)})`);
    }
    for (const [, target] of readme.matchAll(/\]\((docs\/widgets\/[\w-]+\.md)\)/g)) expect(existsSync(join(ROOT, target!)), target).toBe(true);
  });
});
