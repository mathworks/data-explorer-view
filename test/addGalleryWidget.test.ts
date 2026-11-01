// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Add gallery as it renders and behaves, and the table's + Add button and popover that hold
// it. What the tiles are is addCatalog.test.ts's, and Up and Down over a drawn grid is
// addGalleryGrid.test.ts's; this is the interaction model, which is where the design made choices
// that are easy to undo by accident:
//
//   - the button is ABSENT where nothing can be added, not disabled;
//   - an unpinned add closes the popover, a pinned one does not;
//   - the pin outlives a close, because it describes the user's next few minutes;
//   - Escape and a click outside dismiss, and Escape does not also wipe the search box;
//   - the popover creates nothing itself: it names a class and a section and the table relays
//     that outward, which is the split that keeps one path writing documents.
//
// happy-dom lays nothing out and applies no stylesheet, so the CSS cases read the stylesheets as
// text: which rule a declaration is in, and which token it reads.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineAddGallery,
  defineTreeTable,
  type DexAddGallery,
  type DexTreeTable,
  type TreeTableRow,
} from '../src/widgets/tree-table/index.js';
import { ADD_CATALOG, allTiles, badgeOf } from '../src/model/ids/addCatalog.js';
import { THEME_SETS } from './tools/cssTokens.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineAddGallery();
defineTreeTable();

/**
 * A geometry token's px value, as theme.css declares it. The popover's geometry is two custom
 * properties in the theme sheet, read by two shadow roots; nothing in TS knows the numbers, so
 * they are read from where they are declared.
 */
function px(name: string): number {
  const m = /^(\d+)px$/.exec(THEME_SETS.light.get(name) ?? '');
  expect(m, `${name} is not declared in px in theme.css`).not.toBeNull();
  return Number(m![1]);
}

