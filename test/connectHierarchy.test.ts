// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectHierarchy: a <dex-hierarchy> following a FolderHierarchy, over the integration suite's
// workspace folder read off disk. The tree draws the folder, opens rows through the hierarchy,
// draws again on a rebuild with what was open still open, hands a chosen file to the app, and
// says when the folder cannot be read.
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import { FolderHierarchy } from '../src/model/index.js';
import { connectHierarchy, defineHierarchy, type DexHierarchy } from '../src/widgets/hierarchy/index.js';

beforeAll(() => defineHierarchy());

const REPO = resolve(import.meta.dirname, '..');
const WORKSPACE = ['binary.sldd', 'data.sldd', 'model.slx', 'params.sldd'].map(
  (name): SourceFile => ({ uriString: `file:///workspace/${name}`, path: `/workspace/${name}` }),
);
const onDisk = (file: SourceFile): string => join(REPO, 'test-integration/fixtures/workspace', file.path.slice('/workspace/'.length));

let listed: readonly SourceFile[] = WORKSPACE;
let failing = false;
function workspace(): FolderHierarchy {
  return new FolderHierarchy({
    files: {
      list: async () => {
        if (failing) throw new Error('the folder is gone');
        return listed;
      },
    },
    reader: (files) => ({ ...nodeSourceReader(files, { pathOf: onDisk }), projectStore: async () => null }),
  });
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
  listed = WORKSPACE;
  failing = false;
});

async function settle(el: DexHierarchy): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await el.updateComplete;
  }
}

function connected(empty?: HTMLElement) {
  const el = document.createElement('dex-hierarchy');
  document.body.append(el);
  const hierarchy = workspace();
  const handle = connectHierarchy(el, hierarchy, empty ? { empty } : {});
  cleanups.push(() => handle.dispose());
  return { el, hierarchy, handle };
}

const labels = (el: DexHierarchy): string[] =>
  [...el.shadowRoot!.querySelectorAll('[role="treeitem"] .label')].map((l) => l.textContent!);
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
});
