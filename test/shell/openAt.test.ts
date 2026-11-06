// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A file opened at an entry from outside the shell (ShellHandle.openAt): what the desktop app's
// data-explorer:// links open, and what the share-links page opens for its `#entry=`. The file opens
// as openPaths opens one, in a kept tab, or its tab is gone to; then, once its table has its rows,
// the entry the link names is selected, by its name and, given one, its section's label. A link
// names what it names in words, from a mail or a ticket, and the file may have changed since: an
// entry it no longer holds is said in a toast that stays, as the user followed the link to see a
// row and has to read why none is shown. Nobody waits on the answer to say a failure, so openAt
// never rejects: what fails is said in the window, as any open's failure is.
import { describe, expect, it } from 'vitest';
import { activeTab, at, open, previewTabs, settled, startPage, tabNamed, tabNames, tableOf, toastHost, toastTexts, until } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx', 'ParamMat.mat': 'ParamMat.mat' };

/** The labels of the rows selected in `name`'s table. */
const selected = (name: string): string[] => {
  const table = tableOf(name);
  if (!table) return [];
  return table.selectedRowIds.map((id) => table.rows.find((r) => r.ID === id)?.Name.label ?? id);
};
/** The toasts on screen that say an entry was not found. */
const noEntryToasts = () => toastTexts().filter((t) => t.startsWith('No entry'));

describe('openAt opens a file at the entry a link names', () => {
  it('opens the file in a kept tab and selects the entry, saying nothing', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('params.sldd'), { entry: 'Kp' });
    expect(tabNames()).toEqual(['params.sldd']);
    expect(previewTabs()).toEqual([]);
    expect(selected('params.sldd')).toEqual(['Kp']);
    await settled();
    expect(toastTexts()).toEqual([]);
  });

  it("waits for the file's first paint before it selects", async () => {
    const page = startPage(FILES);
    const read = page.host.readFile;
    let release: (() => void) | undefined;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    const opening = page.handle.openAt(at('params.sldd'), { entry: 'Kp' });
    await until(() => !!release);
    page.host.readFile = read;
    release!();
    await opening;
    expect(selected('params.sldd')).toEqual(['Kp']);
  });

  it("goes to the file's tab where it is open, reading it no more, and selects the entry there", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => activeTab() === tabNamed('ParamMat.mat'));
    await page.handle.openAt(at('params.sldd'), { entry: 'Uo' });
    expect(selected('params.sldd')).toEqual(['Uo']);
    await until(() => activeTab() === tabNamed('params.sldd'));
    expect(page.main.reads.filter((p) => p === at('params.sldd'))).toHaveLength(1);
  });

  it('selects the entry in the section of that label, and says where a section holds none of it', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('shadow_ws.slx'), { entry: 'Kp', section: 'Model Workspace' });
    const table = tableOf('shadow_ws.slx')!;
    const ids = [...table.selectedRowIds];
    expect(ids).toHaveLength(1);
    expect(table.rows.find((r) => r.ID === ids[0])?.parent).toBe('section:workspace');
    await page.handle.openAt(at('shadow_ws.slx'), { entry: 'Kp', section: 'Model Elements' });
    expect(table.selectedRowIds).toEqual(ids);
    await until(() => noEntryToasts().length > 0);
    expect(noEntryToasts()).toEqual(['No entry named Kp in Model Elements']);
  });

  it('keeps the file open and says so in a warning, which stays, where it has no such entry', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('params.sldd'), { entry: 'Nope' });
    expect(tabNames()).toEqual(['params.sldd']);
    expect(selected('params.sldd')).toEqual([]);
    await until(() => !!toastHost().shadowRoot?.querySelector('.toast.warning .message'));
    expect(toastHost().shadowRoot!.querySelector('.toast.warning .message')!.textContent).toBe('No entry named Nope');
  });

  it('opens the file and selects nothing for no entry, or an empty one', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('params.sldd'));
    await page.handle.openAt(at('ParamMat.mat'), { entry: '' });
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    await until(() => (tableOf('ParamMat.mat')?.rows.length ?? 0) > 0);
    expect(selected('params.sldd')).toEqual([]);
    expect(selected('ParamMat.mat')).toEqual([]);
    await settled();
    expect(toastTexts()).toEqual([]);
  });

  it('resolves for a file that could not be read, which its table says, and looks for no entry in it', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('missing.sldd'), { entry: 'Kp' });
    expect(tableOf('missing.sldd')!.banners?.error).toMatch(/^Failed to open missing\.sldd/);
    await settled();
    expect(noEntryToasts()).toEqual([]);
  });

  it('resolves, saying nothing, when the tab closes while its file is read', async () => {
    const page = startPage(FILES);
    const read = page.host.readFile;
    let release: (() => void) | undefined;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    const opening = page.handle.openAt(at('params.sldd'), { entry: 'Kp' });
    await until(() => tabNames().length === 1 && !!release);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    page.host.readFile = read;
    release!();
    await opening;
    expect(tabNames()).toEqual([]);
    await settled();
    expect(noEntryToasts()).toEqual([]);
  });

  it("selects a MAT-file's variable by its name", async () => {
    const page = startPage(FILES);
    await page.handle.openAt(at('ParamMat.mat'), { entry: 'ParamMat' });
    expect(selected('ParamMat.mat')).toEqual(['ParamMat']);
  });

  it('resolves, reading nothing, once the shell is taken down', async () => {
    const page = startPage(FILES);
    page.handle.dispose();
    await page.handle.openAt(at('params.sldd'), { entry: 'Kp' });
    expect(page.main.reads).toEqual([]);
  });
});
