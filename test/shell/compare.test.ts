// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A compare tab in the shell: two open files compared entry by entry, line by line, in a tab of
// its own (<dex-compare-view> over the diff model). What it protects:
//  - it is opened as the user would: Compare With… on the active file, from the palette, which asks
//    which file (another open one, or one the host's picker gives), and opens a tab of the pair;
//  - it draws the two files' differences (the lines, their marks, the gaps, the header's counts),
//    keeps drawing them as either file changes or is saved, and shows only differences, or all;
//  - the inspector shows the selected line's differences;
//  - it is a tab like no other: both files stay open in their own tabs, closing one of them closes
//    the compare, and the Explorer, the status bar, the title and the palette treat it as what it is.
import { describe, expect, it } from 'vitest';
import { derive, fixtureBytes, rowNamed, settle } from '../compare/derive.js';
import type { DexCompareView } from '../../src/widgets/app-shell/dex-compare-view.js';
import type { DexPropertyInspector } from '../../src/widgets/property-inspector/dex-property-inspector.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import {
  activeTab,
  at,
  explorerRows,
  logPanel,
  open,
  palette,
  selectTab,
  settingsPanel,
  settled,
  startPage,
  tabNamed,
  tabNames,
  edit,
  until,
  type Page,
} from './harness.js';

const PAIR = 'params.sldd ↔ params.sldd';

