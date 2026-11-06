// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-gallery-panel>: the app shell's Gallery view, as the prototype's side panel draws one (a
// palette of the kinds of entry the active file can take, always open), built on view's own Add
// gallery rather than a second catalog. So the tiles are dex-add-gallery's and are tested there
// (addGalleryWidget.test.ts, addCatalog.test.ts); what is pinned here is what the panel adds and
// takes away:
//
//   - a heading that names where an add lands ("Add to plant.sldd"), and a note in place of a
//     gallery that has nowhere to add to;
//   - the gallery drawn in place, not as a popover (`inline`): no Keep open box, no focus taken
//     while the user works in the table, and the panel's width;
//   - one request out, `dex-gallery-add`, and the gallery's own `dex-add-tile` kept inside, so an
//     app listening on the document hears each add once, under the panel's name;
//   - nothing asked while it is disabled, whatever is clicked.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DexGalleryPanel,
  defineGalleryPanel,
  type GalleryAddDetail,
} from '../src/widgets/app-shell/modules/dex-gallery-panel.js';
import { DexAddGallery } from '../src/widgets/tree-table/dex-add-gallery.js';
import { allTiles, matCatalog } from '../src/model/ids/addCatalog.js';

beforeAll(() => defineGalleryPanel());
afterEach(() => document.body.replaceChildren());

async function panel(props: Partial<Pick<DexGalleryPanel, 'classes' | 'sections' | 'target' | 'disabled'>> = {}): Promise<DexGalleryPanel> {
  const el = document.createElement('dex-gallery-panel');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  await gallery(el).updateComplete;
  return el;
}

const gallery = (el: DexGalleryPanel): DexAddGallery => el.shadowRoot!.querySelector('dex-add-gallery')!;
const tiles = (el: DexGalleryPanel): HTMLButtonElement[] => [...gallery(el).shadowRoot!.querySelectorAll<HTMLButtonElement>('.tile')];
const text = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const cssOf = (styles: unknown): string =>
  [styles]
    .flat(Infinity)
    .map((sheet) => (sheet as { cssText: string }).cssText)
    .join('\n')
    .replace(/\s+/g, ' ');

/**
 * What the document hears in each test of the describe this is called in: every `dex-gallery-add`'s
 * detail, and every `dex-add-tile`, which should never get out of the panel.
 */
function listen(): { added: GalleryAddDetail[]; tiles: unknown[] } {
  const heard = { added: [] as GalleryAddDetail[], tiles: [] as unknown[] };
  const onAdd = (e: CustomEvent<GalleryAddDetail>): void => void heard.added.push(e.detail);
  const onTile = (e: Event): void => void heard.tiles.push(e);
  beforeEach(() => {
    heard.added.length = 0;
    heard.tiles.length = 0;
    document.addEventListener('dex-gallery-add', onAdd);
    document.addEventListener('dex-add-tile', onTile);
  });
  afterEach(() => {
    document.removeEventListener('dex-gallery-add', onAdd);
    document.removeEventListener('dex-add-tile', onTile);
  });
  return heard;
}

describe('dex-gallery-panel: what it draws', () => {
  it('heads the gallery with the file an add lands in', async () => {
    const el = await panel({ target: 'plant.sldd' });
    expect(text(el.shadowRoot!.querySelector('.header'))).toBe('Add to plant.sldd');
    el.target = '';
    await el.updateComplete;
    expect(text(el.shadowRoot!.querySelector('.header'))).toBe('Add');
  });

  it("draws view's Add gallery as a palette: every tile, and no Keep open box", async () => {
    const el = await panel({ target: 'plant.sldd' });
    expect(gallery(el)).toBeInstanceOf(DexAddGallery);
    expect(gallery(el).inline).toBe(true);
    expect(gallery(el).shadowRoot!.querySelector('.gallery-pin, input[type="checkbox"]')).toBeNull();
    expect(tiles(el).map((t) => t.dataset.className)).toEqual(allTiles().map((t) => t.className));
  });

  it("gives the gallery the panel's width, and none of a popover's frame", () => {
    const rule = /dex-add-gallery \{([^}]*)\}/.exec(cssOf(DexGalleryPanel.styles))?.[1] ?? '';
    expect(rule).toContain('--dex-add-gallery-width: 100%');
    expect(rule).toContain('box-shadow: none');
    expect(rule).toContain('max-height: none');
  });

  it("offers a MAT-file's classes and a model's sections, as the gallery takes them", async () => {
    const classes = ['double', 'Simulink.Parameter', 'Simulink.Signal'];
    const el = await panel({ classes, sections: ['config'] });
    expect(gallery(el).classes).toBe(classes);
    expect(gallery(el).sections).toEqual(['config']);
    await gallery(el).updateComplete;
    expect(tiles(el).map((t) => t.dataset.className)).toEqual(
      matCatalog(classes, ['config']).flatMap((c) => c.tiles.map((t) => t.className)),
    );
  });

  it('takes no focus when it is drawn beside the table', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    const el = await panel({ target: 'plant.sldd' });
    expect(document.activeElement).toBe(elsewhere);
    expect(gallery(el).shadowRoot!.activeElement).toBeNull();
  });

  it('has an attribute for each setting a page might write in markup', () => {
    const observed = (DexGalleryPanel as unknown as { observedAttributes: string[] }).observedAttributes;
    expect([...observed].sort()).toEqual(['disabled', 'target']);
  });
});

