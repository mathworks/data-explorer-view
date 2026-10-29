// Copyright 2026 The MathWorks, Inc.
//
// The package's entry points, as a consumer reaches them: by name, through package.json
// `exports`, into the committed dist/.
//
// Every entry resolves to a file that exists, for Node and for TypeScript, so an app gets
// JavaScript and its types from the same line. A typo in `exports`, or an entry whose index.ts
// nobody built, is otherwise found by the first app that imports it.
//
// The model entry is the DOM-free half. What it loads, followed through dist/, is the model
// and core and nothing else: no widget and no lit, so a worker or a terminal UI can load it.
// It is loaded below in a plain Node, with no DOM at all.
//
// And nothing in the package runs on import. package.json says so (`sideEffects` names only
// the stylesheets), which lets a bundler drop every module an app does not use, and drop it
// silently: a module that did register or patch something at the top level would lose that
// effect in the app's bundle and keep it in every test here. So each module's top level is
// read for statements that do something, and the entries are imported in a fresh Node to check
// that they leave no element defined, and the model no global, behind.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { blankCommentsAndKeepLines, sourceFiles } from './tools/moduleGraph.js';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME: string = PKG.name;
const EXPORTS: Record<string, string | { types: string; default: string }> = PKG.exports;

const ENTRIES = Object.keys(EXPORTS).filter((key) => !key.includes('*'));
const PATTERNS = Object.keys(EXPORTS).filter((key) => key.includes('*'));
const JS_ENTRIES = ENTRIES.filter((key) => typeof EXPORTS[key] === 'object');
const specifier = (key: string): string => `${NAME}${key.slice(1)}`;
const file = (target: string): string => join(ROOT, target);

const TAGS = ['dex-tree-table', 'dex-filter-bar', 'dex-column-filter', 'dex-add-gallery', 'dex-property-inspector',
  'dex-variable-editor', 'dex-matrix-grid', 'dex-context-menu', 'dex-error-dialog', 'dex-matrix-open', 'dex-icon'];
const OLD_PATHS = ['icons/wsTable.svg', 'model/rows/rowBuilder.js', 'widgets/tree-table/dex-tree-table.js', 'theme/global.css'];

interface Loaded {
  /** What Node resolves each specifier to. */
  resolved: Record<string, string>;
  /** Globals the model entry added, imported first, before anything loads lit. */
  modelGlobals: string[];
  /** Each JS entry's exports, as [name, typeof value]. */
  exports: Record<string, [string, string][]>;
  /** The dex-* elements each entry's import defined. */
  defined: Record<string, string[]>;
}

// One fresh Node, run from the package root: there, `import 'data-explorer-view/…'` is the
// package naming itself, which Node resolves through `exports` as it would for an app. One
// process for all of it, since the first import of core in a cold process takes seconds.
let loaded: Loaded;
beforeAll(() => {
  const script = `
    const specs = ${JSON.stringify([...ENTRIES, ...OLD_PATHS.map((p) => `./${p}`)].map(specifier))};
    const resolved = Object.fromEntries(specs.map((s) => [s, import.meta.resolve(s)]));
    const before = new Set(Object.getOwnPropertyNames(globalThis));
    const out = { resolved, modelGlobals: [], exports: {}, defined: {} };
    for (const s of ${JSON.stringify(JS_ENTRIES.map(specifier))}) {
      const m = await import(s);
      out.exports[s] = Object.entries(m).map(([k, v]) => [k, typeof v]);
      if (s.endsWith('/model')) out.modelGlobals = Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k));
      // Lit's Node build supplies a customElements; the define functions are what register. Only
      // what this import defined, so a failure names the entry that did it.
      const now = globalThis.customElements ? ${JSON.stringify(TAGS)}.filter((t) => customElements.get(t)) : [];
      out.defined[s] = now.filter((t) => !Object.values(out.defined).flat().includes(t));
    }
    console.log(JSON.stringify(out));`;
  loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' }));
}, 120_000);

