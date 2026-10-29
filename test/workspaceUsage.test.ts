// Copyright 2026 The MathWorks, Inc.
//
// A workspace's Usage column, beyond what the goldens hold (test/goldens/usage.test.ts): which
// rows a fill reaches (a paint, a reload's repaint, the rows a fetch answers, a compressed
// dictionary's), which graph it asks for, and what a graph it cannot have leaves.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildUsageGraph,
  createWorkspace,
  type BlockLink,
  type TableChange,
  type UsageGraph,
  type UsageSource,
} from '../src/model/index.js';

const bytes = (rel: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url))));
const buffer = (rel: string): ArrayBuffer => bytes(rel).slice().buffer as ArrayBuffer;

const link = (blockName: string): BlockLink => ({
  blockName,
  blockPath: `m/${blockName}`,
  modelName: 'm',
  modelUri: 'file:///w/m.slx',
  linkTarget: `blocks:${blockName}@file:///w/m.slx`,
});

/** A graph in which `users` name the blocks that use each variable, in any document. */
function graphOf(users: Record<string, string[]>): UsageGraph {
  return {
    blocksUsing: (_uri, name) => (Object.hasOwn(users, name) ? users[name]!.map(link) : []),
    paramLinks: () => [],
  };
}

/** A usage source answering `graph`, which records the uris it was asked for. */
function source(graph: UsageGraph | (() => Promise<UsageGraph>)): UsageSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    graphFor: async (uri) => {
      asked.push(uri);
      return typeof graph === 'function' ? graph() : graph;
    },
  };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function workspace(usage: UsageSource, rowBudget?: number) {
  const ws = createWorkspace({ usage, ...(rowBudget === undefined ? {} : { rowBudget }) });
  cleanups.push(() => ws.dispose());
  return ws;
}

const usedBy = (rows: readonly { Name?: { label?: string }; UsedBy?: unknown }[], name: string): unknown =>
  rows.find((r) => r.Name?.label === name)?.UsedBy;

describe("a workspace's Usage column", () => {
  it('fills a paint from the graph for the document it is, by its uri', async () => {
    const usage = source(graphOf({ Kp: ['Gain'] }));
    const doc = await workspace(usage).open(bytes('params.sldd'), 'params.sldd', 'file:///w/params.sldd');
    const { rows } = await doc.table.open();
    expect(usage.asked).toEqual(['file:///w/params.sldd']);
    expect(usedBy(rows, 'Kp')).toEqual({ blockLinks: [link('Gain')] });
    // A variable the graph has nothing for keeps what the file says.
    expect(rows.filter((r) => r.Name?.label !== 'Kp' && typeof r.UsedBy === 'object')).toEqual([]);
  });

  it("fills a compressed dictionary's, which the extension's editable view does not", async () => {
    const doc = await workspace(source(graphOf({ fleetObject: ['Fleet'] }))).open(bytes('object_props_binary.sldd'), 'object_props_binary.sldd');
    expect(usedBy((await doc.table.open()).rows, 'fleetObject')).toEqual({ blockLinks: [link('Fleet')] });
  });

  it('fills the rows a fetch answers, as the paint', async () => {
    // At a budget of one row the paint holds a struct's fields back for children().
    const everyone: UsageGraph = { blocksUsing: () => [link('Gain')], paramLinks: () => [] };
    const doc = await workspace(source(everyone), 1).open(bytes('numeric_json.sldd'), 'numeric_json.sldd');
    const held = (await doc.table.open()).rows.find((r) => r.Name?.label === 'Struct');
    expect(held?._lazy, 'Struct, its fields held back').toBe(true);
    const { rows } = await doc.table.children(held!.ID);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.UsedBy)).toEqual(rows.map(() => ({ blockLinks: [link('Gain')] })));
  });

  it("fills a reload's repaint from the graph as it is then", async () => {
    let users: Record<string, string[]> = { Kp: ['Gain'] };
    const doc = await workspace(source(async () => graphOf(users))).open(bytes('params.sldd'), 'params.sldd');
    await doc.table.open();
    const changes: TableChange[] = [];
    doc.table.subscribe((c) => changes.push(c));
    users = { Kp: ['Gain', 'Sum'] };
    await doc.reload(bytes('params.sldd'));
    expect(changes.map((c) => c.kind)).toEqual(['replaceAll']);
    const change = changes[0] as Extract<TableChange, { kind: 'replaceAll' }>;
    expect(usedBy(change.view.rows, 'Kp')).toEqual({ blockLinks: [link('Gain'), link('Sum')] });
  });

  it('leaves the cells as the file has them when there is no graph', async () => {
    const failing = source(() => Promise.reject(new Error('the folder is gone')));
    const filled = await workspace(failing).open(bytes('shared_gain.slx'), 'shared_gain.slx');
    const plain = await createWorkspace().open(bytes('shared_gain.slx'), 'shared_gain.slx');
    expect((await filled.table.open()).rows.map((r) => r.UsedBy)).toEqual((await plain.table.open()).rows.map((r) => r.UsedBy));
    plain.dispose();
  });

  it("fills a model's own variables and its blocks' parameters, over the files it reads", async () => {
    // A model and its dictionary, read by core: a block's parameter names its source, and the
    // dictionary's entry names the block, each by the file's uri.
    const model = 'file:///w/shadow_pair.slx';
    const graph = buildUsageGraph([
      { uriString: model, path: '/w/shadow_pair.slx', bytes: buffer('shadow_pair.slx') },
      { uriString: 'file:///w/shadow_first.sldd', path: '/w/shadow_first.sldd', bytes: buffer('shadow_first.sldd') },
      { uriString: 'file:///w/shadow_second.sldd', path: '/w/shadow_second.sldd', bytes: buffer('shadow_second.sldd') },
    ]);
    const ws = workspace({ graphFor: async () => graph });
    const doc = await ws.open(bytes('shadow_pair.slx'), 'shadow_pair.slx', model);
    const blockCells = (await doc.table.open()).rows.filter((r) => r._isBlockRow).map((r) => r.UsedBy);
    expect(blockCells.some((c) => typeof c === 'object' && c !== null && 'paramLinks' in c)).toBe(true);
    const dict = await ws.open(bytes('shadow_first.sldd'), 'shadow_first.sldd', 'file:///w/shadow_first.sldd');
    const users = (await dict.table.open()).rows.map((r) => r.UsedBy).filter((c) => typeof c === 'object' && c !== null);
    expect(users.length).toBeGreaterThan(0);
  });
});
