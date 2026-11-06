// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Gallery view, connected: the Add gallery's tiles for the active file, the classes and
// sections its table's view offers (a dictionary's every tile, a MAT-file's or a model's own
// classes, a model's configuration sets beside them), headed with the file's name; greyed with no
// file, or one the page does not edit. A tile adds one entry to the active file, as the table's
// `+ Add` does, its Name open for a rename; a cell editor still open is committed first.
import { describe, expect, it } from 'vitest';
import { dirtyTabs, galleryPanel, open, rowOf, startPage, tableOf, until } from './harness.js';

const FILES = {
  'params.sldd': 'params.sldd',
  'ParamMat.mat': 'ParamMat.mat',
  'slxcases.slx': 'slxcases.slx',
  'legacy_ctrl.mdl': 'legacy_ctrl.mdl',
  'viewing_only.mat': 'viewing_only.mat',
};
const add = (className: string, section: string) =>
  galleryPanel().dispatchEvent(new CustomEvent('dex-gallery-add', { detail: { className, section, label: className }, bubbles: true, composed: true }));
const names = (file: string) => tableOf(file)!.rows.map((r) => r.Name?.label);

describe('the Gallery view', () => {
  it('is greyed with no file open', async () => {
    startPage(FILES);
    await until(() => galleryPanel().disabled);
    expect(galleryPanel().target).toBe('');
  });

  it("offers the active file's tiles, headed with its name, and follows the active tab", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(() => galleryPanel().target === 'params.sldd' && !galleryPanel().disabled);
    expect([galleryPanel().classes, galleryPanel().sections]).toEqual([null, null]);
    await open(page, 'ParamMat.mat');
    await until(() => galleryPanel().target === 'ParamMat.mat' && Array.isArray(galleryPanel().classes));
    expect(galleryPanel().classes!.length).toBeGreaterThan(0);
    await open(page, 'slxcases.slx');
    await until(() => galleryPanel().target === 'slxcases.slx' && !!galleryPanel().sections);
    expect(galleryPanel().sections).toEqual(['config']);
  });

  it('is greyed for a file the page does not edit', async () => {
    const page = startPage(FILES);
    await open(page, 'legacy_ctrl.mdl');
    await until(() => galleryPanel().target === 'legacy_ctrl.mdl' && galleryPanel().disabled);
    await open(page, 'viewing_only.mat');
    await until(() => galleryPanel().target === 'viewing_only.mat' && galleryPanel().disabled);
  });

  it('adds an entry of a tile to the active file, its Name open for a rename', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(() => !galleryPanel().disabled);
    const before = names('params.sldd').length;
    add('Simulink.Parameter', 'design');
    await until(() => names('params.sldd').length > before);
    await until(() => dirtyTabs().includes('params.sldd'));
    await until(() => !!tableOf('params.sldd')!.shadowRoot!.querySelector('.edit-input'));
  });

  it('commits a cell editor still open before it adds', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(() => !galleryPanel().disabled);
    const table = tableOf('params.sldd')!;
    const design = () => table.rows.filter((r) => r.parent === 'section:design').length;
    const before = design();
    expect(table.beginRename((await rowOf('params.sldd', 'Kp')).ID)).toBe(true);
    await table.updateComplete;
    table.shadowRoot!.querySelector<HTMLInputElement>('.edit-input')!.value = 'Kd';
    add('Simulink.Parameter', 'design');
    await until(() => names('params.sldd').includes('Kd') && design() === before + 1);
    expect(names('params.sldd')).not.toContain('Kp');
  });
});