describe('dex-gallery-panel: adding', () => {
  const heard = listen();

  it('asks for the class, section and label of the tile clicked, once and under its own name', async () => {
    const el = await panel({ target: 'plant.sldd' });
    const tile = tiles(el).find((t) => t.dataset.className === 'Simulink.Parameter')!;
    tile.click();
    expect(heard.added).toEqual([{ className: 'Simulink.Parameter', section: 'design', label: 'Simulink Parameter' }]);
    // The gallery's own request stays inside the panel.
    expect(heard.tiles).toEqual([]);
  });

  it("names no section for a MAT-file's tile, as the gallery does", async () => {
    const el = await panel({ classes: ['double', 'Simulink.Parameter'] });
    tiles(el).find((t) => t.dataset.className === 'Simulink.Parameter')!.click();
    expect(heard.added).toEqual([{ className: 'Simulink.Parameter', section: '', label: 'Simulink Parameter' }]);
  });

  it('sends a request that bubbles out of the shadow root', async () => {
    const el = await panel();
    const events: CustomEvent[] = [];
    el.addEventListener('dex-gallery-add', (e) => events.push(e));
    tiles(el)[0]!.click();
    expect(events[0]?.bubbles).toBe(true);
    expect(events[0]?.composed).toBe(true);
  });

  it('leaves Escape to the page, and asks nothing for it', async () => {
    const el = await panel();
    const closed: unknown[] = [];
    document.addEventListener('dex-add-closed', (e) => closed.push(e), { once: true });
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    tiles(el)[0]!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(closed).toEqual([]);
  });
});

describe('dex-gallery-panel: disabled', () => {
  const heard = listen();

  it('says what to open, and keeps the tiles to look at but not to press', async () => {
    const el = await panel({ disabled: true });
    expect(text(el.shadowRoot!.querySelector('.note'))).toBe('Open a dictionary, a MAT-file or a model to add entries.');
    expect(gallery(el).hasAttribute('inert')).toBe(true);
    expect(tiles(el).length).toBe(allTiles().length);
  });

  it('asks for nothing, whatever is clicked', async () => {
    const el = await panel({ disabled: true });
    tiles(el)[0]!.click();
    expect(heard.added).toEqual([]);
    expect(heard.tiles).toEqual([]);
  });

  it('draws no note, and the gallery live, once enabled', async () => {
    const el = await panel({ disabled: true });
    el.disabled = false;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.note')).toBeNull();
    expect(gallery(el).hasAttribute('inert')).toBe(false);
    tiles(el)[0]!.click();
    expect(heard.added.length).toBe(1);
  });

  it('keeps the same gallery across the change, so it never takes the focus as a new one would', async () => {
    const el = await panel({ disabled: true });
    const before = gallery(el);
    el.disabled = false;
    await el.updateComplete;
    expect(gallery(el)).toBe(before);
  });
});

describe('defineGalleryPanel', () => {
  it('registers the panel, the gallery it draws and the icon the tiles draw', () => {
    expect(customElements.get('dex-gallery-panel')).toBe(DexGalleryPanel);
    expect(customElements.get('dex-add-gallery')).toBe(DexAddGallery);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
