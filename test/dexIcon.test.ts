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
  // typeBus drawn in one plain Node process, from the package's own icons/ folder and then from
  // where setIconBase says. Starting Node and loading happy-dom and the built module takes a second
  // or more, several on a loaded machine: done once, given the time, and killed at 30 s, so a
  // process that hangs fails the hook rather than holding the worker.
  let own = '';
  let based = '';
  beforeAll(() => {
    const script = join(ROOT, 'test', 'tools', 'renderIconInPlainNode.mjs');
    const out = execFileSync(process.execPath, ['--conditions=browser', script, BUILT, 'typeBus', './icons/'], { encoding: 'utf8', timeout: 30_000 });
    [own, based] = JSON.parse(out) as [string, string];
  }, 45_000);

  it('the built module reads nothing from import.meta.env', () => {
    expect(readFileSync(BUILT, 'utf8')).not.toMatch(/import\.meta\.env/);
  });

  it("renders in plain Node, from the package's own icons/ folder, where the file is", () => {
    expect(own.startsWith('file://')).toBe(true);
    expect(existsSync(fileURLToPath(own)), own).toBe(true);
    expect(realpathSync(fileURLToPath(own))).toBe(realpathSync(join(ROOT, 'icons', 'typeBus.svg')));
  });

  it('and from wherever setIconBase says', () => {
    expect(based).toBe('./icons/typeBus.svg');
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

describe('in one colour (mono)', () => {
  // The shell's Minimal icon style: a toolbar's or an activity bar's glyph in the colour of the
  // text beside it rather than in the icon's own, as the prototype drew them. It is drawn from the
  // same file, so no second set of icons ships: an SVG <image> of the file, through a filter that
  // keeps the icon's strokes and dark shapes, in the element's currentColor, and drops its light
  // fills. Not a CSS mask, the other way to paint an image in currentColor: a mask image is
  // fetched in CORS mode, which a page on file:// (the Electron app's) is refused, so every icon
  // would vanish there; and an alpha mask fills each white tile solid, so Delete, Cut or Code
  // became a dark square.
  beforeEach(() => setIconBase('./icons/'));

  const image = (el: DexIcon): SVGImageElement | null => el.shadowRoot!.querySelector('svg image');

  async function mono(iconId: string, size?: number): Promise<DexIcon> {
    const el = await make(iconId, size);
    el.mono = true;
    await el.updateComplete;
    return el;
  }

  // The filter's alpha out of a colour, as feColorMatrix computes it (its fourth row, on the
  // colour's own sRGB values: color-interpolation-filters="sRGB"), clamped as a filter clamps it.
  function alphaOf(el: DexIcon, hex: string): number {
    const values = el.shadowRoot!.querySelector('feColorMatrix, fecolormatrix')!.getAttribute('values')!.trim().split(/\s+/).map(Number);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [kr, kg, kb, ka, k] = values.slice(15, 20);
    return Math.min(1, Math.max(0, kr! * r! + kg! * g! + kb! * b! + ka! * 1 + k!));
  }

  it('is off by default, and draws the <img> as before', async () => {
    const el = await make('undo');
    expect(el.mono).toBe(false);
    expect(img(el)).not.toBeNull();
    expect(image(el)).toBeNull();
  });

  it('draws the same file as an SVG image, at its size, and no <img>', async () => {
    const el = await mono('undo', 18);
    expect(img(el)).toBeNull();
    expect(image(el)!.getAttribute('href')).toBe('./icons/undo.svg');
    const svg = el.shadowRoot!.querySelector('svg')!;
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['18', '18']);
    expect([image(el)!.getAttribute('width'), image(el)!.getAttribute('height')]).toEqual(['18', '18']);
  });

  it('through a filter of its own shadow root that floods the shape with currentColor', async () => {
    const el = await mono('undo');
    const ref = /^url\(#([\w-]+)\)$/.exec(image(el)!.getAttribute('filter') ?? '')?.[1];
    expect(ref).toBeDefined();
    const filter = el.shadowRoot!.querySelector(`#${ref}`)!;
    expect(filter.localName).toBe('filter');
    expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(filter.querySelector('[flood-color]')!.getAttribute('flood-color')).toBe('currentColor');
  });

  it("keeps the icons' strokes and dark shapes whole, and drops their light fills", async () => {
    // The colours the icons are drawn in (icons/*.svg): every stroke and glyph, grey or coloured,
    // is ink; every tile and pastel fill is left out, so a white page shows through it.
    const el = await mono('undo');
    const strokes = ['#616161', '#616160', '#888888', '#008013', '#1656A7', '#104280', '#902622', '#610908', '#674C06', '#278CDD'];
    const fills = ['#FFFFFF', '#F5F5F5', '#D9D9D9', '#FFF5BC', '#B4DEFF', '#CBFFBE'];
    for (const c of strokes) expect(alphaOf(el, c), c).toBe(1);
    for (const c of fills) expect(alphaOf(el, c), c).toBe(0);
    // The two drawn between, part ink: the gear's middle disc (settings.svg), half, which reads
    // as a ring; Delete's red tile, a faint fill.
    expect(alphaOf(el, '#A6A6A6')).toBeCloseTo(0.5, 1);
    expect(alphaOf(el, '#FF9D9A')).toBeCloseTo(0.27, 1);
  });

  it('is decorative, as the <img> is', async () => {
    const el = await mono('undo');
    expect(el.shadowRoot!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it("takes no dark set's filter: the ink is the theme's own text colour already", () => {
    // The token turns an <img> over; on the mono glyph it would turn a light ink dark again.
    const text = String(DexIcon.styles);
    expect(text).not.toMatch(/svg[^{]*\{[^}]*--dex-icon-filter/);
    // Nor on the host, which would filter the glyph with everything else in it.
    expect(text).not.toMatch(/:host[^{]*\{[^}]*--dex-icon-filter/);
  });

  it('maps a data-model kind, and draws nothing for no id', async () => {
    expect(image(await mono('bus'))!.getAttribute('href')).toBe('./icons/typeBus.svg');
    const none = await mono('');
    expect(none.shadowRoot!.querySelector('svg')).toBeNull();
    expect(img(none)).toBeNull();
  });

  it('goes back to the <img> when it is turned off, and is set by the attribute in markup', async () => {
    const el = await mono('undo');
    el.mono = false;
    await el.updateComplete;
    expect(image(el)).toBeNull();
    expect(src(el)).toBe('./icons/undo.svg');
    document.body.insertAdjacentHTML('beforeend', '<dex-icon icon-id="redo" mono></dex-icon>');
    const marked = document.body.lastElementChild as DexIcon;
    icons.push(marked);
    await marked.updateComplete;
    expect(marked.mono).toBe(true);
    expect(image(marked)!.getAttribute('href')).toBe('./icons/redo.svg');
  });
});
