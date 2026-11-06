// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Add gallery as a palette that is always open, not a popover: `pinnable` false, which the
// app shell's Gallery panel draws it with in a sidebar. Everything that makes it a popover goes,
// and nothing that makes it a gallery does:
//
//   - no header, so no Keep open box: the panel is open for as long as it is shown, and a pin
//     there would promise something it cannot change;
//   - no focus taken on the first draw: a sidebar is drawn while the user works in the table,
//     and a popover's "focus the first tile so it is usable from the keyboard" would take the
//     keyboard away from them;
//   - Escape is the page's: there is nothing to close, so the key is neither sent on as
//     `dex-add-closed` nor stopped;
//   - a group, not a dialog, to a screen reader.
//
// The tiles, their events and the arrow keys are the same gallery's, and the default stays the
// table's popover: addGalleryWidget.test.ts holds that side, and the first case here says so.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexAddGallery, defineAddGallery, type AddTileDetail } from '../src/widgets/tree-table/dex-add-gallery.js';
import { allTiles } from '../src/model/ids/addCatalog.js';

defineAddGallery();

const $ = (el: Element, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
const $$ = (el: Element, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];

async function gallery(pinnable?: boolean): Promise<DexAddGallery> {
  const el = document.createElement('dex-add-gallery');
  if (pinnable !== undefined) el.pinnable = pinnable;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const escape = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });

describe('dex-add-gallery pinnable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is the popover by default: its header and Keep open box, a dialog, the first tile focused', async () => {
    const el = await gallery();
    expect(el.pinnable).toBe(true);
    expect($(el, '.gallery-header')).not.toBeNull();
    expect($(el, '.gallery-pin input')).not.toBeNull();
    expect($(el, '[role="dialog"]')).not.toBeNull();
    expect(el.shadowRoot!.activeElement).toBe($$(el, '.tile')[0]);
  });

  it('has an attribute, as every boolean setting does', () => {
    expect((DexAddGallery as unknown as { observedAttributes: string[] }).observedAttributes).toContain('pinnable');
  });

  it('draws no header and no Keep open box when it cannot be pinned', async () => {
    const el = await gallery(false);
    expect($(el, '.gallery-header')).toBeNull();
    expect($(el, 'input[type="checkbox"]')).toBeNull();
    // The gallery itself is all there.
    expect($$(el, '.tile').map((t) => t.dataset.className)).toEqual(allTiles().map((t) => t.className));
  });

  it('takes no focus when it first draws', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await gallery(false);
    expect(el.shadowRoot!.activeElement).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it('is a group, not a dialog, under the same name', async () => {
    const el = await gallery(false);
    expect($(el, '[role="dialog"]')).toBeNull();
    expect($(el, '[role="group"][aria-label="Add an entry"]')).not.toBeNull();
  });

  it('leaves Escape to the page: no request to close, and the key goes on', async () => {
    const el = await gallery(false);
    const closed: unknown[] = [];
    el.addEventListener('dex-add-closed', (e) => closed.push(e));
    let heard = false;
    document.body.addEventListener('keydown', () => (heard = true), { once: true });
    const tile = $$(el, '.tile')[0]!;
    tile.focus();
    const ev = escape();
    tile.dispatchEvent(ev);
    expect(closed).toEqual([]);
    expect(heard).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('still adds, and still steps between tiles with the arrows', async () => {
    const el = await gallery(false);
    const seen: AddTileDetail[] = [];
    el.addEventListener('dex-add-tile', (e) => seen.push(e.detail));
    const tiles = $$(el, '.tile');
    tiles[1]!.click();
    expect(seen).toEqual([{ className: tiles[1]!.dataset.className, section: tiles[1]!.dataset.section, label: allTiles()[1]!.label }]);
    tiles[0]!.focus();
    tiles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true }));
    expect(el.shadowRoot!.activeElement).toBe(tiles[1]);
  });

  it('draws the header again when it becomes pinnable', async () => {
    const el = await gallery(false);
    el.pinnable = true;
    await el.updateComplete;
    expect($(el, '.gallery-pin input')).not.toBeNull();
    expect($(el, '[role="dialog"]')).not.toBeNull();
  });
});
