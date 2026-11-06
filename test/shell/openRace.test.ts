// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A tab closed, or the shell taken down, while its document is still being opened: after its file
// is read, the workspace parses it, and that can take a while for a large model. The document that
// arrives then is for nobody: it is disposed at once, so it leaves the workspace (a second open of
// the same file would otherwise be refused as already open), and no table is connected to it.
//
// The workspace's open() is held here (vi.mock wraps the real one) so the close lands in between.
import { describe, expect, it, vi } from 'vitest';
import { at, open, settled, startPage, tabNames, tableOf, until } from './harness.js';

const held = vi.hoisted(() => ({ on: false, waiting: [] as (() => void)[] }));

vi.mock('../../src/model/source/workspace.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/source/workspace.js')>();
  return {
    ...real,
    createWorkspace: (options?: Parameters<typeof real.createWorkspace>[0]) => {
      const ws = real.createWorkspace(options);
      const openReal = ws.open.bind(ws);
      ws.open = async (...args) => {
        if (held.on) await new Promise<void>((resolve) => held.waiting.push(resolve));
        return openReal(...args);
      };
      return ws;
    },
  };
});

/** Let the documents held so far be opened. */
function release(): void {
  held.on = false;
  for (const go of held.waiting.splice(0)) go();
}

describe('a document that arrives after its tab closed', () => {
  it('is disposed: the file opens again, in a tab of its own, without a word', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    held.on = true;
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => held.waiting.length === 1);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    release();
    await settled();
    expect(document.querySelectorAll('dex-tree-table')).toHaveLength(0);
    await open(page, 'params.sldd');
    expect(tableOf('params.sldd')!.banners?.error).toBeUndefined();
    expect(tableOf('params.sldd')!.rows.length).toBeGreaterThan(0);
  });

  it('is disposed when the shell was taken down meanwhile, and the host told nothing more', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    held.on = true;
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => held.waiting.length === 1);
    page.handle.dispose();
    const told = [...page.main.closedFiles];
    release();
    await settled();
    expect(page.main.closedFiles).toEqual(told);
    expect(document.querySelectorAll('dex-tree-table')).toHaveLength(0);
  });
});
