// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Comparing files from the Folder view, where the files are before any is open: a data file's row
// menu offers Compare With… (the file opened, kept, then the question of which file to compare it
// with), and with exactly two data files' rows taken into the selection (Cmd/Ctrl+click, the tree's
// `multiSelect`), Compare Selected first, which opens both and compares them in the tree's order. A
// row of a file the app does not open offers neither.
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { derive, fixtureBytes, rowNamed as rowCalled, settle } from '../compare/derive.js';
import type { ContextMenuItem } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { DexHierarchy } from '../../src/widgets/hierarchy/dex-hierarchy.js';
import { placeholder, view } from './compareHarness.js';
import { activeTab, palette, previewTabs, serveFolderTo, startPage, tabNames, tempFolder, until } from './harness.js';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  Reflect.deleteProperty(navigator, 'platform');
});

/** A folder `work` holding params.sldd, a second version of it (params2.sldd: Kp 1 → 5), and notes.md. */
async function workFolder(): Promise<string> {
  const work = tempFolder('work', { 'params.sldd': 'params.sldd' });
  const edited = await derive(fixtureBytes('params.sldd', true), 'params.sldd', async (table, rows) => {
    await table.edit({ rowId: rowCalled(rows, 'Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle();
  });
  writeFileSync(path.join(work, 'params2.sldd'), edited);
  writeFileSync(path.join(work, 'notes.md'), '# notes\n');
  return work;
}

/** A page over the real files, the folder `dir` shown in the Folder view. */
function folderPage(dir: string) {
  Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
  const page = startPage();
  page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
  const served = serveFolderTo(page, dir, { entries: true });
  stops.push(served.dispose);
  return page;
}

const tree = () => document.querySelector<DexHierarchy>('dex-hierarchy')!;
const rows = () => [...(tree().shadowRoot?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
const rowNamed = (label: string) => rows().find((r) => r.querySelector('.label')?.textContent?.trim() === label);

let shown: ContextMenuItem[] = [];
function recordMenus(): void {
  const menu = document.querySelector('dex-context-menu')!;
  const show = menu.show.bind(menu);
  menu.show = (x, y, items, options) => ((shown = items), show(x, y, items, options));
}
const labels = () => shown.map((i) => (i.separator ? '—' : i.label));
function choose(label: string): void {
  const item = shown.find((i) => i.label === label)!;
  document.querySelector('dex-context-menu')!.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: item.id }, bubbles: true, composed: true }));
}
async function rightClick(label: string): Promise<void> {
  shown = [];
  const row = rowNamed(label)!;
  row.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, composed: true }));
  row.dispatchEvent(new MouseEvent('contextmenu', { button: 2, clientX: 20, clientY: 30, bubbles: true, composed: true, cancelable: true }));
  await until(() => shown.length > 0);
}
const ctrlClick = (label: string): void =>
  void rowNamed(label)!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ctrlKey: true }));

describe('comparing from the Folder view', () => {
  it('compares the two rows taken into the selection', async () => {
    const work = await workFolder();
    folderPage(work);
    recordMenus();
    await until(() => !!rowNamed('params.sldd') && !!rowNamed('params2.sldd'));
    ctrlClick('params.sldd');
    ctrlClick('params2.sldd');
    await until(() => tree().selectedKeys.length === 2);
    await rightClick('params2.sldd');
    expect(labels()[0]).toBe('Compare Selected');
    choose('Compare Selected');
    await until(() => activeTab()?.textContent?.includes('params.sldd ↔ params2.sldd') === true && !!view());
    expect(tabNames()).toEqual(expect.arrayContaining(['params.sldd', 'params2.sldd', 'params.sldd ↔ params2.sldd']));
    expect(previewTabs()).toEqual([]);
  });

  it("offers Compare With… on a data file's row, which opens it and asks which file", async () => {
    const work = await workFolder();
    folderPage(work);
    recordMenus();
    await until(() => !!rowNamed('params.sldd'));
    await rightClick('params.sldd');
    expect(labels()).not.toContain('Compare Selected');
    expect(labels().indexOf('Compare With…')).toBe(labels().indexOf('Open to the Side') + 1);
    choose('Compare With…');
    await until(() => palette().open);
    expect(placeholder()).toBe('Compare params.sldd with…');
    expect(tabNames()).toEqual(['params.sldd']);
    expect(previewTabs()).toEqual([]);
    palette().close();
  });

  it("offers neither on a row of a file the app does not open", async () => {
    const work = await workFolder();
    folderPage(work);
    recordMenus();
    await until(() => !!rowNamed('notes.md'));
    ctrlClick('params.sldd');
    ctrlClick('notes.md');
    await rightClick('notes.md');
    expect(labels()).not.toContain('Compare Selected');
    expect(labels()).not.toContain('Compare With…');
  });
});