/** b: params.sldd with Kp 1 → 5, Uo deleted, and a new Simulink.Parameter (Param) in Design Data. */
const editedParams = (): Promise<Uint8Array> =>
  derive(fixtureBytes('params.sldd', true), 'params.sldd', async (table, rows) => {
    await table.edit({ rowId: rowNamed(rows, 'Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle();
    table.delete([rowNamed(rows, 'Uo').ID]);
    await settle();
    table.addEntry({ section: 'design', className: 'Simulink.Parameter', rename: false });
  });

/** A page with a and b open, a the active tab. */
async function twoFiles(extra: Record<string, string> = {}): Promise<Page> {
  const page = startPage({ 'a/params.sldd': 'params.sldd', ...extra });
  page.main.files.set(at('b/params.sldd'), await editedParams());
  await open(page, 'b/params.sldd', 'a/params.sldd');
  return page;
}

const view = (): DexCompareView => document.querySelector('dex-compare-view') as DexCompareView;
const tables = (): DexTreeTable[] => [...(view()?.shadowRoot?.querySelectorAll('dex-tree-table') ?? [])] as DexTreeTable[];
const header = (): string => view()?.shadowRoot?.querySelector('[role="status"]')?.textContent?.trim() ?? '';
const captions = (): string[] => [...(view()?.shadowRoot?.querySelectorAll('.caption .name') ?? [])].map((n) => n.textContent ?? '');
const paletteRows = (): { label: string; category: string; disabled: boolean }[] =>
  [...(palette().shadowRoot?.querySelectorAll('.option') ?? [])].map((o) => ({
    label: o.querySelector('.label')?.textContent ?? '',
    category: o.querySelector('.category')?.textContent ?? '',
    disabled: o.classList.contains('disabled'),
  }));
const clickRow = async (label: string): Promise<void> => {
  await until(() => paletteRows().some((r) => r.label === label));
  const row = [...palette().shadowRoot!.querySelectorAll<HTMLElement>('.option')].find((o) => o.querySelector('.label')?.textContent === label)!;
  row.click();
};
const placeholder = (): string => palette().shadowRoot?.querySelector('input')?.getAttribute('placeholder') ?? '';
const logLines = (): string[] => [...(logPanel().shadowRoot?.querySelectorAll('.line .message') ?? [])].map((m) => m.textContent ?? '');
/** The line of the entry `label` in the compare's rows (the left side's, or the right's for a line only it has). */
const lineOf = (label: string): string => {
  const [left, right] = tables();
  const row = left!.rows.find((r) => r.Name.label === label) ?? right!.rows.find((r) => r.Name.label === label);
  return row!.ID;
};
const inspector = (): DexPropertyInspector => document.querySelector('dex-property-inspector') as DexPropertyInspector;

/** Select the tab of the file at `path` (two tabs read params.sldd: told apart by their paths), as a click does. */
async function selectPath(path: string): Promise<void> {
  const tab = (): HTMLElement | undefined =>
    [...document.querySelectorAll('dex-doc-tabs')[0]!.shadowRoot!.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.getAttribute('title') === path);
  await until(() => !!tab());
  tab()!.click();
  await until(() => activeTab()?.getAttribute('title') === path);
}

/** Compare the active tab's file with the open file `name` (by its path), through the palette as the user would. */
async function compareWith(page: Page, category: string): Promise<void> {
  page.command('compare-with');
  await until(() => palette().open && paletteRows().length > 0);
  const row = [...palette().shadowRoot!.querySelectorAll<HTMLElement>('.option')].find((o) => o.querySelector('.category')?.textContent === category)!;
  row.click();
  await until(() => !!view() && header() !== '' && !!activeTab()?.textContent?.includes('↔'));
}

describe('a compare tab', () => {
  it('opens from the palette, Compare With… asking which file', async () => {
    const page = await twoFiles();
    page.command('compare-with');
    await until(() => palette().open);
    expect(placeholder()).toBe('Compare params.sldd with…');
    expect(paletteRows().map((r) => r.label)).toEqual(['params.sldd', 'Browse…']);
    expect(paletteRows()[0]!.category).toBe(at('b/params.sldd'));
    await clickRow('params.sldd');
    await until(() => !!view() && header() !== '');
    expect(activeTab()?.textContent).toContain(PAIR);
    expect(captions()).toEqual(['params.sldd', 'params.sldd']);
    expect(header()).toBe('1 changed, 1 added, 1 removed');
    expect(tabNames().filter((n) => n === 'params.sldd')).toHaveLength(2);
    expect(document.querySelectorAll('dex-doc-tabs')[0]!.shadowRoot!.querySelectorAll('[role="tab"].preview')).toHaveLength(0);
    expect(logLines()).toContain('Comparing params.sldd with params.sldd');
  });

  it("draws the two files' lines side by side, a gap where one lacks an entry", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const [left, right] = tables();
    expect(left!.rows.map((r) => r.ID)).toEqual(right!.rows.map((r) => r.ID));
    const uo = lineOf('Uo');
    expect(left!.rows.find((r) => r.ID === uo)!.Name.label).toBe('Uo');
    expect(right!.rows.find((r) => r.ID === uo)!.Name.label).toBe('');
    expect(left!.diffMarks!.get(uo)).toEqual({ kind: 'removed' });
    expect(right!.diffMarks!.get(uo)).toEqual({ kind: 'gap' });
    const param = lineOf('Param');
    expect(left!.diffMarks!.get(param)).toEqual({ kind: 'gap' });
    expect(right!.diffMarks!.get(param)).toEqual({ kind: 'added' });
    const kp = lineOf('Kp');
    expect(left!.diffMarks!.get(kp)).toEqual({ kind: 'changed', columns: ['Value'] });
    expect(right!.diffMarks!.get(kp)).toEqual({ kind: 'changed', columns: ['Value'] });
    expect(left!.rows.some((r) => r.Name.label === 'Ki')).toBe(false);
  });

  it('shows every line, or only the differences, as the header says', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const box = view().shadowRoot!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    box.click();
    await until(() => tables()[0]!.rows.some((r) => r.Name.label === 'Ki'));
    const sections = tables()[0]!.rows.filter((r) => r.ID.startsWith('section:')).map((r) => r.Name.label);
    expect(sections).toEqual(expect.arrayContaining(['Architectural Data', 'Configurations', 'Other Data']));
    box.click();
    await until(() => !tables()[0]!.rows.some((r) => r.Name.label === 'Ki'));
    expect(tables()[0]!.rows.some((r) => r.Name.label === 'Configurations')).toBe(false);
  });


  it("shows the selected line's differences in the inspector", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    view().select([lineOf('Kp')]);
    tables()[0]!.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [lineOf('Kp')] }, bubbles: true, composed: true }));
    await until(() => inspector().groups.length > 0);
    expect(inspector().groups[0]!.title).toBe('Differences: params.sldd → params.sldd');
    expect(inspector().groups[0]!.properties.find((p) => p.name === 'Value')?.value).toBe('1 → 5');
    tables()[0]!.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [lineOf('Uo')] }, bubbles: true, composed: true }));
    await until(() => inspector().groups[0]?.title === 'Only in params.sldd');
    tables()[0]!.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [] }, bubbles: true, composed: true }));
    await until(() => inspector().groups.length === 0);
    expect(document.querySelector<HTMLElement>('.dex-inspector-empty')!.hidden).toBe(false);
  });

  it('draws again as either file changes, and as one is saved', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const compareTab = activeTab()!.textContent!;
    await edit('b/params.sldd', 'Ki', '9');
    await until(() => header() === '2 changed, 1 added, 1 removed');
    const dirty = () => view().shadowRoot!.querySelectorAll('.caption')[1]!.querySelector('.dirty');
    await until(() => !!dirty());
    // Saved from b's own tab.
    await selectPath(at('b/params.sldd'));
    page.command('save');
    await until(() => page.main.saves.length === 1);
    tabNamed(PAIR)!.click();
    await until(() => activeTab()?.textContent === compareTab);
    await until(() => !dirty());
  });

  it('closes with either file, and leaves both files open when it closes', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const closed = page.main.closedFiles.length;
    page.command('close-tab');
    await until(() => !tabNamed(PAIR));
    expect(tabNames().filter((n) => n === 'params.sldd')).toHaveLength(2);
    expect(page.main.closedFiles.length).toBe(closed);

    await selectPath(at('a/params.sldd'));
    await compareWith(page, at('b/params.sldd'));
    await selectPath(at('a/params.sldd'));
    page.command('close-tab');
    await until(() => !tabNamed(PAIR));
    expect(tabNames()).toEqual(['params.sldd']);
  });

  it("compares with a file the host's picker gives", async () => {
    const page = await twoFiles({ 'c/params.sldd': 'params.sldd' });
    page.main.picks = [[at('c/params.sldd')]];
    page.command('compare-with');
    await until(() => palette().open);
    await clickRow('Browse…');
    await until(() => !!view() && view().empty !== '');
    expect(view().empty).toBe('No differences');
    expect(tabNames().filter((n) => n === 'params.sldd')).toHaveLength(3);
    expect(activeTab()?.textContent).toContain(PAIR);
  });

  it('is a comparison, not a file, to the rest of the shell', async () => {
    const page = await twoFiles({ 'bad.sldd': 'README.md' });
    // A file core cannot read: its table says why, and has no rows.
    void page.handle.openPaths([at('bad.sldd')]);
    await until(() => !!document.querySelector<DexTreeTable>(`.doc-panel[data-path="${at('bad.sldd')}"] dex-tree-table`)?.banners?.error);
    await selectPath(at('a/params.sldd'));
    page.command('compare-with');
    await until(() => palette().open);
    // The file core could not read is no choice.
    expect(paletteRows().map((r) => r.label)).toEqual(['params.sldd', 'Browse…']);
    await clickRow('params.sldd');
    await until(() => !!view() && header() !== '');
    expect(explorerRows().filter((r) => r.includes('↔'))).toEqual([]);
    expect(explorerRows().filter((r) => r === 'params.sldd')).toHaveLength(2);
    expect(document.title).toBe(`${PAIR} — Data Explorer`);
    const status = document.querySelector<HTMLElement & { kind: string }>('[slot="status"]')!;
    expect(status.kind).toBe('Comparison');
    await until(() => status.shadowRoot?.textContent?.trim() === 'Comparison');
    page.command('palette');
    await until(() => palette().open);
    expect(paletteRows().find((r) => r.label === 'Compare With…')!.disabled).toBe(true);
    palette().close();
  });

  it('goes to the compare tab of a pair already compared', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    await selectPath(at('a/params.sldd'));
    await compareWith(page, at('b/params.sldd'));
    expect(tabNames().filter((n) => n === PAIR)).toHaveLength(1);
    expect(tabNames()).toHaveLength(3);
    expect(activeTab()?.textContent).toContain(PAIR);
  });

  it('compares two MAT-files, whose variables have no heading', async () => {
    const page = startPage({ 'a/ParamMat.mat': 'ParamMat.mat' });
    const edited = await derive(fixtureBytes('ParamMat.mat', true), 'ParamMat.mat', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'ParamMat').ID, columnId: 'Value', oldValue: '[1 2 3; 4 5 6]', newValue: '[1 2 3; 4 5 7]' });
    });
    page.main.files.set(at('b/ParamMat.mat'), edited);
    await open(page, 'b/ParamMat.mat', 'a/ParamMat.mat');
    await compareWith(page, at('b/ParamMat.mat'));
    const [left] = tables();
    expect(left!.rows.some((r) => r.ID.startsWith('section:'))).toBe(false);
    const line = left!.rows.find((r) => r.Name.label === 'ParamMat')!.ID;
    expect(left!.diffMarks!.get(line)?.kind).toBe('changed');
    expect(header()).toBe('1 changed');
  });

  it("rules both of its tables as Settings' table style says", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    page.command('settings');
    await until(() => settingsPanel().open);
    settingsPanel().dispatchEvent(
      new CustomEvent('dex-settings-change', { detail: { settings: { ...settingsPanel().settings, tableStyle: 'rows' } }, bubbles: true, composed: true }),
    );
    await until(() => tables().every((t) => t.tableStyle === 'light'));
    expect(tables()).toHaveLength(2);
  });

});
