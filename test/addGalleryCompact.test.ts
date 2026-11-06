// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Add gallery's `compact` layout, which the app shell's Gallery panel draws it in: small tiles,
// four to a row in the shell's default 200px sidebar, so the whole palette is on screen beside the table
// rather than two large tiles to a row that need scrolling. A tile has no frame until it is
// hovered or focused, a smaller label, and its section's badge in the flow under the label, where
// a tile this narrow has room for it (in the corner it would sit on the icon). Its accessible name
// still says where the entry lands.
//
// The table's own `+ Add` popover never sets it: it is the VS Code extension's, and stays as it
// was. happy-dom lays nothing out, so what is pinned is the default, the attribute, the markup,
// and the rules that make the layout; the screenshots look at the rest.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexAddGallery, defineAddGallery } from '../src/widgets/tree-table/dex-add-gallery.js';
import { DexTreeTable, defineTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';
import { allTiles } from '../src/model/ids/addCatalog.js';

defineAddGallery();
defineTreeTable();

const $$ = (el: Element, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];

async function gallery(props: Partial<Pick<DexAddGallery, 'compact' | 'inline'>> = {}): Promise<DexAddGallery> {
  const el = document.createElement('dex-add-gallery');
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

// The stylesheet as text, comments out and whitespace folded; every declaration of the rules
// `selector` is one of the selectors of.
const sheet = (): string =>
  [DexAddGallery.styles]
    .flat(Infinity)
    .map((s) => (s as { cssText: string }).cssText)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');
const rule = (selector: string): string =>
  [...sheet().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(',').some((one) => one.trim() === selector))
    .map(([, , body]) => body)
    .join(';');

describe('dex-add-gallery compact', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is off by default, and on from markup by its attribute, which it reflects', async () => {
    expect((await gallery()).compact).toBe(false);
    document.body.innerHTML = '<dex-add-gallery inline compact></dex-add-gallery>';
    const el = document.querySelector('dex-add-gallery')!;
    await el.updateComplete;
    expect(el.compact).toBe(true);
    el.compact = false;
    await el.updateComplete;
    expect(el.hasAttribute('compact')).toBe(false);
  });

  it('lays the tiles out four to a row in the default sidebar, more in a wider one, with no frame until one is pointed at', () => {
    // 44px or wider, in as many columns as fit: the shell's 200px sidebar less the gallery's 6px
    // either side holds four.
    expect(rule(':host([compact]) .tiles')).toContain('grid-template-columns: repeat(auto-fill, minmax(44px, 1fr))');
    expect(rule(':host([compact])')).toContain('padding: 8px 6px');
    expect(rule(':host([compact])')).toContain('max-width: none');
    expect(rule(':host([compact]) .tile')).toContain('border-color: transparent');
    expect(rule(':host([compact]) .tile')).toContain('font-size: 9px');
    expect(rule(':host([compact]) .tile:hover')).toContain('border-color: var(--dex-border-color-light, #e0e0e0)');
    expect(rule(':host([compact]) .tile:focus-visible')).toContain('border-color: var(--dex-color-accent, #0078d4)');
    // The shared focus ring too: a 1px accent border alone on a tile this small is easily missed.
    expect(rule(':host([compact]) .tile:focus-visible')).toContain('box-shadow: var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4))');
  });

  it('in forced colours, frames a tile only under the pointer, so a wide word does not cross a frame at rest', () => {
    // The popover's tiles are framed in ButtonText there; a compact tile's word may spill past its
    // edge (a 50px "Connection" in a 45px tile), and would run through a frame drawn round it.
    const forced = (sheet().split('@media (forced-colors: active)')[1] ?? '').replace(/^\s*\{/, '');
    const inForced = (selector: string) =>
      [...forced.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selectors]) => selectors!.split(',').some((one) => one.trim() === selector))
        .map(([, , body]) => body)
        .join(';');
    expect(inForced(':host([compact]) .tile')).toContain('border-color: Canvas !important');
    expect(inForced(':host([compact]) .tile:hover')).toContain('border-color: ButtonText !important');
    // The popover's frame stays.
    expect(inForced('.tile')).toContain('border: 1px solid ButtonText !important');
  });

  it('puts a badge under the label, in the flow, and keeps the destination in the name', async () => {
    const el = await gallery({ inline: true, compact: true });
    const constant = $$(el, '.tile').find((t) => t.dataset.className === 'Constant')!;
    expect([...constant.children].map((c) => c.className || c.localName)).toEqual(['dex-icon', 'tile-label', 'tile-badge']);
    expect(constant.querySelector('.tile-badge')!.textContent).toBe('Arch');
    expect(constant.getAttribute('aria-label')).toBe('Add Constant to Architectural Data');
    expect(rule(':host([compact]) .tile-badge')).toContain('position: static');
  });

  it('draws the same tiles, in the same order, as the popover', async () => {
    const el = await gallery({ inline: true, compact: true });
    expect($$(el, '.tile').map((t) => t.dataset.className)).toEqual(allTiles().map((t) => t.className));
  });

  it("is never the table's own + Add popover", async () => {
    const table = document.createElement('dex-tree-table') as DexTreeTable;
    table.canAdd = true;
    table.columns = ['Name', 'Value'];
    table.rows = [{ ID: 'a', parent: null, Name: { label: 'gain' }, Value: '5' } as TreeTableRow];
    document.body.appendChild(table);
    await table.updateComplete;
    (table.shadowRoot!.querySelector('.add-button') as HTMLElement).click();
    await table.updateComplete;
    const popover = table.shadowRoot!.querySelector('dex-add-gallery') as DexAddGallery;
    await popover.updateComplete;
    expect(popover.compact).toBe(false);
    expect(popover.hasAttribute('compact')).toBe(false);
  });
});
