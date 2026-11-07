// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Copy to Left and Copy to Right in a compare tab: a line's menu copies its entry from the side
// that has it to the other, through the other file's own tab (its handle's drop, or the replacing
// drop where that file has the entry already), so it is one edit of that file, undone by one Undo
// there, and the compare draws the result from the file's own change. What it protects:
//  - a changed entry is replaced, keeping its name (no `Kp1`); one the other side lacks is copied in;
//  - several lines of one section are one edit; a line inside an entry stands for its entry;
//  - a side that may not be edited takes no copy, and its menu offers none into it;
//  - what the target refuses is said in its words, and nothing changes;
//  - Show in <file> goes to the line's row in that file's own tab.
import { describe, expect, it } from 'vitest';
import { derive, fixtureBytes, rowNamed, settle } from '../compare/derive.js';
import type { ContextMenuItem } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import { compareWith, header, lineOf, PAIR, selectPath, tables, twoFiles, view } from './compareHarness.js';
import { activeTab, at, choose, open, rowOf, startPage, tableOf, tabNamed, textOf, toastTexts, until, type Page } from './harness.js';

const menu = () => document.querySelector('dex-context-menu')!;

/** The line menu of `label`'s line, right-clicked in the left (0) or right (1) table: its items by id, separators left out. */
async function lineMenu(side: 0 | 1, label: string): Promise<ContextMenuItem[]> {
  const table = tables()[side]!;
  const id = lineOf(label);
  const tr = (): HTMLElement | null => table.shadowRoot!.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`);
  await until(() => !!tr());
  let items: ContextMenuItem[] = [];
  const show = menu().show.bind(menu());
  menu().show = (x, y, shown, options) => ((items = shown.filter((i) => !i.separator)), show(x, y, shown, options));
  tr()!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 5, clientY: 5 }));
  await until(() => items.length > 0);
  menu().show = show;
  return items;
}
const item = (items: ContextMenuItem[], id: string): ContextMenuItem | undefined => items.find((i) => i.id === id);
const names = (file: string): string[] => (tableOf(file)?.rows ?? []).filter((r) => r.parent === 'section:design').map((r) => r.Name.label);

/** Undo once in `path`'s own tab, and come back to the compare. */
async function undoIn(page: Page, path: string): Promise<void> {
  await selectPath(path);
  page.command('undo');
}

describe('Copy to Right and Copy to Left', () => {
  it("replaces a changed entry, keeping its name, as one Undo in the file copied into", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const items = await lineMenu(0, 'Kp');
    expect(item(items, 'copy-right')!.disabled).toBeFalsy();
    expect(item(items, 'copy-left')!.disabled).toBeFalsy();
    choose('copy-right');
    await until(() => header() === '1 added, 1 removed');
    expect(textOf(await rowOf('b/params.sldd', 'Kp'))).toBe('1');
    expect(names('b/params.sldd')).not.toContain('Kp1');
    await until(() => toastTexts().includes('Copied 1 entry to params.sldd'));
    await undoIn(page, at('b/params.sldd'));
    await until(() => textOf(tableOf('b/params.sldd')!.rows.find((r) => r.Name.label === 'Kp')) === '5');
    await until(() => header() === '1 changed, 1 added, 1 removed');
  });

  it('copies in an entry the other side lacks', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    await lineMenu(0, 'Uo');
    choose('copy-right');
    await until(() => names('b/params.sldd').includes('Uo'));
    await until(() => header() === '1 changed, 1 added');
    await undoIn(page, at('b/params.sldd'));
    await until(() => !names('b/params.sldd').includes('Uo'));
  });

  it("copies to the left, and offers no copy from a side that lacks the entry", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const items = await lineMenu(1, 'Param');
    expect(item(items, 'copy-right')!.disabled).toBe(true);
    expect(item(items, 'copy-left')!.disabled).toBeFalsy();
    choose('copy-left');
    await until(() => names('a/params.sldd').includes('Param'));
  });

  it('copies several lines of one section as one edit', async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const left = tables()[0]!;
    const cell = (label: string): HTMLElement => left.shadowRoot!.querySelector<HTMLElement>(`tr[data-row-id="${lineOf(label)}"] td.col-Name`)!;
    await until(() => !!cell('Kp') && !!cell('Uo'));
    cell('Kp').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    cell('Uo').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ctrlKey: true, metaKey: true }));
    await until(() => left.selectedRowIds.length === 2);
    await lineMenu(0, 'Uo');
    choose('copy-right');
    await until(() => names('b/params.sldd').includes('Uo') && textOf(tableOf('b/params.sldd')!.rows.find((r) => r.Name.label === 'Kp')) === '1');
    // Said once the drop has settled, a task after the rows it changed.
    await until(() => toastTexts().includes('Copied 2 entries to params.sldd'));
    await undoIn(page, at('b/params.sldd'));
    await until(() => !names('b/params.sldd').includes('Uo'));
    expect(textOf(tableOf('b/params.sldd')!.rows.find((r) => r.Name.label === 'Kp'))).toBe('5');
  });

  it('copies nothing into a side that may not be edited', async () => {
    const page = startPage({ 'viewing_only.mat': 'viewing_only.mat', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'ParamMat.mat', 'viewing_only.mat');
    await compareWith(page, at('ParamMat.mat'));
    const caption = view().shadowRoot!.querySelectorAll('.caption')[0]!;
    expect(caption.querySelector('.tag')?.textContent).toBe('Read-only');
    const [left] = tables();
    const removed = left!.rows.find((r) => left!.diffMarks?.get(r.ID)?.kind === 'removed')!;
    const items = await lineMenu(0, removed.Name.label);
    expect(item(items, 'copy-right')).toBeTruthy();
    expect(item(items, 'copy-left')).toBeUndefined();
  });

  it("says what the file copied into refuses, in its words, and changes nothing", async () => {
    const page = startPage({ 'a/rt_bin.sldd': 'rt_bin.sldd' });
    const edited = await derive(fixtureBytes('rt_bin.sldd', true), 'rt_bin.sldd', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'Wheels', 'gadget').ID, columnId: 'Value', oldValue: '4', newValue: '42' });
    });
    page.main.files.set(at('b/rt_bin.sldd'), edited);
    await open(page, 'b/rt_bin.sldd', 'a/rt_bin.sldd');
    await compareWith(page, at('b/rt_bin.sldd'));
    await lineMenu(0, 'gadget');
    choose('copy-right');
    await until(() => toastTexts().some((t) => t.startsWith('Could not copy to rt_bin.sldd:')));
    const wheels = tableOf('b/rt_bin.sldd')!.rows.find((r) => r.Name.label === 'Wheels');
    expect(textOf(wheels)).toBe('42');
    expect(tableOf('b/rt_bin.sldd')!.rows.some((r) => r.Name.label === 'gadget1')).toBe(false);
  });

  it('copies the whole entry a line inside it stands for', async () => {
    const page = startPage();
    const whole = fixtureBytes('nested_objects.sldd');
    const edited = await derive(whole, 'nested_objects.sldd', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'plain', 'StructWithParam').ID, columnId: 'Value', oldValue: '5', newValue: '6' });
    });
    page.main.files.set(at('a/nested_objects.sldd'), whole);
    page.main.files.set(at('b/nested_objects.sldd'), edited);
    await open(page, 'b/nested_objects.sldd', 'a/nested_objects.sldd');
    await compareWith(page, at('b/nested_objects.sldd'));
    await lineMenu(0, 'plain');
    choose('copy-right');
    const plainIn = (file: string): string => textOf((tableOf(file)?.rows ?? []).find((r) => r.Name.label === 'plain'));
    await until(() => plainIn('b/nested_objects.sldd') === '5');
    expect(names('b/nested_objects.sldd')).not.toContain('StructWithParam1');
    await until(() => view().empty === 'No differences');
  });

  it("shows a line's row in its file's own tab", async () => {
    const page = await twoFiles();
    await compareWith(page, at('b/params.sldd'));
    const items = await lineMenu(0, 'Uo');
    // Uo is only in a: one Show in, a's.
    expect(items.filter((i) => i.label === 'Show in params.sldd')).toHaveLength(1);
    choose('show-left');
    await until(() => activeTab()?.getAttribute('title') === at('a/params.sldd'));
    const uo = await rowOf('a/params.sldd', 'Uo');
    await until(() => (tableOf('a/params.sldd') as DexTreeTable).selectedRowIds.includes(uo.ID));
    expect(tabNamed(PAIR)).toBeTruthy();
  });
});
