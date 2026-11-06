// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// addChoicesOf (src/model/shell/commands.ts): what the command window's `add` chooses among, which
// must be what the Add gallery offers for the same table, tile for tile, and the section each
// tile's `dex-add-tile` sends. The two are computed apart (the gallery decides in its template and
// its click handler; the model cannot load a widget), so this holds one to the other: a real view
// of a dictionary, a MAT-file and a model, the gallery drawn for it as the table's editing wire
// gives it its classes and sections, and every tile clicked.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addChoicesOf, type AddChoice } from '../src/model/shell/commands.js';
import { createWorkspace, type TableView } from '../src/model/index.js';
import { defineAddGallery, type DexAddGallery } from '../src/widgets/tree-table/index.js';

defineAddGallery();

async function viewOf(path: string): Promise<TableView> {
  const ws = createWorkspace({ editing: true });
  try {
    const doc = await ws.open(readFileSync(path), path.split('/').pop()!);
    return await doc.table.open();
  } finally {
    ws.dispose();
  }
}

/** Every tile of the gallery drawn for `view`, clicked in order: what each one's dex-add-tile said. */
async function galleryOffer(view: TableView): Promise<AddChoice[]> {
  const el = document.createElement('dex-add-gallery') as DexAddGallery;
  // As editingWire hands them to the table, and the table to its gallery.
  el.classes = view.add && Array.isArray(view.add.classes) ? view.add.classes : null;
  el.sections = el.classes && Array.isArray(view.addSections) ? view.addSections : null;
  document.body.append(el);
  await el.updateComplete;
  const sent: AddChoice[] = [];
  el.addEventListener('dex-add-tile', (e) => sent.push({ ...e.detail }));
  for (const tile of el.shadowRoot!.querySelectorAll<HTMLElement>('.tile')) tile.click();
  el.remove();
  return sent;
}

describe('addChoicesOf offers what the Add gallery offers', () => {
  it.each([
    ['a dictionary', 'test/fixtures/params.sldd'],
    ['a MAT-file', 'test/fixtures/nd_numeric.mat'],
    ['a model, its workspace and its configuration sets', 'test/fixtures/mcos/mcosfix.slx'],
  ])('for %s', async (_kind, path) => {
    const view = await viewOf(path);
    const offer = await galleryOffer(view);
    // A parse that drew nothing would pass the comparison.
    expect(offer.length).toBeGreaterThan(3);
    expect(addChoicesOf(view)).toEqual(offer);
  });

  it('reads the views these cases mean to', async () => {
    expect((await viewOf('test/fixtures/params.sldd')).add).toBeUndefined();
    expect((await viewOf('test/fixtures/nd_numeric.mat')).add?.classes.length).toBeGreaterThan(0);
    const model = await viewOf('test/fixtures/mcos/mcosfix.slx');
    expect(model.add?.classes.length).toBeGreaterThan(0);
    expect(model.addSections).toEqual(['config']);
  });
});
