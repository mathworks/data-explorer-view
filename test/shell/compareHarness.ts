// Copyright 2026 The MathWorks, Inc.
//
// What the compare tab's shell tests share: two versions of params.sldd open (a the fixture, b with
// Kp 1 → 5, Uo deleted and a new Simulink.Parameter, Param), Compare With… run through the palette
// as the user runs it, and the compare view's parts as a test reads them.
import { derive, fixtureBytes, rowNamed, settle } from '../compare/derive.js';
import type { DexCompareView } from '../../src/widgets/app-shell/dex-compare-view.js';
import type { DexPropertyInspector } from '../../src/widgets/property-inspector/dex-property-inspector.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import { activeTab, at, logPanel, open, palette, startPage, until, type Page } from './harness.js';

export const PAIR = 'params.sldd ↔ params.sldd';

/** b: params.sldd with Kp 1 → 5, Uo deleted, and a new Simulink.Parameter (Param) in Design Data. */
export const editedParams = (): Promise<Uint8Array> =>
  derive(fixtureBytes('params.sldd', true), 'params.sldd', async (table, rows) => {
    await table.edit({ rowId: rowNamed(rows, 'Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle();
    table.delete([rowNamed(rows, 'Uo').ID]);
    await settle();
    table.addEntry({ section: 'design', className: 'Simulink.Parameter', rename: false });
  });

/** A page with a and b open, a the active tab. */
export async function twoFiles(extra: Record<string, string> = {}): Promise<Page> {
  const page = startPage({ 'a/params.sldd': 'params.sldd', ...extra });
  page.main.files.set(at('b/params.sldd'), await editedParams());
  await open(page, 'b/params.sldd', 'a/params.sldd');
  return page;
}

export const view = (): DexCompareView => document.querySelector('dex-compare-view') as DexCompareView;
export const tables = (): DexTreeTable[] => [...(view()?.shadowRoot?.querySelectorAll('dex-tree-table') ?? [])] as DexTreeTable[];
export const header = (): string => view()?.shadowRoot?.querySelector('[role="status"]')?.textContent?.trim() ?? '';
export const captions = (): string[] => [...(view()?.shadowRoot?.querySelectorAll('.caption .name') ?? [])].map((n) => n.textContent ?? '');
export const paletteRows = (): { label: string; category: string; disabled: boolean }[] =>
  [...(palette().shadowRoot?.querySelectorAll('.option') ?? [])].map((o) => ({
    label: o.querySelector('.label')?.textContent ?? '',
    category: o.querySelector('.category')?.textContent ?? '',
    disabled: o.classList.contains('disabled'),
  }));
export const clickRow = async (label: string): Promise<void> => {
  await until(() => paletteRows().some((r) => r.label === label));
  const row = [...palette().shadowRoot!.querySelectorAll<HTMLElement>('.option')].find((o) => o.querySelector('.label')?.textContent === label)!;
  row.click();
};
export const placeholder = (): string => palette().shadowRoot?.querySelector('input')?.getAttribute('placeholder') ?? '';
export const logLines = (): string[] => [...(logPanel().shadowRoot?.querySelectorAll('.line .message') ?? [])].map((m) => m.textContent ?? '');
/** The line of the entry `label` in the compare's rows (the left side's, or the right's for a line only it has). */
export const lineOf = (label: string): string => {
  const [left, right] = tables();
  const row = left!.rows.find((r) => r.Name.label === label) ?? right!.rows.find((r) => r.Name.label === label);
  return row!.ID;
};
export const inspector = (): DexPropertyInspector => document.querySelector('dex-property-inspector') as DexPropertyInspector;
export const f7 = (shift = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: 'F7', shiftKey: shift, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

/** Select the tab of the file at `path` (two tabs read params.sldd: told apart by their paths), as a click does. */
export async function selectPath(path: string): Promise<void> {
  const tab = (): HTMLElement | undefined =>
    [...document.querySelectorAll('dex-doc-tabs')[0]!.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.getAttribute('title') === path);
  await until(() => !!tab());
  tab()!.click();
  await until(() => activeTab()?.getAttribute('title') === path);
}

/** Compare the active tab's file with the open file `name` (by its path), through the palette as the user would. */
export async function compareWith(page: Page, category: string): Promise<void> {
  page.command('compare-with');
  await until(() => palette().open && paletteRows().length > 0);
  const row = [...palette().shadowRoot!.querySelectorAll<HTMLElement>('.option')].find((o) => o.querySelector('.category')?.textContent === category)!;
  row.click();
  await until(() => !!view() && header() !== '' && !!activeTab()?.textContent?.includes('↔'));
}

