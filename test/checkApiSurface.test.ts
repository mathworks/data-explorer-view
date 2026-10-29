// Copyright 2026 The MathWorks, Inc.
//
// THE API CHECK, past the widgets' manifest (scripts/api-surface.mjs, scripts/check-api.mjs): the
// export map, every entry's names, the event details, the wire, the theme's tokens, the icons,
// what each widget observes, and package.json's promises. Each is read out of a small built
// package written here, a release and an edit of it, and the rule is run on the two.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { surfaceOf } from '../scripts/api-surface.mjs';
import { checkApi } from '../scripts/check-api.mjs';

type Files = Record<string, string>;

// The release: a model entry, a host entry, one widget with an event, the wire, a theme, an icon.
const RELEASE: Files = {
  'package.json': JSON.stringify({
    name: 'p',
    version: '1.0.0',
    type: 'module',
    exports: {
      './model': { types: './dist/model/index.d.ts', default: './dist/model/index.js' },
      './host': { types: './dist/host/index.d.ts', default: './dist/host/index.js' },
      './x': { types: './dist/widgets/x/index.d.ts', default: './dist/widgets/x/index.js' },
      './theme.css': './src/theme/tokens.css',
    },
    sideEffects: ['*.css'],
    peerDependencies: { core: '^1.48.0' },
    files: ['dist', 'icons'],
  }),
  'dist/model/index.d.ts': 'export declare function rows(name: string): number;\nexport interface Row { id: string }\n',
  'dist/host/index.d.ts': 'export declare function getModel(uri: string): unknown;\n',
  'dist/model/source/wire.d.ts': [
    "export interface SetRowsMessage { type: 'setRows'; rows: string[]; docUri?: string }",
    "export interface ErrorMessage { type: 'error'; message: string }",
    'export type TableHostMessage = SetRowsMessage | ErrorMessage;',
    "export type FolderAsk = 'list' | 'bytes';",
    '',
  ].join('\n'),
  'dist/widgets/x/index.d.ts': 'export declare class DexX {}\nexport interface XDoneDetail { id: string; count?: number }\n',
  'dist/widgets/x/index.js': "export class DexX { static get observedAttributes() { return ['row-id', 'size']; } }\nconst css = 'var(--dex-a)';\nvoid css;\n",
  'custom-elements.json': JSON.stringify({
    modules: [{ declarations: [{ customElement: true, tagName: 'dex-x', name: 'DexX', events: [{ name: 'dex-x-done', type: { text: 'CustomEvent<XDoneDetail>' } }] }] }],
  }),
  'src/theme/tokens.css': ':root { --dex-a: 1px; --dex-b: red; }\n',
  'icons/a.svg': '<svg/>',
  'icons/b.svg': '<svg/>',
};

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The release with `edit` applied to its files, written out and read. */
function surface(edit: (files: Files) => void = () => {}) {
  const files = structuredClone(RELEASE);
  edit(files);
  const dir = mkdtempSync(join(tmpdir(), 'api-surface-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return surfaceOf(dir);
}
const BASE = surface();

const pkgEdit = (change: (pkg: any) => void) => (files: Files) => {
  const pkg = JSON.parse(files['package.json']!);
  change(pkg);
  files['package.json'] = JSON.stringify(pkg);
};
const replace = (file: string, from: string, to: string) => (files: Files) => {
  expect(files[file], file).toContain(from);
  files[file] = files[file]!.replace(from, to);
};
const check = (head: ReturnType<typeof surface>, headVersion = '1.0.1') => checkApi({ base: BASE, baseVersion: '1.0.0', head, headVersion });

describe('what the surface holds', () => {
  it('reads each part out of the built package', () => {
    const keys = BASE.map((i: any) => i.key).sort();
    expect(keys).toEqual([
      './host getModel (value)',
      './model Row (type)',
      './model rows (value)',
      './x DexX (value)',
      './x XDoneDetail (type)',
      './x reads --dex-a',
      '<dex-x>',
      '<dex-x> event dex-x-done',
      '<dex-x> event dex-x-done detail count',
      '<dex-x> event dex-x-done detail id',
      '<dex-x> observes row-id',
      '<dex-x> observes size',
      'export map ./host',
      'export map ./model',
      'export map ./theme.css',
      'export map ./x',
      'icon a',
      'icon b',
      'package.json files dist',
      'package.json files icons',
      'package.json peerDependencies core',
      'package.json sideEffects *.css',
      'theme token --dex-a',
      'theme token --dex-b',
      'wire TableHostMessage error',
      'wire TableHostMessage error field message',
      'wire TableHostMessage setRows',
      'wire TableHostMessage setRows field docUri',
      'wire TableHostMessage setRows field rows',
      'wire type FolderAsk',
    ]);
    expect(BASE.find((i: any) => i.key === './model rows (value)')?.value).toBe('(name: string) => number');
    expect(BASE.find((i: any) => i.key === '<dex-x> event dex-x-done detail count')?.value).toBe('count?: number');
  });

  it('is the same against itself', () => {
    expect(check(surface())).toEqual({ ok: true, errors: [], notices: ['The API is the one in v1.0.0'] });
  });
});

describe('what breaks, at a minor release after 1.0', () => {
  const breaks: [string, (files: Files) => void, string][] = [
    ['an export map key gone', pkgEdit((p) => delete p.exports['./theme.css']), 'export map ./theme.css'],
    ['an entry name gone', replace('dist/model/index.d.ts', 'export interface Row { id: string }\n', ''), './model Row (type)'],
    ['a value made a type', replace('dist/model/index.d.ts', 'export declare function rows(name: string): number;', 'export type rows = number;'), './model rows (value)'],
    ['a detail field gone', replace('dist/widgets/x/index.d.ts', '; count?: number', ''), '<dex-x> event dex-x-done detail count'],
    ['a detail field retyped', replace('dist/widgets/x/index.d.ts', 'id: string', 'id: number'), '<dex-x> event dex-x-done detail id'],
    ['a detail field made optional', replace('dist/widgets/x/index.d.ts', 'id: string', 'id?: string'), '<dex-x> event dex-x-done detail id'],
    ['a wire message gone', replace('dist/model/source/wire.d.ts', ' | ErrorMessage;', ';'), 'wire TableHostMessage error'],
    ['a wire field made required', replace('dist/model/source/wire.d.ts', 'docUri?: string', 'docUri: string'), 'wire TableHostMessage setRows field docUri'],
    ['a wire alias narrowed', replace('dist/model/source/wire.d.ts', " | 'bytes'", ''), 'wire type FolderAsk'],
    ['a theme token gone', replace('src/theme/tokens.css', ' --dex-b: red;', ''), 'theme token --dex-b'],
    ['an icon gone', (f) => delete f['icons/b.svg'], 'icon b'],
    ['an observed attribute gone', replace('dist/widgets/x/index.js', "'row-id', ", ''), '<dex-x> observes row-id'],
    ['sideEffects narrowed', pkgEdit((p) => (p.sideEffects = [])), 'package.json sideEffects *.css'],
    ['a peer floor raised to a major', pkgEdit((p) => (p.peerDependencies.core = '^2.0.0')), 'package.json peerDependencies core'],
  ];

  it.each(breaks)('fails on %s', (_what, edit, key) => {
    const result = check(surface(edit), '1.1.0');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(key);
    expect(result.errors.join('\n')).toMatch(/at least 2\.0\.0; it is 1\.1\.0/);
  });

  it.each(breaks)('lets %s through a major bump, and says so', (_what, edit, key) => {
    const result = check(surface(edit), '2.0.0');
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(result.notices.join('\n')).toContain(key);
  });
});

describe('what is reported and passes', () => {
  const passes: [string, (files: Files) => void, string][] = [
    ['a name added', replace('dist/model/index.d.ts', 'export interface Row', 'export interface Col { id: string }\nexport interface Row'), 'New since v1.0.0:\n  ./model Col (type)'],
    ['a detail field added', replace('dist/widgets/x/index.d.ts', 'id: string;', 'id: string; at?: string;'), '<dex-x> event dex-x-done detail at'],
    ['a wire message added', replace('dist/model/source/wire.d.ts', ' | ErrorMessage;', " | ErrorMessage | EmptyMessage;\nexport interface EmptyMessage { type: 'empty' }"), 'wire TableHostMessage empty'],
    ['a value retyped', replace('dist/model/index.d.ts', '(name: string): number', '(name: string, at?: number): number'), 'Type changed since v1.0.0:\n  ./model rows (value)'],
    ['a name gone from ./host', replace('dist/host/index.d.ts', 'export declare function getModel(uri: string): unknown;\n', ''), './host getModel (value)'],
    ['a token a widget no longer reads', replace('dist/widgets/x/index.js', 'var(--dex-a)', 'none'), './x reads --dex-a'],
    ['a peer floor raised within its major', pkgEdit((p) => (p.peerDependencies.core = '^1.50.0')), 'package.json peerDependencies core'],
    ['files changed', pkgEdit((p) => (p.files = ['dist'])), 'package.json files icons'],
  ];

  it.each(passes)('passes %s at a patch release, and says so', (_what, edit, said) => {
    const result = check(surface(edit));
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(result.notices.join('\n')).toContain(said);
  });
});