describe('every entry in package.json exports', () => {
  it('names the designed entries, and the 0.x paths beside them', () => {
    expect(ENTRIES).toEqual([
      './model',
      './tree-table',
      './property-inspector',
      './variable-editor',
      './context-menu',
      './error-dialog',
      './project-page',
      './icon',
      './icon-assets',
      './theme.css',
    ]);
    expect(PATTERNS).toEqual(['./icons/*', './model/*.js', './widgets/*.js', './theme/*.css']);
  });

  it.each(ENTRIES)('%s points at files that exist', (key) => {
    const target = EXPORTS[key]!;
    for (const path of typeof target === 'string' ? [target] : [target.default, target.types]) {
      expect(existsSync(file(path)), path).toBe(true);
    }
  });

  it('each resolves, for Node, to the file it names', () => {
    const { resolved } = loaded;
    for (const key of ENTRIES) {
      const target = EXPORTS[key]!;
      const path = typeof target === 'string' ? target : target.default;
      expect(resolved[specifier(key)], key).toBe(pathToFileURL(resolve(ROOT, path)).href);
    }
  });

  it.each(JS_ENTRIES)('%s has types, which TypeScript finds from the same specifier', (key) => {
    const target = EXPORTS[key] as { types: string };
    // Bundler, as both apps resolve; Node16, as a Node consumer does. Both read `exports`.
    for (const moduleResolution of [ts.ModuleResolutionKind.Bundler, ts.ModuleResolutionKind.Node16]) {
      const options = { moduleResolution, module: moduleResolution === ts.ModuleResolutionKind.Bundler ? ts.ModuleKind.ESNext : ts.ModuleKind.Node16 };
      const found = ts.resolveModuleName(specifier(key), join(ROOT, 'consumer.mts'), options, ts.sys).resolvedModule;
      expect(found?.resolvedFileName, `${key} (${ts.ModuleResolutionKind[moduleResolution]})`).toBe(resolve(ROOT, target.types));
    }
  });

  it.each(JS_ENTRIES)('%s exports something, and nothing undefined', (key) => {
    const target = EXPORTS[key] as { default: string };
    const names = loaded.exports[specifier(key)]!;
    expect(names.length, key).toBeGreaterThan(0);
    expect(names.filter(([, type]: [string, string]) => type === 'undefined'), key).toEqual([]);
    // Every name listed: a star re-export would publish whatever a module exports for its neighbours.
    expect(blankCommentsAndKeepLines(readFileSync(file(target.default), 'utf8'))).not.toMatch(/export \*/);
  });

  it('keeps the 0.x paths working until 1.0', () => {
    for (const path of OLD_PATHS) {
      const url = loaded.resolved[`${NAME}/${path}`]!;
      expect(existsSync(new URL(url)), path).toBe(true);
    }
    // A wildcard entry's types are the .d.ts beside each .js, which tsc writes for every module.
    const js = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? js(join(dir, e)) : e.endsWith('.js') ? [join(dir, e)] : []));
    const modules = [...js(file('dist/model')), ...js(file('dist/widgets'))];
    expect(modules.length).toBeGreaterThan(50);
    expect(modules.filter((m) => !existsSync(m.replace(/\.js$/, '.d.ts')))).toEqual([]);
  });
});

describe('the model entry', () => {
  // Followed through the shipped JavaScript, not src/: dist/ is what an app loads.
  function closure(start: string): { files: string[]; bare: Set<string> } {
    const files: string[] = [];
    const bare = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const at = queue.shift()!;
      if (files.includes(at)) continue;
      files.push(at);
      for (const { fileName: spec } of ts.preProcessFile(readFileSync(at, 'utf8'), true, true).importedFiles) {
        if (spec.startsWith('.')) queue.push(resolve(dirname(at), spec));
        else bare.add(spec);
      }
    }
    return { files: files.map((f) => relative(ROOT, f)), bare };
  }

  it('loads the model and core, and no widget and no lit', () => {
    const { files, bare } = closure(file((EXPORTS['./model'] as { default: string }).default));
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => !f.startsWith('dist/model/'))).toEqual([]);
    expect([...bare]).toEqual(['data-explorer-core']);
  });

  it('loads in a Node with no DOM, and adds no global', () => {
    expect(loaded.exports[specifier('./model')]!.length).toBeGreaterThan(50);
    expect(loaded.modelGlobals).toEqual([]);
  });
});

describe('nothing runs on import', () => {
  it('declares only the stylesheets as having side effects', () => {
    expect(PKG.sideEffects).toEqual(['*.css']);
  });

  // A top-level statement that is not a declaration does something when the module loads. A
  // variable's initializer is allowed (it computes the variable's value), and so are a class's
  // decorators (they shape that class); a bare `import './x.js'`, a call or an assignment is not.
  it('no module in src does anything at its top level beyond declaring', () => {
    const doers: string[] = [];
    for (const rel of sourceFiles(join(ROOT, 'src'))) {
      const source = ts.createSourceFile(rel, readFileSync(join(ROOT, 'src', rel), 'utf8'), ts.ScriptTarget.ES2022, true);
      for (const statement of source.statements) {
        const declares =
          (ts.isImportDeclaration(statement) && statement.importClause !== undefined) ||
          ts.isExportDeclaration(statement) ||
          ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement) ||
          ts.isVariableStatement(statement);
        if (!declares) doers.push(`src/${rel}:${source.getLineAndCharacterOfPosition(statement.getStart()).line + 1}`);
      }
    }
    expect(doers).toEqual([]);
  });

  it.each(JS_ENTRIES.filter((key) => key !== './model'))('%s defines no element when imported', (key) => {
    expect(loaded.defined[specifier(key)]).toEqual([]);
  });
});
