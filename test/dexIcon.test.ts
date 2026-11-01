// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// WHERE AN ICON IS LOADED FROM.
//
// <dex-icon> draws `<base><id>.svg`. The base used to be Vite's `import.meta.env.BASE_URL`, a
// build-time value of whichever app bundled the widgets: meaningless in another app's bundle,
// and a TypeError outside Vite, where `import.meta.env` is undefined. Now it is the package's own
// icons/ folder, found from the module's URL, unless the app says otherwise with setIconBase.
import { describe, it, expect, afterEach, beforeAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DexIcon, defineIcon, setIconBase } from '../src/widgets/shared/dex-icon.js';
import { THEME_SETS } from './tools/cssTokens.js';
import { shippedIcon } from './tools/shippedIcons.js';

defineIcon();

const ROOT = process.cwd();
const BUILT = join(ROOT, 'dist', 'widgets', 'shared', 'dex-icon.js');

let icons: DexIcon[] = [];

async function draw(iconId: string): Promise<string> {
  const el = new DexIcon();
  icons.push(el);
  document.body.appendChild(el);
  el.iconId = iconId;
  await el.updateComplete;
  return el.shadowRoot!.querySelector('img')!.getAttribute('src')!;
}

// The base is the module's, shared by every icon on the page, so each case that moves it puts
// back the one an icon drew with before any case moved it.
let initial = '';
beforeAll(async () => {
  initial = await draw('blocks');
});
afterEach(() => {
  for (const el of icons) el.remove();
  icons = [];
  setIconBase(initial.slice(0, -'blocks.svg'.length));
});

describe('setIconBase', () => {
  it('starts out at an icons/ folder', () => {
    expect(initial).toMatch(/\/icons\/blocks\.svg$/);
  });

  it('moves every icon drawn after it', async () => {
    setIconBase('https://cdn.example/dex/icons/');
    expect(await draw('typeBus')).toBe('https://cdn.example/dex/icons/typeBus.svg');
    expect(await draw('wsTable')).toBe('https://cdn.example/dex/icons/wsTable.svg');
  });

  it('keeps a relative base relative, for the page to resolve as any img src', async () => {
    // What data-explorer-vscode sets: its icons sit beside the bundle, under the shell's <base>.
    setIconBase('./icons/');
    expect(await draw('blocks')).toBe('./icons/blocks.svg');
  });

  it('takes the folder with or without its trailing slash', async () => {
    setIconBase('/assets/icons');
    expect(await draw('blocks')).toBe('/assets/icons/blocks.svg');
  });

  it('still maps a data-model kind onto its file under the new base', async () => {
    setIconBase('./icons/');
    expect(await draw('struct')).toBe('./icons/typeStruct.svg');
  });
});

describe('an id that is not an alias', () => {
  // The alias table is a plain object, and indexing one also answers with what it inherits: a
  // bare `ALIASES[id]` gave Object.prototype's `constructor` (a function, so its source text
  // became the file name), `toString`, or the prototype itself for `__proto__`. Only the
  // table's own keys are aliases.
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'])('draws %s as the file of that name', async (id) => {
    setIconBase('./icons/');
    expect(await draw(id)).toBe(`./icons/${id}.svg`);
  });

  it('still maps a kind the table names', async () => {
    setIconBase('./icons/');
    expect(await draw('bus')).toBe('./icons/typeBus.svg');
    expect(await draw('typeBus')).toBe('./icons/typeBus.svg');
  });
});

describe('with no bundler at all', () => {
  const render = (iconId: string, base?: string): string =>
    execFileSync(
      process.execPath,
      ['--conditions=browser', join(ROOT, 'test', 'tools', 'renderIconInPlainNode.mjs'), BUILT, iconId, ...(base === undefined ? [] : [base])],
      { encoding: 'utf8' },
    );

  it('the built module reads nothing from import.meta.env', () => {
    expect(readFileSync(BUILT, 'utf8')).not.toMatch(/import\.meta\.env/);
  });

  it("renders in plain Node, from the package's own icons/ folder, where the file is", () => {
    const src = render('typeBus');
    expect(src.startsWith('file://')).toBe(true);
    expect(existsSync(fileURLToPath(src)), src).toBe(true);
    expect(realpathSync(fileURLToPath(src))).toBe(realpathSync(join(ROOT, 'icons', 'typeBus.svg')));
  });

  it('and from wherever setIconBase says', () => {
    expect(render('typeBus', './icons/')).toBe('./icons/typeBus.svg');
  });
});

describe('on a dark page', () => {
  // The icons are light-theme art in an <img>, which no stylesheet can recolour from outside, so
  // a dark theme turns the whole image over with a filter.
  it('theme.css turns the icons over in the dark set, and leaves them as drawn in the light ones', () => {
    expect(THEME_SETS.light.get('--dex-icon-filter')).toBe('none');
    expect(THEME_SETS['high-contrast'].get('--dex-icon-filter')).toBe('none');
    expect(THEME_SETS.dark.get('--dex-icon-filter')).toBe('invert(0.85) hue-rotate(180deg)');
  });

  it('dex-icon puts the token on its image', () => {
    expect(String(DexIcon.styles)).toMatch(/img\s*\{[^}]*filter:\s*var\(--dex-icon-filter,\s*none\)/);
  });
});