const $ = (el: Element, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement;
const $$ = (el: Element, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];

async function gallery(pinned = false): Promise<DexAddGallery> {
  const el = document.createElement('dex-add-gallery') as DexAddGallery;
  el.pinned = pinned;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('dex-add-gallery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders every category in order, and states no destination in the heading', async () => {
    const el = await gallery();
    expect($$(el, '.kind-name').map((n) => n.textContent!.trim())).toEqual(ADD_CATALOG.map((c) => c.title));
    // A heading names the kind and nothing else. Where a row lands is carried by the badge on
    // the tiles that depart from their neighbours, and by every tile's accessible name.
    expect($$(el, '.kind-dest')).toEqual([]);
  });

  it('renders one tile per catalog entry, in catalog order', async () => {
    const el = await gallery();
    const tiles = $$(el, '.tile');
    expect(tiles.map((t) => t.dataset.className)).toEqual(allTiles().map((t) => t.className));
    expect(tiles.map((t) => t.dataset.section)).toEqual(allTiles().map((t) => t.section));
  });

  // The destination is the one fact about a tile that is not in its label, and a button inside
  // a group gets no heading context read to it, so it has to be in the name.
  it('names the destination in every tile’s accessible name, badged or not', async () => {
    const el = await gallery();
    const unbadged = $$(el, '.tile').find((t) => t.dataset.className === 'Simulink.Parameter')!;
    const badged = $$(el, '.tile').find((t) => t.dataset.className === 'Constant')!;
    expect(unbadged.getAttribute('aria-label')).toBe('Add Simulink Parameter to Design Data');
    expect(badged.getAttribute('aria-label')).toBe('Add Constant to Architectural Data');
    // The label reads `Variant Config`, so `Design Data` is spoken only if this attribute says it.
    const noBadge = $$(el, '.tile').find((t) => t.dataset.className === 'Simulink.VariantConfigurationData')!;
    expect(noBadge.getAttribute('aria-label')).toBe('Add Variant Config to Design Data');
  });

  // The break is data (labelLinesOf), one word per line, so a tile only has to be as wide as the
  // longest WORD. The accessible name above stays one line: a newline there would be read aloud.
  it('draws a label one word to a line, and the one three-word label as two', async () => {
    const el = await gallery();
    const linesOf = (className: string) =>
      [...$$(el, '.tile').find((t) => t.dataset.className === className)!.querySelectorAll('.tile-line')].map((n) =>
        n.textContent!.trim(),
      );
    expect(linesOf('Simulink.Parameter')).toEqual(['Simulink', 'Parameter']);
    expect(linesOf('Simulink.Breakpoint')).toEqual(['Breakpoint']);
    expect(linesOf('Simulink.VariantBankCoderInfo')).toEqual(['Bank', 'Coder Info']);
  });

  // 24px is what the MATLAB toolstrip's gallery draws in this layout, where 16 is its dense-list
  // size. Not a free parameter: the badge is right-anchored and the icon centred, so every 2px of
  // icon spends 1px of the gap between them (see ICON_SIZE in dex-add-gallery.ts). A well-meant
  // bump to 28 or 32 puts the badge on top of the glyph.
  it('draws every tile’s icon at the toolstrip gallery’s size, not the dense-list size', async () => {
    const el = await gallery();
    const sizes = $$(el, '.tile dex-icon').map((n) => (n as any).size);
    expect(sizes.length).toBe(allTiles().length);
    expect([...new Set(sizes)]).toEqual([24]);
  });

  // Which tiles depart is the catalog's to say (addCatalog.test.ts lists them); the widget's part
  // is to draw exactly the badge badgeOf gives each tile, and none where it gives none.
  it('badges only the tiles that depart from their category', async () => {
    const el = await gallery();
    const drawn = $$(el, '.tile').map((t) => t.querySelector('.tile-badge')?.textContent!.trim() ?? null);
    expect(drawn).toEqual(ADD_CATALOG.flatMap((c) => c.tiles.map((t) => badgeOf(c, t))));
    expect(drawn.filter((b) => b !== null).length).toBe(5);
  });

  // Variant Config writes into Design Data, as every Variants tile does, so the heading states it
  // once. The section is read back off the rendered tile because it is what the tile hands the app.
  it('draws no badge on a Variants tile, which all land in Design Data', async () => {
    const el = await gallery();
    const tile = $$(el, '.tile').find((t) => t.dataset.className === 'Simulink.VariantConfigurationData')!;
    expect(tile.dataset.section).toBe('design');
    expect(tile.querySelector('.tile-badge')).toBeNull();
  });

  it('asks for the class and section the tile names, and nothing more', async () => {
    const el = await gallery();
    let detail: unknown = null;
    el.addEventListener('dex-add-tile', (e) => {
      detail = (e as CustomEvent).detail;
    });
    $$(el, '.tile')
      .find((t) => t.dataset.className === 'Simulink.ServiceBus')!
      .click();
    expect(detail).toEqual({ className: 'Simulink.ServiceBus', section: 'arch', label: 'Service Interface' });
  });

  it('reports the pin rather than acting on it, so the table can keep the choice', async () => {
    const el = await gallery();
    const seen: unknown[] = [];
    el.addEventListener('dex-add-pin-changed', (e) => seen.push((e as CustomEvent).detail));
    const box = $(el, '.gallery-pin input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen).toEqual([{ pinned: true }]);
    expect(el.pinned).toBe(true);
  });

  it('opens showing the pin it was given', async () => {
    const el = await gallery(true);
    expect(($(el, '.gallery-pin input') as HTMLInputElement).checked).toBe(true);
  });

  // Ruling V-038 (b): closing a pinned gallery does not select the run it added, so the tooltip
  // no longer promises it ("closing selects the whole run"). Each add selects its own new entry,
  // and what closing a run leaves selected is pinned in addPopoverRename.test.ts.
  it('the pin promises only what it does', async () => {
    const el = await gallery();
    const title = $(el, '.gallery-pin').getAttribute('title');
    expect(title).toBe('Stay open after each add. Entries land immediately and are not renamed.');
    expect(title).not.toMatch(/select/i);
  });

  it('Escape asks to close, and keeps the key to itself', async () => {
    const el = await gallery();
    let closed = 0;
    el.addEventListener('dex-add-closed', () => closed++);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    $(el, '.tile').dispatchEvent(ev);
    expect(closed).toBe(1);
    // Not propagated: the table's own Escape clears the whole search, and dismissing a popover
    // must not throw away what the user typed to find the tile.
    expect(ev.cancelBubble).toBe(true);
  });

  it('puts focus on the first tile, so it is usable without the mouse', async () => {
    const el = await gallery();
    expect(el.shadowRoot!.activeElement).toBe($(el, '.tile'));
  });

  // --- Roving tabindex ---------------------------------------------------------------------------
  //
  // 28 tiles were 28 tab stops: Configurations was twenty-odd presses of Tab away, and leaving the
  // gallery was the rest of them. One stop for the grid, arrows within it.

  const stop = (el: DexAddGallery) => $$(el, '.tile').findIndex((t) => t.getAttribute('tabindex') === '0');
  const focused = (el: DexAddGallery) => $$(el, '.tile').indexOf(el.shadowRoot!.activeElement as HTMLElement);
  const press = async (el: DexAddGallery, key: string) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
    (el.shadowRoot!.activeElement as HTMLElement).dispatchEvent(ev);
    await el.updateComplete;
    return ev;
  };

  it('is one tab stop, not twenty-eight', async () => {
    const el = await gallery();
    const tiles = $$(el, '.tile');
    expect(tiles.filter((t) => t.getAttribute('tabindex') === '0').length).toBe(1);
    expect(tiles.filter((t) => t.getAttribute('tabindex') === '-1').length).toBe(tiles.length - 1);
    expect(stop(el)).toBe(0);
  });

  it('steps sideways with the arrows, and the stop follows the focus', async () => {
    const el = await gallery();
    await press(el, 'ArrowRight');
    expect(focused(el)).toBe(1);
    expect(stop(el)).toBe(1);
    await press(el, 'ArrowLeft');
    expect(focused(el)).toBe(0);
    expect(stop(el)).toBe(0);
  });

  // The step is along the flat list, so it runs off the end of one category into the start of
  // the next rather than stopping at a heading.
  it('steps across a category boundary, because the list is flat', async () => {
    const el = await gallery();
    const first = ADD_CATALOG[0].tiles.length;
    for (let i = 0; i < first; i++) await press(el, 'ArrowRight');
    expect(focused(el)).toBe(first);
    expect($$(el, '.tile')[first].dataset.className).toBe(ADD_CATALOG[1].tiles[0].className);
  });

  // Clamped, not wrapped: Right at the last tile landing back on the first would lose the user's
  // place in a list six headings long.
  it('stops at both ends rather than wrapping round', async () => {
    const el = await gallery();
    await press(el, 'ArrowLeft');
    expect(focused(el)).toBe(0);
    await press(el, 'End');
    const last = $$(el, '.tile').length - 1;
    expect(focused(el)).toBe(last);
    await press(el, 'ArrowRight');
    expect(focused(el)).toBe(last);
    await press(el, 'Home');
    expect(focused(el)).toBe(0);
  });

  // Home is the top of the CATALOG, not just its first tile: focusing a tile scrolls it no further
  // than it has to, which leaves the "Parameters" heading above it out of sight. happy-dom lays
  // nothing out, so the scroll offset is set by hand.
  it('takes Home to the top of the list, not just to the first tile', async () => {
    const el = await gallery();
    await press(el, 'End');
    el.scrollTop = 120;
    await press(el, 'Home');
    expect(focused(el)).toBe(0);
    expect(el.scrollTop).toBe(0);
  });

  // Up and Down are measured off the boxes the grid drew (addGalleryGrid.test.ts gives the tiles
  // boxes). With none at all, the answer is "no row that way": focus unmoved, nothing thrown.
  it('answers up and down without a layout engine by not moving', async () => {
    const el = await gallery();
    await press(el, 'ArrowDown');
    expect(focused(el)).toBe(0);
    await press(el, 'ArrowUp');
    expect(focused(el)).toBe(0);
  });

  it('keeps the arrows to itself, so the table behind does not move its selection', async () => {
    const el = await gallery();
    const ev = await press(el, 'ArrowRight');
    expect(ev.defaultPrevented).toBe(true);
    expect(ev.cancelBubble).toBe(true);
  });

  it('leaves a key pressed on the pin to the pin', async () => {
    const el = await gallery();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true });
    $(el, '.gallery-pin input').dispatchEvent(ev);
    await el.updateComplete;
    expect(ev.defaultPrevented).toBe(false);
    expect(focused(el)).toBe(0);
    expect(stop(el)).toBe(0);
  });

  // A click, or a Shift+Tab back in from the pin, moves the focus without an arrow key. If the
  // stop did not follow, Tab would leave from one tile while the arrows carried on from another.
  it('moves the stop to a tile that was focused some other way', async () => {
    const el = await gallery();
    $$(el, '.tile')[5].focus();
    await el.updateComplete;
    expect(stop(el)).toBe(5);
    await press(el, 'ArrowRight');
    expect(focused(el)).toBe(6);
  });
});

