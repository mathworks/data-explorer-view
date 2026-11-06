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
//
// A table's source that cannot parse its file fails within the open that connected it; one may also
// fail later, once openAt waits on its paint. The workspace's documents are wrapped here (vi.mock
// over the real one) so a test can make the next document's table answer open() with an error when
// it says.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { portFromMessagePort } from '../../src/model/source/ports.js';
import { serveFolder, type FolderReads } from '../../src/serve/index.js';
import {
  activeTab,
  at,
  folderReads,
  open,
  previewTabs,
  settled,
  startPage,
  tabNamed,
  tabNames,
  tableOf,
  tempFolder,
  toastHost,
  toastTexts,
  treeLabels,
  until,
} from './harness.js';

const late = vi.hoisted(() => ({ fail: null as Promise<void> | null }));

vi.mock('../../src/model/source/workspace.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/source/workspace.js')>();
  return {
    ...real,
    createWorkspace: (options?: Parameters<typeof real.createWorkspace>[0]) => {
      const ws = real.createWorkspace(options);
      const openReal = ws.open.bind(ws);
      ws.open = async (...args) => {
        const doc = await openReal(...args);
        const gate = late.fail;
        late.fail = null;
        if (gate) doc.table.open = () => gate.then(() => Promise.reject(new Error(`Failed to parse ${args[1]}: it went wrong late`)));
        return doc;
      };
      return ws;
    },
  };
});

// A test that fails before its open leaves no gate for the next one's document.
afterEach(() => void (late.fail = null));

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

  it('resolves, saying nothing, when the tab closes while its table waits for its first paint', async () => {
    // The first paint fills the Usage column from the folder shown, read across its port as the
    // Electron app's main process serves it. With the folder's reads held from the open on, the
    // table is connected and not yet painted when its tab closes.
    const root = tempFolder('plant', { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    const file = path.join(root, 'params.sldd');
    const page = startPage();
    page.main.files.set(file, new Uint8Array(readFileSync(file)));
    const held = { on: false, waiting: [] as (() => void)[] };
    const hold = <T>(read: () => Promise<T>): Promise<T> =>
      held.on ? new Promise<T>((resolve, reject) => held.waiting.push(() => void read().then(resolve, reject))) : read();
    const reads = folderReads(root);
    const slow: FolderReads = {
      files: reads.files,
      reader(files) {
        const reader = reads.reader(files);
        return { ...reader, version: (f) => hold(() => reader.version(f)), bytes: (f) => hold(() => reader.bytes(f)) };
      },
    };
    const { port1, port2 } = new MessageChannel();
    const served = serveFolder(slow, portFromMessagePort(port1));
    try {
      page.handle.showFolder(root, port2);
      await until(() => treeLabels().includes('shadow_ws.slx'));
      await settled();
      held.on = true;
      const opening = page.handle.openAt(file, { entry: 'Kp' });
      const table = () => document.querySelector('.doc-panel dex-tree-table');
      await until(() => held.waiting.length > 0 && !!table());
      expect(table()!.rows).toEqual([]);
      page.command('close-tab');
      await until(() => tabNames().length === 0);
      held.on = false;
      for (const go of held.waiting.splice(0)) go();
      await opening;
      await settled();
      expect(noEntryToasts()).toEqual([]);
    } finally {
      served.dispose();
      port1.close();
    }
  });

  it('resolves for a file that reads but cannot be parsed, which its table says, and looks for no entry in it', async () => {
    const page = startPage();
    page.main.files.set(at('bad.sldd'), new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef]));
    await page.handle.openAt(at('bad.sldd'), { entry: 'Kp' });
    expect(tableOf('bad.sldd')!.banners?.error).toMatch(/^Failed to parse/);
    await settled();
    expect(noEntryToasts()).toEqual([]);
  });

  it('resolves when the source fails after the table is connected, as the banner says, and looks for no entry', async () => {
    const page = startPage(FILES);
    let fail!: () => void;
    late.fail = new Promise<void>((resolve) => (fail = resolve));
    const opening = page.handle.openAt(at('params.sldd'), { entry: 'Kp' });
    await until(() => !!tableOf('params.sldd'));
    await settled();
    fail();
    await opening;
    expect(tableOf('params.sldd')!.banners?.error).toBe('Failed to parse params.sldd: it went wrong late');
    await settled();
    expect(noEntryToasts()).toEqual([]);
  });

  it('resolves, opening nothing, for a path that is no string or is empty, as a page in plain JavaScript may hand', async () => {
    const page = startPage(FILES);
    await page.handle.openAt(undefined as unknown as string, { entry: 'Kp' });
    await page.handle.openAt('', { entry: 'Kp' });
    expect(tabNames()).toEqual([]);
    expect(page.main.reads).toEqual([]);
    await settled();
    expect(toastTexts()).toEqual([]);
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
