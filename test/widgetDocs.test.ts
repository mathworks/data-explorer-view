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
import ts from 'typescript';
import { sourceFiles } from './tools/moduleGraph.js';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs', 'widgets');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'));
const TAGS: string[] = MANIFEST.modules.flatMap((m: any) => (m.declarations ?? []).filter((d: any) => d.customElement).map((d: any) => d.tagName));
const page = (tag: string) => `${tag.replace(/^dex-/, '')}.md`;

describe('docs/widgets', () => {
  it('has a page for every widget, and none for a widget there is not', () => {
    expect(TAGS.length).toBe(13);
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

  it('ships in the package, beside the manifest it is written from', () => {
    const files: string[] = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).files;
    expect(files).toContain('docs');
    expect(files).toContain('custom-elements.json');
  });

  // The JSDoc these pages are written from began as comments in VS Code's extension, and an app
  // has none of its modules, messages or commands: the pages say what a widget does instead.
  it("speaks of what the widgets do, not of VS Code's code", () => {
    const vscode = /table-main|pi-main|setRows|requestMatrix|matrixOpen|Command Palette|dataExplorer\.|keybinding|openAddGallery|webview|host-side|\b_[a-z]\w*\(|_cellEditTarget/;
    for (const tag of TAGS) {
      const lines = readFileSync(join(DOCS, page(tag)), 'utf8').split('\n');
      expect(lines.filter((l) => vscode.test(l)), page(tag)).toEqual([]);
    }
  });

  it("is linked from the README's table of entries, a page for each entry's widget", () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    for (const tag of ['dex-tree-table', 'dex-property-inspector', 'dex-variable-editor', 'dex-context-menu', 'dex-error-dialog', 'dex-hierarchy', 'dex-project-page', 'dex-icon']) {
      expect(readme, tag).toContain(`](docs/widgets/${page(tag)})`);
    }
    for (const [, target] of readme.matchAll(/\]\((docs\/widgets\/[\w-]+\.md)\)/g)) expect(existsSync(join(ROOT, target!)), target).toBe(true);
  });

  // A type printed on a page is what an app reads to learn what a detail holds, so its doc comment
  // goes with it: a declaration's own text leaves the comment out, and LinkClickedDetail's four
  // target forms were then readable only in an editor's hover.
  it('prints each type with the doc comment written above it', () => {
    const documented = new Set<string>();
    for (const dir of ['widgets', 'model']) {
      for (const rel of sourceFiles(join(ROOT, 'src', dir))) {
        const source = ts.createSourceFile(rel, readFileSync(join(ROOT, 'src', dir, rel), 'utf8'), ts.ScriptTarget.ES2022, true);
        for (const st of source.statements) {
          if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && ts.getJSDocCommentsAndTags(st).some((d) => d.kind === ts.SyntaxKind.JSDoc)) {
            documented.add(st.name.text);
          }
        }
      }
    }
    let printed = 0;
    for (const tag of TAGS) {
      const lines = readFileSync(join(DOCS, page(tag)), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const name = /^export (?:interface|type) (\w+)/.exec(line)?.[1];
        if (!name || !documented.has(name)) return;
        printed++;
        expect(lines[i - 1]?.endsWith('*/'), `${page(tag)}: ${name} is printed without its doc comment`).toBe(true);
      });
    }
    expect(printed, 'documented types printed on the pages').toBeGreaterThan(20);
    const table = readFileSync(join(DOCS, 'tree-table.md'), 'utf8');
    for (const form of ['`<name>@<source>`', '`blocks:<block>@<source>`', '`workspace:<name>@<source>`', '`<file>`, with no `@`']) {
      expect(table, form).toContain(form);
    }
  });
});