describe('the table and the gallery together', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  async function table(canAdd = true): Promise<DexTreeTable> {
    const el = document.createElement('dex-tree-table') as DexTreeTable;
    el.canAdd = canAdd;
    el.columns = ['Name', 'Value'];
    el.rows = [{ ID: 'a', parent: null, Name: { label: 'gain' }, Value: '5' } as TreeTableRow];
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const button = (el: DexTreeTable) => el.shadowRoot!.querySelector('.add-button') as HTMLElement | null;
  const popover = (el: DexTreeTable) => el.shadowRoot!.querySelector('dex-add-gallery') as DexAddGallery | null;

  async function open(el: DexTreeTable): Promise<DexAddGallery> {
    button(el)!.click();
    await el.updateComplete;
    const g = popover(el)!;
    await g.updateComplete;
    return g;
  }

  async function pin(el: DexTreeTable, g: DexAddGallery): Promise<void> {
    const box = $(g, '.gallery-pin input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
  }

  it('shows no button at all on a read-only view', async () => {
    const el = await table(false);
    expect(button(el)).toBeNull();
  });

  // The button used to read `⊞ Add`, and at 12px that glyph is a small crossed square, close
  // enough to the MATLAB-variable row icon a few pixels below it to be mistaken for one. A drawn
  // plus stroked in currentColor instead.
  it('draws a plus rather than a box glyph', async () => {
    const el = await table();
    const b = button(el)!;
    expect(b.querySelector('svg.add-glyph')).not.toBeNull();
    expect(b.textContent!.trim()).toBe('Add');
  });

  const cssOf = (tag: string) =>
    [(customElements.get(tag) as any).styles]
      .flat()
      .map((s: any) => s.cssText)
      .join('\n');
  const tableCss = () => cssOf('dex-tree-table');
  const galleryCss = () => cssOf('dex-add-gallery');

  // Whitespace inside a declaration is where the formatter chose to break a long line, not a fact
  // about the stylesheet: collapse it before matching anything longer than a line.
  const squash = (css: string) => css.replace(/\s+/g, ' ');

  // The declarations of one rule, by selector. Crude on purpose: the one question asked is WHICH
  // rule a declaration landed in. `position: relative` on the wrong box anchors nothing.
  const ruleIn = (css: string, selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, `no ${selector} rule`).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };
  const ruleBody = (selector: string) => ruleIn(tableCss(), selector);

  // Where the popover goes is a stylesheet fact, not a measurement: an absolutely positioned box
  // inside the search bar resolves its percentages against that bar on every layout, so "as wide
  // as the tab, inset, just below it" keeps being true through a resize with no listener and no
  // state. Two halves, both visible without a layout: the pair of rules, and the popover being
  // rendered INSIDE the bar. Either alone parks the gallery in the corner of the editor.
  it('anchors the gallery under the search bar in CSS, with nothing measured in script', async () => {
    const el = await table();
    const g = await open(el);

    // In the bar, so the bar is the box its percentages are against.
    expect(g.parentElement).toBe(el.shadowRoot!.querySelector('.filter-bar'));
    // And carrying no geometry of its own: an inline left/top/width written at open time is
    // correct exactly once.
    expect(g.getAttribute('style')).toBeNull();

    // The bar is the containing block, and deliberately not a stacking context, or the
    // gallery's 1001 would sort inside the bar instead of over the table.
    const bar = ruleBody('.filter-bar');
    expect(bar).toContain('position: relative');
    expect(bar).not.toContain('z-index:');

    const gallery = ruleBody('dex-add-gallery');
    expect(gallery).toContain('position: absolute');
    // Just under the bar: its padding box ends at 100%, then 1px of bottom border, then air.
    expect(gallery).toContain('top: calc(100% + 3px)');
    expect(gallery).toContain('left: 0');
    expect(gallery).toContain('right: 0');
    // Left-aligned at the inset, with the right margin taking whatever the width cap left over.
    // `auto` on both sides centred the popover, which only looked right while it grew with the
    // tab. The min() is the width's give-way: half the slack when there is less than an inset.
    expect(squash(gallery)).toContain('margin-inline: min( var(--dex-add-gallery-inset,');
    expect(squash(gallery)).toContain(') auto;');
    expect(gallery).not.toContain('margin-inline: auto');
    expect(gallery).toContain('z-index: 1001');
  });

  // The popover's side borders line up with the Add button's left border and the Columns
  // button's right border. Those are the bar's first and last items, so the line they stand on is
  // the bar's own horizontal padding, and the same token in both rules is the guarantee.
  it('insets the popover by the bar’s own padding, so its edges meet the buttons', () => {
    expect(ruleBody('.filter-bar')).toContain('padding: 4px var(--dex-add-gallery-inset,');
    expect(squash(ruleBody('dex-add-gallery'))).toContain('min( var(--dex-add-gallery-inset,');
  });

  // The ROOM the popover is allowed: the tab, less a margin down each side, but never below two
  // tile columns. One clamp, matched WHOLE, because the doubling is the part that used to be TS
  // (`${2 * ADD_GALLERY_INSET}px`, a multiplication done by the bundler); `* 2` inside calc() is
  // the stylesheet doing it. The arithmetic is evaluated here, against the shipped numbers, since
  // happy-dom resolves no percentage.
  it('takes the tab’s width less a margin down each side, and spends the margin first', () => {
    const INSET = px('--dex-add-gallery-inset');
    const FLOOR = px('--dex-add-gallery-min-width');
    const decl = squash(ruleBody('dex-add-gallery'));
    expect(decl, 'the width is not a clamp of the two tokens').toContain(
      `--dex-add-gallery-width: clamp( min(var(--dex-add-gallery-min-width, ${FLOOR}px), 100%), ` +
        `calc(100% - var(--dex-add-gallery-inset, ${INSET}px) * 2), 100% );`,
    );
    const [floor, bothInsets] = [FLOOR, 2 * INSET];

    // clamp(MIN, VAL, MAX) is max(MIN, min(VAL, MAX)); the leftover is halved by margin-inline.
    const box = (tab: number) => {
      const width = Math.max(Math.min(floor, tab), Math.min(tab - bothInsets, tab));
      return [width, (tab - width) / 2];
    };

    // A margin each side, so it floats over the table instead of meeting its edges.
    expect(box(1200)).toEqual([1184, 8]);
    expect(box(600)).toEqual([584, 8]);
    expect(box(400)).toEqual([384, 8]);

    // The margin is the part that gives way: between the floor and the floor plus both insets,
    // the margin takes the growth so the gallery stays at two full columns.
    expect(box(316)).toEqual([300, 8]);
    expect(box(310)).toEqual([300, 5]);
    expect(box(300)).toEqual([300, 0]);

    // Narrower than the floor, the floor gives way too, rather than the popover hanging out over
    // the edge of the tab: the lower bound is capped at the tab's own width.
    expect(box(200)).toEqual([200, 0]);
  });

  it('shows the button on an editable view and toggles the popover with it', async () => {
    const el = await table();
    expect(button(el)!.getAttribute('aria-expanded')).toBe('false');
    await open(el);
    expect(button(el)!.getAttribute('aria-expanded')).toBe('true');
    button(el)!.click();
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  // Fixed-size tiles that WRAP: the gallery flexes, the tile does not. The regression is one word
  // long and looks like a tidy-up: an `auto-fill` grid with a `1fr`, or a `flex: 1`, draws a
  // gallery right at one width and stretches the tiles at every other.
  it('sizes every tile from one token and wraps the row instead of stretching them', async () => {
    const cssText = galleryCss();

    // A wrapping flex row, and not a grid whose tracks would share out the remainder.
    expect(cssText).toContain('flex-wrap: wrap');
    expect(cssText).not.toContain('grid-template-columns:');

    // Rigid in both directions: `0 0` is the claim. A tile that may grow fills its row, and one
    // that may shrink narrows as its row fills, and either puts the badge back on the icon.
    expect(cssText).toMatch(/flex:\s*0 0 var\(--dex-add-gallery-tile-width, \d+px\)/);

    // One number, declared once, so there is a single place to re-measure if the badge grows.
    const declarations = [...cssText.matchAll(/--dex-add-gallery-tile-width:\s*(\d+)px/g)];
    expect(declarations.length, 'the tile width is declared more than once').toBe(1);

    // A fence around it, because it is an answer and not a preference: the badge is right-anchored
    // 3px in and the icon centred, so the room between them is `width / 2 - 15 - badge`, and the
    // widest badge (`Arch`) inks 30. Below 92 the badge lands on the icon; past 100 the tile is on
    // its way back to the mostly-empty box that was objected to twice.
    const width = Number(declarations[0][1]);
    expect(width, 'a tile this narrow puts the badge on the icon').toBeGreaterThanOrEqual(92);
    expect(width, 'a tile this wide is mostly empty again').toBeLessThanOrEqual(100);
    const bases = [...cssText.matchAll(/flex:\s*0 0 var\(--dex-add-gallery-tile-width, (\d+)px\)/g)];
    expect(bases.length).toBeGreaterThan(0);
    // And every read falls back to that same number, or a page whose :host rule was dropped lays
    // out tiles of a width nobody measured.
    for (const use of bases) expect(use[1]).toBe(declarations[0][1]);
  });

  // "If the tab width is larger, the gallery should not follow, just show enough width to show
  // all buttons in one row." `max-content` rather than a number: the widest child is a `.tiles`
  // row, whose max-content is all its tiles on one line, so the cap IS "the biggest category in
  // one row" and a category that gains a tile widens it with nothing to update.
  it('stops growing at the width the widest category needs', () => {
    expect(galleryCss()).toContain('max-width: max-content');
    // Not a second width rule: the room still comes from the table's var, and this only caps it.
    expect(galleryCss()).toContain('width: var(--dex-add-gallery-width');
  });

  // Glass: which box carries the surface, which carries the header and the sheen, that nothing
  // translucent is painted on a tile, and that forced colors gets none of it. That mode exists to
  // remove exactly this, and a blur is not a colour, so it survives the background substitution
  // unless it is turned off by hand. The tint the alpha is applied to is the theme's.
  it('draws the panel as glass, and drops it entirely under forced colors', () => {
    const css = galleryCss();
    // By rule, not by substring: what is asked is which box each paint landed on.
    const rule = (selector: string) => ruleIn(css, selector);

    // The surface and the sticky header both, or the header reads as an opaque strip across the
    // top of a glass panel; each from its own token, with an OPAQUE fallback for a page whose
    // theme sheet never loaded.
    expect(rule(':host')).toContain('background: var(--dex-add-gallery-bg, var(--dex-bg-primary');
    expect(rule('.gallery-header')).toContain('background: var(--dex-add-gallery-header-bg, var(--dex-bg-primary');
    // 12px, not the context menu's 20: this panel covers ~600px of rows, and at 20px their
    // banding averages into a flat wash that reads as opaque.
    expect(css).toContain('backdrop-filter: blur(12px) saturate(180%)');
    // The prefixed copy too, as the context menu ships it.
    expect(css).toContain('-webkit-backdrop-filter: blur(12px) saturate(180%)');

    // The sheen is a lit top EDGE, so it goes on the sticky bar, which is the panel's visual top
    // at every scroll position.
    expect(rule('.gallery-header')).toMatch(/background-image:\s*linear-gradient\(\s*to bottom,\s*rgba\(255, 255, 255, 0\.12\)/);

    // A tile is OPAQUE, painted the colour the sheet is made of: the tint with the transparency
    // taken out, so there is no second number to keep in step (and no --dex-add-gallery-tile-bg).
    const tileBackground = /background:([^;]*);/.exec(rule('.tile'))?.[1] ?? '';
    expect(tileBackground).toContain('var(--dex-add-gallery-tint');
    expect(tileBackground, 'a tile must not be translucent').not.toContain('transparent');
    expect(css).not.toContain('--dex-add-gallery-tile-bg');
    expect(rule('.tile:hover')).toContain('background: var(--dex-bg-hover');

    // In forced colors a tile goes back to Canvas rather than keeping the tint or taking the
    // ButtonFace a <button> is forced to: its label is `color: inherit`, and CanvasText on
    // ButtonFace is not a pairing the system palette guarantees.
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    expect(forced).toMatch(/\.tile\s*\{\s*background: Canvas !important;/);
    // And the whole effect comes off: an opaque Canvas AND no blur.
    expect(forced).toContain('background: Canvas !important');
    expect(forced).toContain('backdrop-filter: none !important');
    expect(forced).toContain('-webkit-backdrop-filter: none !important');
  });

  // While its popover shows, the button that opened it is drawn held down, so it is clear that
  // clicking it again closes what is on screen. Keyed off aria-expanded, for BOTH bar buttons, since
  // Add and Columns are one kind of control. The border carries the state where the surface is
  // faint; how a host maps --dex-border-color-active onto its theme is the host's.
  it('draws a bar button held down while its popover shows, keyed off aria-expanded', async () => {
    const el = await table();
    const cssText = tableCss();
    expect(cssText).toContain(".add-button[aria-expanded='true']");
    expect(cssText).toContain(".columns-button[aria-expanded='true']");
    const pressed = /\.add-button\[aria-expanded='true'\]\s*\{([^}]*)\}/.exec(cssText);
    expect(pressed, 'no pressed rule').not.toBeNull();
    expect(pressed![1]).toMatch(/border-color:\s*var\(--dex-border-color-active\b/);

    // And the attribute is a live answer on both, not decoration on one.
    const columns = el.shadowRoot!.querySelector('.columns-button') as HTMLElement;
    expect(columns.getAttribute('aria-expanded')).toBe('false');
    columns.click();
    await el.updateComplete;
    expect(columns.getAttribute('aria-expanded')).toBe('true');
    expect(button(el)!.getAttribute('aria-expanded')).toBe('false');
  });

  // An app's keyboard way in. A method rather than a synthetic click, so the app does not have to
  // find a button in a shadow root, and a TOGGLE, so the accelerator behaves exactly as the button.
  it('opens and closes from toggleAddGallery, and does nothing where nothing can be added', async () => {
    const el = await table();
    el.toggleAddGallery();
    await el.updateComplete;
    expect(popover(el)).not.toBeNull();
    expect(button(el)!.getAttribute('aria-expanded')).toBe('true');
    el.toggleAddGallery();
    await el.updateComplete;
    expect(popover(el)).toBeNull();

    // A table that cannot add has no button to anchor to and nothing to add, whoever asks.
    const readOnly = await table(false);
    readOnly.toggleAddGallery();
    await readOnly.updateComplete;
    expect(popover(readOnly)).toBeNull();
  });

  it('relays a tile as one outward request per click', async () => {
    const el = await table();
    const seen: unknown[] = [];
    el.addEventListener('dex-add-entry', (e) => seen.push((e as CustomEvent).detail));
    // The gallery's own event is composed, so a listener outside the table would see both names
    // for one click if the table did not keep the inner one.
    el.addEventListener('dex-add-tile', () => seen.push('leaked'));
    const g = await open(el);
    $$(g, '.tile')
      .find((t) => t.dataset.className === 'Simulink.Signal')!
      .click();
    // `rename` rides along with the class and the section: it is a fact about THIS gesture, and
    // by the time the entry exists the pin may have been toggled.
    expect(seen).toEqual([{ className: 'Simulink.Signal', section: 'design', label: 'Simulink Signal', rename: true }]);
  });

  it('asks for no rename during a pinned run, so a batch is not interrupted', async () => {
    const el = await table();
    const g = await open(el);
    await pin(el, g);
    const seen: unknown[] = [];
    el.addEventListener('dex-add-entry', (e) => seen.push((e as CustomEvent).detail));
    $$(g, '.tile')
      .find((t) => t.dataset.className === 'Simulink.Signal')!
      .click();
    expect(seen).toEqual([{ className: 'Simulink.Signal', section: 'design', label: 'Simulink Signal', rename: false }]);
  });

  it('closes after an unpinned add, because naming the new row comes next', async () => {
    const el = await table();
    const g = await open(el);
    $(g, '.tile').click();
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  it('stays open for a pinned run, and keeps the pin for the next open', async () => {
    const el = await table();
    const g = await open(el);
    await pin(el, g);

    const adds: unknown[] = [];
    el.addEventListener('dex-add-entry', (e) => adds.push((e as CustomEvent).detail));
    $$(g, '.tile')[0].click();
    $$(g, '.tile')[1].click();
    await el.updateComplete;
    expect(popover(el)).not.toBeNull();
    expect(adds.length).toBe(2);

    // Closed and reopened, the pin is still set: it describes the user's intent for the next few
    // minutes, not for one popover.
    button(el)!.click();
    await el.updateComplete;
    expect(popover(el)).toBeNull();
    const again = await open(el);
    expect(again.pinned).toBe(true);
  });

  it('dismisses on a click outside, and not on one inside', async () => {
    const el = await table();
    const g = await open(el);
    // Inside, but not on a tile: the popover's own title, which does nothing. A click on a tile
    // would close an unpinned popover for the other reason. composedPath is what carries the
    // gallery, since the title is in its shadow root.
    $(g, '.gallery-title').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(popover(el)).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  it('dismisses when the window loses focus, pinned or not', async () => {
    const el = await table();
    const g = await open(el);
    await pin(el, g);
    window.dispatchEvent(new Event('blur'));
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  it('dismisses on the popover’s Escape', async () => {
    const el = await table();
    const g = await open(el);
    $(g, '.tile').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });
});
