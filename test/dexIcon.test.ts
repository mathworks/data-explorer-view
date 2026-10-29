// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// WHERE AN ICON IS LOADED FROM.
//
// <dex-icon> draws `<base><id>.svg`. The base used to be Vite's `import.meta.env.BASE_URL`, a
// build-time value of whichever app bundled the widgets: meaningless in another app's bundle,
// and a TypeError outside Vite, where `import.meta.env` is undefined. Now it is the package's own
// icons/ folder, found from the module's URL, unless the app says otherwise with setIconBase.
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DexIcon, defineIcon, setIconBase } from '../src/widgets/shared/dex-icon.js';
import { THEME_SETS } from './tools/cssTokens.js';

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
