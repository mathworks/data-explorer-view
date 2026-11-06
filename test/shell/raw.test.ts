// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Raw view, connected: it shows what the active document's file holds for the selected row
// (the file itself with no row selected), follows the selection, the active tab and the document's
// changes, shows nothing at Root, asks nothing while hidden, and copies through the host.
import { describe, expect, it } from 'vitest';
import type { RawView } from '../../src/model/raw/rawView.js';
import { docTabs, edit, open, rawViewer, rowOf, selectRow, settled, startPage, tabIdOf, until } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };
const textOfRaw = (raw: RawView | null) => (raw && 'text' in raw ? raw.text : '');

describe('the Raw view', () => {
  it('shows the selected row as the file holds it, and follows the selection and its edits', async () => {
    const page = startPage(FILES);
    page.command('show-raw');
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => rawViewer().raw?.format === 'json' && textOfRaw(rawViewer().raw).includes('Kp'));
    const kp = textOfRaw(rawViewer().raw);
    await selectRow('params.sldd', 'Ki');
    await until(() => textOfRaw(rawViewer().raw).includes('Ki') && textOfRaw(rawViewer().raw) !== kp);
    await edit('params.sldd', 'Ki', '42');
    await until(() => textOfRaw(rawViewer().raw).includes('42'));
  });

  it("shows the file's own summary with no row selected, another file's for its tab, and nothing at Root", async () => {
    const page = startPage(FILES);
    page.command('show-raw');
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => !!rawViewer().raw && rawViewer().raw!.format !== 'none');
    const mat = rawViewer().raw;
    docTabs().dispatchEvent(new CustomEvent('dex-tab-select', { detail: { id: tabIdOf('params.sldd') }, bubbles: true, composed: true }));
    await until(() => rawViewer().raw !== mat && !!rawViewer().raw);
    document.querySelector('dex-explorer')!.dispatchEvent(new CustomEvent('dex-explorer-open', { detail: { fileId: null, pin: false }, bubbles: true, composed: true }));
    await until(() => rawViewer().raw === null);
  });

  it('asks nothing while its view is hidden, and fills once it is shown', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await settled();
    expect(rawViewer().raw).toBeNull();
    page.command('show-raw');
    await until(() => textOfRaw(rawViewer().raw).includes('Kp'));
  });

  it("copies through the host's clipboard", async () => {
    const page = startPage(FILES);
    page.command('show-raw');
    await open(page, 'params.sldd');
    await rowOf('params.sldd', 'Kp');
    rawViewer().dispatchEvent(new CustomEvent('dex-raw-copy', { detail: { text: '{"Kp": 1}' }, bubbles: true, composed: true }));
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual(['{"Kp": 1}']);
  });
});
