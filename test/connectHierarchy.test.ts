// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectHierarchy: a <dex-hierarchy> following a FolderHierarchy, over the integration suite's
// workspace folder read off disk. The tree draws the folder, opens rows through the hierarchy,
// draws again on a rebuild with what was open still open, hands a chosen file to the app, and
// says when the folder cannot be read; it opens the folder's row first if asked, and shows the
// app a file it names (reveal).
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import { FolderHierarchy } from '../src/model/index.js';
import {
  connectHierarchy,
  defineHierarchy,
  type ConnectHierarchyOptions,
  type DexHierarchy,
} from '../src/widgets/hierarchy/index.js';

beforeAll(() => defineHierarchy());

const REPO = resolve(import.meta.dirname, '..');
const WORKSPACE = ['binary.sldd', 'data.sldd', 'model.slx', 'params.sldd'].map(
  (name): SourceFile => ({ uriString: `file:///workspace/${name}`, path: `/workspace/${name}` }),
);
// Two models that share one dictionary: it is a row under each.
const USAGE_ORDER = ['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map(
  (name): SourceFile => ({ uriString: `file:///usageorder/${name}`, path: `/usageorder/${name}` }),
);
const onDisk = (file: SourceFile): string => join(REPO, 'test-integration/fixtures', file.path.slice(1));

let listed: readonly SourceFile[] = WORKSPACE;
let failing = false;
// The disk reads not yet answered: settle() waits for them, however long a loaded machine takes.
let reading = 0;
const read = <T>(answer: Promise<T>): Promise<T> => {
  reading++;
  return answer.finally(() => reading--);
};
function workspace(): FolderHierarchy {
  return new FolderHierarchy({
    files: {
      list: async () => {
        if (failing) throw new Error('the folder is gone');
        return listed;
      },
    },
    reader: (files) => {
      const disk = nodeSourceReader(files, { pathOf: onDisk });
      return { version: (f) => read(disk.version(f)), bytes: (f) => read(disk.bytes(f)), projectStore: async () => null };
    },
  });
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
  listed = WORKSPACE;
  failing = false;
});

/** Every read answered, and six tasks more for what follows from them, the tree drawn after each. */
async function settle(el: DexHierarchy): Promise<void> {
  for (let quiet = 0; quiet < 6; ) {
    await new Promise((done) => setTimeout(done, 0));
    await el.updateComplete;
    quiet = reading === 0 ? quiet + 1 : 0;
  }
}

function connected(empty?: HTMLElement, options: ConnectHierarchyOptions = {}) {
  const el = document.createElement('dex-hierarchy');
  document.body.append(el);
  const hierarchy = workspace();
  const handle = connectHierarchy(el, hierarchy, { ...(empty ? { empty } : {}), ...options });
  cleanups.push(() => handle.dispose());
  return { el, hierarchy, handle };
}

const labels = (el: DexHierarchy): string[] =>
  [...el.shadowRoot!.querySelectorAll('[role="treeitem"] .label')].map((l) => l.textContent!);
