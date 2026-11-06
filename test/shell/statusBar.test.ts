// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What the status bar says of the active tab (<dex-shell-status>, which connectShell puts in the
// shell's status slot): the file's format as a small uppercase pill ("SLDD"), its kind in words as
// the pill's tooltip, and "Modified" in the warning colour while the tab holds unsaved edits. The
// words have to be read on the status bar in every theme: the warning ink is 4.05:1 on the light
// bar itself, under WCAG AA's 4.5, so "Modified" sits on a chip of the page's surface, where it
// is 4.6:1 or better; the pill's ink is the text's, on the badge's wash over the bar. happy-dom
// composites nothing, so the pairs are worked out from the theme sheet's three sets, and the
// stylesheet is checked to draw with those tokens.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DexShellStatus, defineShellStatus } from '../../src/widgets/app-shell/connect/dex-shell-status.js';
import { statusOf } from '../../src/widgets/app-shell/connect/documents.js';
import { THEME_SETS } from '../tools/cssTokens.js';
import { edit, open, startPage, until } from './harness.js';

beforeAll(() => defineShellStatus());
afterEach(() => document.body.replaceChildren());

async function mount(props: Partial<Pick<DexShellStatus, 'format' | 'kind' | 'modified'>>): Promise<DexShellStatus> {
  const el = new DexShellStatus();
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const pill = (el: Element) => el.shadowRoot!.querySelector<HTMLElement>('.format');
const mark = (el: Element) => el.shadowRoot!.querySelector<HTMLElement>('.modified');

// The stylesheet as text, comments out and whitespace folded.
const sheet = (): string =>
  [DexShellStatus.styles]
    .flat(Infinity)
    .map((s) => (s as { cssText: string }).cssText)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');
// Every declaration of the rules `selector` is one of the selectors of, in order.
const rule = (selector: string, css = sheet()): string =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(',').some((one) => one.trim() === selector))
    .map(([, , body]) => body)
    .join(';');

// A colour of the theme sheet as [r, g, b, alpha]: #rgb, #rrggbb or rgba(r, g, b, a).
function rgba(colour: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
  if (hex) {
    const [r, g, b] = (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16));
    return [r!, g!, b!, 1];
  }
  const [r, g, b, a] = colour.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!, a ?? 1];
}
// `top` painted over the opaque `under`.
const over = (top: string, under: string): [number, number, number] => {
  const [r, g, b, a] = rgba(top);
  const [ur, ug, ub] = rgba(under);
  return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];
};
// WCAG's contrast ratio of two opaque colours.
function contrast(a: readonly number[], b: readonly number[]): number {
  const luminance = (rgb: readonly number[]): number => {
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('<dex-shell-status>', () => {
  it("draws the format as a pill, the kind in words its tooltip, and no Modified mark while there are no edits", async () => {
    const el = await mount({ format: 'SLDD', kind: 'Data dictionary' });
    expect(pill(el)!.textContent).toBe('SLDD');
    expect(pill(el)!.title).toBe('Data dictionary');
    expect(getComputedStyle(pill(el)!).textTransform).toBe('uppercase');
    expect(mark(el)).toBeNull();
  });

  it('says Modified after the pill while the file holds edits', async () => {
    const el = await mount({ format: 'MAT', kind: 'MAT-file', modified: true });
    expect([...el.shadowRoot!.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['MAT', 'Modified']);
  });

  it('draws nothing for no file, or one of no kind it names', async () => {
    const el = await mount({});
    expect(el.shadowRoot!.querySelectorAll('span')).toHaveLength(0);
  });

  it('draws the pill and the mark in the theme, each readable at 4.5:1 or better in every theme', () => {
    expect(rule('.format')).toContain('background: var(--dex-bg-badge, rgba(128, 128, 128, 0.18))');
    expect(rule('.format')).toContain('color: var(--dex-color-text, #333)');
    expect(rule('.modified')).toContain('color: var(--dex-color-warning, #d83b01)');
    expect(rule('.modified')).toContain('background: var(--dex-bg-primary, #fff)');
    for (const [set, t] of Object.entries(THEME_SETS)) {
      const bar = t.get('--dex-bg-activity-bar')!;
      const badge = over(t.get('--dex-bg-badge')!, bar);
      expect(contrast(rgba(t.get('--dex-color-text')!), badge), `${set}: the pill`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgba(t.get('--dex-color-warning')!), rgba(t.get('--dex-bg-primary')!)), `${set}: Modified`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('outlines both in forced colours, where their surfaces are painted over', () => {
    const forced = /@media \(forced-colors: active\) \{(.*)\}\s*$/.exec(sheet())?.[1] ?? '';
    expect(rule('.format', forced)).toContain('border-color: CanvasText');
    expect(rule('.modified', forced)).toContain('border-color: CanvasText');
  });
});

describe('statusOf', () => {
  it("says a tab's format by its file's extension, its kind in words, and whether it holds edits", () => {
    const tab = (path: string, dirty?: boolean) => ({ path, ...(dirty === undefined ? {} : { dirty }) }) as Parameters<typeof statusOf>[0];
    expect(statusOf(tab('/w/params.sldd'))).toEqual({ format: 'SLDD', kind: 'Data dictionary', modified: false });
    expect(statusOf(tab('/w/m.slx', true))).toEqual({ format: 'SLX', kind: 'Simulink model', modified: true });
    expect(statusOf(tab('/w/old.mdl'))).toEqual({ format: 'MDL', kind: 'Simulink model', modified: false });
    expect(statusOf(tab('/w/ParamMat.mat'))).toEqual({ format: 'MAT', kind: 'MAT-file', modified: false });
    expect(statusOf(tab('/w/p/matlab.toml'))).toEqual({ format: 'TOML', kind: 'Project', modified: false });
    expect(statusOf(undefined)).toEqual({ format: '', kind: '', modified: false });
    expect(statusOf(tab('/w/notes.txt', true))).toEqual({ format: '', kind: '', modified: false });
  });
});

describe('the status bar, connected', () => {
  const status = () => document.querySelector<DexShellStatus>('dex-shell-status[slot="status"]')!;

  it("shows the active tab's format, then Modified once it is edited", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    await until(() => status().format === 'SLDD');
    expect(status().kind).toBe('Data dictionary');
    expect(status().modified).toBe(false);
    await edit('params.sldd', 'Kp', '7');
    await until(() => status().modified);
    await status().updateComplete;
    expect(mark(status())!.textContent).toBe('Modified');
  });
});
