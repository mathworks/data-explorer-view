// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Copy Link to Entry, on a document row's menu, for a host that makes links (ShellHost.entryLink):
// the desktop app's data-explorer://open?… link to the entry the row is in, put on the clipboard
// for a mail, a ticket or a test report, which ShellHandle.openAt follows back to that row. A host
// that makes no links (a browser page, the VS Code extension) has no such item, and its menus are
// as they were. The host is asked at each menu, as every member of it is; an empty answer copies
// nothing, and a clipboard that refuses says so.
//
// A block in a subsystem is linked by its key: core lists a model's blocks flat under Model
// Elements, so its name may be another block's (a Gain in the root system, one in a subsystem),
// and only the key selects it again.
import { describe, expect, it } from 'vitest';
import type { ShellEntryTarget } from '../../src/widgets/app-shell/connect/types.js';
import { at, choose, menuOn, open, settled, startPage, tableOf, toastTexts, until, type Page } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'slxcases.slx': 'slxcases.slx' };

/** A host that makes links, from now on: each target it is asked for, and the link it answers. */
function makesLinks(page: Page, answer = (t: ShellEntryTarget) => `L|${t.path}|${t.entry}`): ShellEntryTarget[] {
  const targets: ShellEntryTarget[] = [];
  page.host.entryLink = (t) => (targets.push(t), answer(t));
  return targets;
}
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('Copy Link to Entry', () => {
  it('is no item for a host that makes no links, and the menu still ends with Show in Graph', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const items = await menuOn('params.sldd', 'Kp');
    expect(ids(items)).not.toContain('copyEntryLink');
    expect(ids(items).at(-1)).toBe('showInGraph');
  });

  it("copies the host's link to the row's entry, by its name and its section's label, and says so", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const targets = makesLinks(page);
    const items = await menuOn('params.sldd', 'Kp');
    expect(ids(items).slice(-2)).toEqual(['copyEntryLink', 'showInGraph']);
    expect(items.find((i) => i.id === 'copyEntryLink')?.label).toBe('Copy Link to Entry');
    choose('copyEntryLink');
    await until(() => page.main.copied.length > 0);
    expect(targets).toStrictEqual([{ path: '/work/params.sldd', entry: 'Kp', section: 'Design Data' }]);
    expect(page.main.copied).toEqual(['L|/work/params.sldd|Kp']);
    await until(() => toastTexts().includes('Link copied'));
  });

  it("is no item on a section's own row, which is no entry", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    makesLinks(page);
    expect(ids(await menuOn('params.sldd', 'Design Data'))).not.toContain('copyEntryLink');
  });

  it("links a MAT-file's variable by its name alone: it is in no section", async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat');
    const targets = makesLinks(page);
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('copyEntryLink');
    await until(() => targets.length > 0);
    expect(targets).toStrictEqual([{ path: '/work/ParamMat.mat', entry: 'ParamMat' }]);
  });

  it('says why where the clipboard refuses the link', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    makesLinks(page);
    page.host.copyText = () => Promise.reject(new Error('denied'));
    await menuOn('params.sldd', 'Kp');
    choose('copyEntryLink');
    await until(() => toastTexts().includes('Could not copy the link: denied'));
    expect(toastTexts()).not.toContain('Link copied');
  });

  it('copies nothing, and says nothing, where the host answers no link', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const targets = makesLinks(page, () => '');
    await menuOn('params.sldd', 'Kp');
    choose('copyEntryLink');
    await until(() => targets.length > 0);
    await settled();
    expect(page.main.copied).toEqual([]);
    expect(toastTexts()).not.toContain('Link copied');
  });

  it('copies nothing, and says nothing, where the host answers what is no link at all', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const targets = makesLinks(page, () => 42 as never);
    await menuOn('params.sldd', 'Kp');
    choose('copyEntryLink');
    await until(() => targets.length > 0);
    await settled();
    expect(page.main.copied).toEqual([]);
    expect(toastTexts()).toEqual([]);
  });

  it('links a block in a subsystem by its key, and one in the root system by its name: openAt follows each back to its row', async () => {
    const page = startPage(FILES);
    await open(page, 'slxcases.slx');
    const targets = makesLinks(page);
    const table = tableOf('slxcases.slx')!;
    const rowNamed = (label: string) => table.rows.find((r) => r.Name?.label === label)!;
    const linked: Record<string, string> = {};
    for (const label of ['InnerGain', 'Gain']) {
      await menuOn('slxcases.slx', label);
      choose('copyEntryLink');
      await until(() => targets.length === Object.keys(linked).length + 1);
      linked[label] = rowNamed(label).ID;
    }
    // InnerGain is in the subsystem Sub; Gain is in the root system.
    expect(rowNamed('InnerGain')._systemPath).toBe('Sub');
    expect(targets).toStrictEqual([
      { path: at('slxcases.slx'), entry: rowNamed('InnerGain')._blockKey },
      { path: at('slxcases.slx'), entry: 'Gain', section: 'Model Elements' },
    ]);
    for (const [label, id] of Object.entries(linked)) {
      const { path, ...where } = targets[Object.keys(linked).indexOf(label)]!;
      await page.handle.openAt(path, where);
      expect(table.selectedRowIds, label).toEqual([id]);
    }
  });
});