const rows = (el: DexHierarchy): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
const rowOf = (el: DexHierarchy, label: string): HTMLElement =>
  [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((r) => r.querySelector('.label')!.textContent === label)!;

describe('a hierarchy connected to a folder', () => {
  it('draws the folder, and opens rows through the hierarchy', async () => {
    const { el } = connected();
    await settle(el);
    expect(labels(el)).toEqual(['workspace']);
    rowOf(el, 'workspace').click();
    await settle(el);
    expect(labels(el)).toEqual(['workspace', 'binary.sldd', 'data.sldd', 'model.slx']);
    rowOf(el, 'model.slx').click();
    await settle(el);
    expect(labels(el)).toEqual(['workspace', 'binary.sldd', 'data.sldd', 'model.slx', 'plant.slx', 'External Data']);
  });

  it('hands the app the file a chosen row opens, and nothing for a row that is no file', async () => {
    const { el, handle } = connected();
    const opened: string[] = [];
    handle.on('open', (uri) => opened.push(uri));
    await settle(el);
    rowOf(el, 'workspace').click();
    await settle(el);
    rowOf(el, 'data.sldd').click();
    expect(opened).toEqual(['file:///workspace/data.sldd']);
  });

  it('draws again on a rebuild, with what was open still open', async () => {
    const { el, hierarchy } = connected();
    await settle(el);
    rowOf(el, 'workspace').click();
    await settle(el);
    listed = WORKSPACE.filter((f) => !f.path.endsWith('binary.sldd'));
    hierarchy.rebuild();
    await settle(el);
    expect(labels(el)).toEqual(['workspace', 'data.sldd', 'model.slx']);
    expect(el.selectedKey).toBe(rowOf(el, 'workspace').dataset.key);
  });

  it('shows the empty state while the folder has no rows, and says why it could not be read', async () => {
    const empty = document.createElement('p');
    failing = true;
    const { el, hierarchy, handle } = connected(empty);
    const errors: string[] = [];
    handle.on('error', (message) => errors.push(message));
    await settle(el);
    expect(errors).toEqual(['the folder is gone']);
    expect(el.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
    failing = false;
    hierarchy.rebuild();
    await settle(el);
    expect(labels(el)).toEqual(['workspace']);
    expect(el.hidden).toBe(false);
    expect(empty.hidden).toBe(true);
    listed = [];
    hierarchy.rebuild();
    await settle(el);
    expect(el.hidden).toBe(true);
  });

  it('hears nothing more once disposed', async () => {
    const { el, hierarchy, handle } = connected();
    const opened: string[] = [];
    handle.on('open', (uri) => opened.push(uri));
    await settle(el);
    handle.dispose();
    listed = [];
    hierarchy.rebuild();
    await settle(el);
    expect(labels(el)).toEqual(['workspace']);
    rowOf(el, 'workspace').click();
    expect(opened).toEqual([]);
  });

  it('opens the folder\'s own row on first show with expandTopLevel, and keeps it closed once closed', async () => {
    const { el, hierarchy } = connected(undefined, { expandTopLevel: true });
    await settle(el);
    expect(el.expandTopLevel).toBe(true);
    expect(labels(el)).toEqual(['workspace', 'binary.sldd', 'data.sldd', 'model.slx']);
    rowOf(el, 'workspace').querySelector<HTMLElement>('.twisty')!.click();
    await settle(el);
    hierarchy.rebuild();
    await settle(el);
    expect(labels(el)).toEqual(['workspace']);
  });

  it('opens the top level of each folder the tree is connected to', async () => {
    const { el, handle } = connected(undefined, { expandTopLevel: true });
    await settle(el);
    handle.dispose();
    listed = USAGE_ORDER;
    cleanups.push(connectHierarchy(el, workspace(), { expandTopLevel: true }).dispose);
    await settle(el);
    expect(labels(el)).toEqual(['usageorder', 'ctrlA.slx', 'plantB.slx']);
  });
});

describe('reveal', () => {
  const PARAMS = 'file:///workspace/params.sldd';

  it('opens the rows above a file, selects it, and sends nothing', async () => {
    const { el, handle } = connected();
    const opened: string[] = [];
    handle.on('open', (uri) => opened.push(uri));
    await settle(el);
    // params.sldd is a row only under model.slx's External Data: three rows down.
    expect(await handle.reveal(PARAMS)).toBe(true);
    await settle(el);
    expect(labels(el)).toEqual(['workspace', 'binary.sldd', 'data.sldd', 'model.slx', 'plant.slx', 'External Data', 'params.sldd', 'signals.mat']);
    expect(el.selectedKey).toBe(rowOf(el, 'params.sldd').dataset.key);
    expect(rowOf(el, 'params.sldd').getAttribute('aria-level')).toBe('4');
    expect(opened).toEqual([]);
  });

  it('chooses the row too when asked, which hands the app its file', async () => {
    const { el, handle } = connected();
    const opened: string[] = [];
    const chosen: (string | null)[] = [];
    handle.on('open', (uri) => opened.push(uri));
    el.addEventListener('dex-hierarchy-select', (e) => chosen.push(e.detail.uri));
    await settle(el);
    expect(await handle.reveal('file:///workspace/data.sldd', { choose: true })).toBe(true);
    expect(chosen).toEqual(['file:///workspace/data.sldd']);
    expect(opened).toEqual(['file:///workspace/data.sldd']);
  });

  it('leaves the tree as it was for a file that is no row, a reveal overtaken, and once disposed', async () => {
    const { el, handle } = connected();
    await settle(el);
    rowOf(el, 'workspace').click();
    await settle(el);
    const before = { expanded: el.expandedKeys, selected: el.selectedKey };
    expect(await handle.reveal('file:///elsewhere/other.sldd')).toBe(false);
    // The file the app has open now, not the one it had a moment ago.
    const [first, second] = await Promise.all([handle.reveal(PARAMS), handle.reveal('file:///workspace/data.sldd')]);
    expect([first, second]).toEqual([false, true]);
    await settle(el);
    expect(el.selectedKey).toBe(rowOf(el, 'data.sldd').dataset.key);
    expect(el.expandedKeys).toEqual(before.expanded);
    handle.dispose();
    expect(await handle.reveal(PARAMS)).toBe(false);
    expect(el.selectedKey).toBe(rowOf(el, 'data.sldd').dataset.key);
    expect(before.selected).toBe(rowOf(el, 'workspace').dataset.key);
  });

  it('keeps the row the user chose when it is the file already, wherever else the file is a row', async () => {
    listed = USAGE_ORDER;
    const SHARED = 'file:///usageorder/sharedParams.sldd';
    const { el, handle } = connected(undefined, { expandTopLevel: true });
    await settle(el);
    for (const model of ['ctrlA.slx', 'plantB.slx']) {
      rowOf(el, model).querySelector<HTMLElement>('.twisty')!.click();
      await settle(el);
    }
    for (const data of rows(el).filter((r) => r.querySelector('.label')!.textContent === 'External Data')) data.click();
    await settle(el);
    const shared = rows(el).filter((r) => r.querySelector('.label')!.textContent === 'sharedParams.sldd');
    expect(shared.map((r) => r.getAttribute('aria-level'))).toEqual(['4', '4']);
    // By the rule: the first from the top, under ctrlA.slx.
    expect(await handle.reveal(SHARED)).toBe(true);
    expect(el.selectedKey).toBe(shared[0]!.dataset.key);
    // The user chooses the one under plantB.slx, and the app reveals the file it opened: it stays.
    shared[1]!.click();
    expect(await handle.reveal(SHARED)).toBe(true);
    expect(el.selectedKey).toBe(shared[1]!.dataset.key);
    // Another file, then this one again: found by the rule again.
    expect(await handle.reveal('file:///usageorder/plantB.slx')).toBe(true);
    expect(await handle.reveal(SHARED)).toBe(true);
    expect(el.selectedKey).toBe(shared[0]!.dataset.key);
  });

  it('is false while the folder cannot be read', async () => {
    failing = true;
    const { el, handle } = connected();
    await settle(el);
    expect(await handle.reveal(PARAMS)).toBe(false);
  });
});