// What a row's iconId becomes on screen. dex-tree-table binds RowData.Name.iconId to a <dex-icon>,
// which maps the id onto a file under the icon base and draws an <img>. The alias table exists
// because the data model names kinds ('struct', 'bus') while the shipped files carry MathWorks icon
// names ('typeStruct').
async function make(iconId: string, size?: number): Promise<DexIcon> {
  const el = new DexIcon();
  icons.push(el);
  document.body.appendChild(el);
  el.iconId = iconId;
  if (size !== undefined) el.size = size;
  await el.updateComplete;
  return el;
}

const img = (el: DexIcon): HTMLImageElement | null => el.shadowRoot!.querySelector('img');
const src = (el: DexIcon): string => img(el)!.getAttribute('src')!;
// The shipped file the rendered src names, or undefined.
const assetFor = (el: DexIcon): string | undefined => shippedIcon(src(el).replace(/^.*\/icons\//, '').replace(/\.svg$/, ''));

describe('rendering an icon', () => {
  beforeEach(() => setIconBase('./icons/'));

  it('renders an <img> pointing at the matching file under icons/', async () => {
    expect(src(await make('blocks'))).toBe('./icons/blocks.svg');
  });

  it('sizes the image on both axes so rows do not shift while icons load', async () => {
    const el = await make('blocks', 24);
    expect(img(el)!.getAttribute('width')).toBe('24');
    expect(img(el)!.getAttribute('height')).toBe('24');
  });

  it('defaults to the 16px tree/table row size', async () => {
    const el = await make('blocks');
    expect(img(el)!.getAttribute('width')).toBe('16');
    expect(img(el)!.getAttribute('height')).toBe('16');
  });

  it('hides the image from assistive tech because the row name carries the meaning', async () => {
    // The icon duplicates information already in the Name cell; announcing it would make a
    // screen reader read every row twice.
    const el = await make('blocks');
    expect(img(el)!.getAttribute('alt')).toBe('');
    expect(img(el)!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('aliasing a data-model kind onto a shipped asset', () => {
  // The alias table is a compatibility layer, not a live path: every node class in
  // data-explorer-core returns an asset name directly from its `icon` getter. It is kept for ids
  // arriving from outside that set, so what these cases pin is that each mapping names an asset
  // that EXISTS. A mapping to a missing file can only ever render a broken image.
  const ALIASES: [string, string][] = [
    ['struct', 'typeStruct'],
    ['cell', 'wsBrackets'],
    ['string', 'wsString'],
    ['parameter', 'wsParameters'],
    ['bus', 'typeBus'],
    ['enum', 'typeEnum'],
    ['signal', 'typeSignal'],
    ['alias', 'typeAlias'],
    ['numeric', 'typeNumeric'],
    ['structElement', 'typeStructElement'],
    ['signalObject', 'typeSignal'],
    ['connectionBus', 'typeBus'],
    ['numericType', 'typeNumeric'],
    ['aliasType', 'typeAlias'],
    ['valueType', 'typeStruct'],
    ['variant', 'wsVariant'],
    ['configSet', 'settings'],
    ['matlabVariable', 'wsParameters'],
    ['matlabStruct', 'typeStruct'],
  ];

  beforeEach(() => setIconBase('./icons/'));

  it.each(ALIASES)('maps the %s kind onto %s.svg', async (kind, asset) => {
    expect(src(await make(kind))).toBe(`./icons/${asset}.svg`);
  });

  it('every alias resolves to an asset that actually ships', async () => {
    // An alias pointing at a missing file renders as a broken image, which is easy to miss by eye
    // — there is no generic fallback here.
    for (const [kind] of ALIASES) {
      const el = await make(kind);
      expect(assetFor(el), `alias ${kind} -> missing ${src(el)}`).toBeDefined();
    }
  });

  it('passes an unaliased id straight through as the file name', async () => {
    // Most ids a row carries are already asset names (a section's iconId, a model's sections);
    // aliasing must not rewrite them.
    const el = await make('databaseFolderDesign');
    expect(src(el)).toBe('./icons/databaseFolderDesign.svg');
    expect(assetFor(el)).toBeDefined();
  });
});

describe('no icon to show', () => {
  it('renders nothing at all when the row carries no iconId', async () => {
    // A row whose Name has no iconId (dex-tree-table guards with `iconId ? …`) and the drag
    // tooltip both leave this empty. Emitting an <img src=".svg"> would fire a failing request
    // and show a broken-image glyph in the row.
    const el = await make('');
    expect(img(el)).toBeNull();
    expect(el.shadowRoot!.textContent!.trim()).toBe('');
  });

  it('renders nothing before any iconId is assigned', async () => {
    // The default: the element is constructed and rendered once before the row data arrives.
    const el = new DexIcon();
    icons.push(el);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(img(el)).toBeNull();
  });

  it('removes the image when the id is cleared', async () => {
    // The drop tooltip reuses one element across drags and clears its icon at the end; a stale
    // icon would linger next to the next drag's label.
    const el = await make('blocks');
    expect(img(el)).not.toBeNull();
    el.iconId = '';
    await el.updateComplete;
    expect(img(el)).toBeNull();
  });

  it('shows the image again when a new id arrives after an empty one', async () => {
    setIconBase('./icons/');
    const el = await make('');
    el.iconId = 'typeBus';
    await el.updateComplete;
    expect(src(el)).toBe('./icons/typeBus.svg');
  });
});
