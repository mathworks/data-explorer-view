// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// THE ICONS AS ASSETS OF AN APP'S BUNDLE.
//
// An app that bundles the widgets moves dex-icon into a chunk of its own, from which the package's
// icons/ folder is nowhere, so it had to copy the 114 files itself and call setIconBase (the desktop
// app wrote a 24-line Vite plugin for it). `data-explorer-view/icon-assets` names every icon as a
// literal `new URL('../../../icons/<id>.svg', import.meta.url)`, which a bundler turns into an
// asset it copies, and useIconAssets() draws the icons from those URLs.
//
// The list is generated from icons/ (scripts/gen-icon-assets.mjs, by `npm run build`), so it is
// checked here against the folder, and each URL against the literal a bundler needs. It is opt-in:
// importing the entry changes nothing until useIconAssets() is called, and VS Code, which ships the
// folder as files, does not import it.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { DexIcon, defineIcon, setIconBase } from '../src/widgets/shared/dex-icon.js';
import { ICON_ASSETS, useIconAssets } from '../src/widgets/icon-assets/index.js';

defineIcon();

const ROOT = process.cwd();
const IDS = readdirSync(join(ROOT, 'icons'))
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.slice(0, -'.svg'.length))
  .sort();

// Each `'<id>': new URL('<path>', import.meta.url)` in a module, read by the parser.
function literals(file: string): { id: string; path: string }[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const found: { id: string; path: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
      // `new URL(…).href`: the NewExpression under the property access.
      const init = node.initializer;
      const url = ts.isPropertyAccessExpression(init) ? init.expression : init;
      if (
        ts.isNewExpression(url) &&
        url.expression.getText(source) === 'URL' &&
        url.arguments?.length === 2 &&
        ts.isStringLiteral(url.arguments[0]!) &&
        url.arguments[1]!.getText(source) === 'import.meta.url'
      ) {
        found.push({ id: node.name.text, path: (url.arguments[0] as ts.StringLiteral).text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

let icons: DexIcon[] = [];
async function draw(iconId: string): Promise<string> {
  const el = new DexIcon();
  icons.push(el);
  document.body.appendChild(el);
  el.iconId = iconId;
  await el.updateComplete;
  return el.shadowRoot!.querySelector('img')!.getAttribute('src')!;
}

afterEach(() => {
  for (const el of icons) el.remove();
  icons = [];
  setIconBase('./icons/');
});

describe('the generated list', () => {
  it('names every icon in icons/, and nothing else', () => {
    expect(IDS.length).toBeGreaterThan(100);
    expect(Object.keys(ICON_ASSETS).sort()).toEqual(IDS);
  });

  it('is the module the generator writes from icons/ today', () => {
    expect(() => execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-icon-assets.mjs'), '--check'], { encoding: 'utf8' })).not.toThrow();
  });

  it('writes each URL as the literal a bundler resolves, in src/ and in dist/', () => {
    for (const file of [join(ROOT, 'src/widgets/icon-assets/assets.ts'), join(ROOT, 'dist/widgets/icon-assets/assets.js')]) {
      const found = literals(file);
      expect(found.map((f) => f.id), file).toEqual(IDS);
      for (const { id, path } of found) expect(path, `${file} ${id}`).toBe(`../../../icons/${id}.svg`);
    }
  });

  it('each URL is the file, from where the module is', () => {
    const at = pathToFileURL(join(ROOT, 'dist/widgets/icon-assets/assets.js'));
    for (const { id, path } of literals(fileURLToPath(at))) {
      expect(existsSync(fileURLToPath(new URL(path, at))), id).toBe(true);
    }
  });
});

describe('useIconAssets', () => {
  it('importing the entry draws nothing differently', async () => {
    setIconBase('./icons/');
    expect(await draw('typeBus')).toBe('./icons/typeBus.svg');
  });

  it('draws each icon from its own URL, after the alias table', async () => {
    useIconAssets();
    expect(await draw('typeBus')).toBe(ICON_ASSETS.typeBus);
    expect(await draw('bus')).toBe(ICON_ASSETS.typeBus);
    expect(await draw('wsPlot-1')).toBe(ICON_ASSETS['wsPlot-1']);
  });

  it('leaves an id it does not know to the folder, as before', async () => {
    setIconBase('/static/icons/');
    useIconAssets();
    expect(await draw('noSuchIcon')).toBe('/static/icons/noSuchIcon.svg');
  });

  it('gives way to a setIconBase after it', async () => {
    useIconAssets();
    setIconBase('https://cdn.example/icons');
    expect(await draw('typeBus')).toBe('https://cdn.example/icons/typeBus.svg');
  });
});
