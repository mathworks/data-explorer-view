// Copyright 2026 The MathWorks, Inc.
//
// UsageGraphs: the usage graph for each file being viewed, kept until the folder changes or the
// inputs do; and the repost hub, which holds the app's watch only while a data table is open and
// turns a model created or deleted into a dropped graph and one repost per table. Over the
// integration suite's usageorder folder (two models sharing a dictionary), read off disk by core's
// node reader with its reads counted. What the cells say is pinned against the extension's goldens
// (goldens/usage.test.ts, which fills through UsageGraphs).
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planSummaries, type SourceFile, type SourceReader } from 'data-explorer-core';
import { nodeSourceReader } from 'data-explorer-core/node';
import {
  buildUsageGraphFromSummaries,
  createUsageRepostHub,
  createWorkspace,
  USAGE_REPOST_DEBOUNCE_MS,
  UsageGraphs,
  type TableChange,
  type UsageInputs,
  type WatchModelSet,
} from '../src/model/index.js';
import { readFileSync } from 'node:fs';

const DIR = resolve(import.meta.dirname, '../test-integration/fixtures/usageorder');
const file = (name: string): SourceFile => ({ uriString: `file:///w/${name}`, path: `/w/${name}` });
const FOLDER = ['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map(file);
const DICT = file('sharedParams.sldd').uriString;
const CTRL = file('ctrlA.slx').uriString;
const onDisk = (f: SourceFile): string => join(DIR, f.path.slice('/w/'.length));

let listed: readonly SourceFile[];
let key: string;
let reads: string[];
let lists: number;

function inputs(): UsageInputs {
  return {
    inputsKey: () => key,
    candidates: async () => {
      lists++;
      return listed;
    },
    readerFor: (files): SourceReader => {
      const r = nodeSourceReader(files, { pathOf: onDisk });
      return { version: r.version, bytes: async (f) => (reads.push(f.path), r.bytes(f)) };
    },
  };
}

const names = (links: { blockName: string }[]): string[] => links.map((l) => l.blockName);

beforeEach(() => {
  listed = FOLDER;
  key = '';
  reads = [];
  lists = 0;
});

describe('the usage graphs', () => {
  it('answers who uses a variable, across the models of the folder', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    expect(names(await graphs.blocksUsingVariable(DICT, 'SharedGain'))).toEqual(['GainA', 'LimitA', 'GainB']);
  });

  it('answers what the whole folder answers, scoped to the file asked about', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    const whole = buildUsageGraphFromSummaries(await planSummaries(graphs.cache, nodeSourceReader(FOLDER, { pathOf: onDisk }), FOLDER, null));
    expect((await graphs.ensure(DICT)).blocksUsing(DICT, 'SharedGain')).toEqual(whole.blocksUsing(DICT, 'SharedGain'));
    // Each model's first block (SID 1), whose parameter reads the shared dictionary.
    for (const model of [CTRL, file('plantB.slx').uriString]) {
      const links = (await graphs.ensure(model)).paramLinks(model, '1');
      expect(links.length, model).toBeGreaterThan(0);
      expect(links).toEqual(whole.paramLinks(model, '1'));
    }
  });

  it('builds a graph once per file, and again only after invalidate()', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    const first = await graphs.ensure(DICT);
    expect(await graphs.ensure(DICT)).toBe(first);
    expect(lists).toBe(1);
    graphs.invalidate();
    expect(await graphs.ensure(DICT)).not.toBe(first);
    expect(lists).toBe(2);
  });

  it('reads nothing again on a rebuild whose files have not changed', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    await graphs.ensure(DICT);
    expect(reads.length).toBeGreaterThan(0);
    reads = [];
    graphs.invalidate();
    await graphs.ensure(DICT);
    // The models are parsed for their summaries, which the cache keeps: a rebuild stats and reuses.
    expect(reads).toEqual([]);
  });

  it('drops every graph when the inputs are not the ones they were built from', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    const first = await graphs.ensure(DICT);
    key = 'another open file';
    expect(await graphs.ensure(DICT)).not.toBe(first);
    // The same inputs again: kept.
    const second = await graphs.ensure(DICT);
    expect(await graphs.ensure(DICT)).toBe(second);
  });

  it('fills a data view now only from the graph built for that file', async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    const rows = () => [{ Name: { label: 'SharedGain' }, UsedBy: '' as unknown }] as any[];
    expect(graphs.annotateDataRowsNow(DICT, rows())).toBe(false);
    await graphs.ensure(CTRL);
    // Another file's graph is not this one's.
    expect(graphs.annotateDataRowsNow(DICT, rows())).toBe(false);
    await graphs.ensure(DICT);
    const filled = rows();
    expect(graphs.annotateDataRowsNow(DICT, filled)).toBe(true);
    expect(names(filled[0].UsedBy.blockLinks)).toEqual(['GainA', 'LimitA', 'GainB']);
  });

  it('does not publish a graph built before an invalidate', async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const slow = { ...inputs(), candidates: async () => (await gate, listed) };
    const graphs = new UsageGraphs({ inputs: slow });
    const building = graphs.ensure(DICT);
    graphs.invalidate();
    release();
    await building;
    expect(graphs.annotateDataRowsNow(DICT, [])).toBe(false);
  });

  it('builds again after a build that failed', async () => {
    let fail = true;
    const flaky = { ...inputs(), candidates: async () => (fail ? Promise.reject(new Error('no folder')) : listed) };
    const graphs = new UsageGraphs({ inputs: flaky });
    await expect(graphs.ensure(DICT)).rejects.toThrow('no folder');
    fail = false;
    expect(names((await graphs.ensure(DICT)).blocksUsing(DICT, 'SharedGain'))).toEqual(['GainA', 'LimitA', 'GainB']);
  });

  it("is a workspace's usage source", async () => {
    const graphs = new UsageGraphs({ inputs: inputs() });
    const ws = createWorkspace({ usage: graphs });
    try {
      const doc = await ws.open(new Uint8Array(readFileSync(join(DIR, 'sharedParams.sldd'))), 'sharedParams.sldd', DICT);
      const row = (await doc.table.open()).rows.find((r) => r.Name?.label === 'SharedGain');
      expect(names((row?.UsedBy as any).blockLinks)).toEqual(['GainA', 'LimitA', 'GainB']);
    } finally {
      ws.dispose();
    }
  });
});

describe('the repost hub', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A watch the test drives: `emit(path)` is the folder telling it a file came or went. */
  function watching() {
    const state = { started: 0, stopped: 0, emit: (_path: string) => {} };
    const watch: WatchModelSet = (changed) => {
      state.started++;
      state.emit = changed;
      return { dispose: () => void state.stopped++ };
    };
    return { state, watch };
  }

  it('watches only while a table is subscribed', () => {
    const { state, watch } = watching();
    const hub = createUsageRepostHub({ watch });
    expect(state.started).toBe(0);
    const a = hub.subscribe(() => {});
    const b = hub.subscribe(() => {});
    expect(state.started).toBe(1);
    a.dispose();
    a.dispose();
    expect(state.stopped).toBe(0);
    b.dispose();
    expect(state.stopped).toBe(1);
    hub.subscribe(() => {}).dispose();
    expect([state.started, state.stopped]).toEqual([2, 2]);
  });

  it('drops the graphs and reposts each table once for a burst of models, and not for other files', () => {
    const { state, watch } = watching();
    const graphs = { invalidate: vi.fn() };
    const hub = createUsageRepostHub({ watch, graphs });
    const repost = vi.fn();
    hub.subscribe(repost);
    state.emit('/w/params.sldd');
    vi.advanceTimersByTime(USAGE_REPOST_DEBOUNCE_MS * 2);
    expect(graphs.invalidate).not.toHaveBeenCalled();
    expect(repost).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) {
      state.emit(`/w/m${i}.SLX`);
      vi.advanceTimersByTime(USAGE_REPOST_DEBOUNCE_MS / 2);
    }
    expect(graphs.invalidate).toHaveBeenCalledTimes(20);
    expect(repost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(USAGE_REPOST_DEBOUNCE_MS);
    expect(repost).toHaveBeenCalledTimes(1);
  });

  it("repaints an open data document's table, refilled from the graphs as they are now", async () => {
    vi.useRealTimers();
    const { state, watch } = watching();
    const graphs = new UsageGraphs({ inputs: inputs() });
    const hub = createUsageRepostHub({ watch, graphs, delayMs: 1 });
    const ws = createWorkspace({ usage: graphs, usageReposts: hub });
    try {
      const doc = await ws.open(new Uint8Array(readFileSync(join(DIR, 'sharedParams.sldd'))), 'sharedParams.sldd', DICT);
      expect(state.started).toBe(1);
      await doc.table.open();
      const changes: TableChange[] = [];
      const repainted = new Promise<void>((done) => doc.table.subscribe((c) => (changes.push(c), done())));
      // plantB is deleted from the folder.
      listed = FOLDER.filter((f) => !f.path.endsWith('plantB.slx'));
      state.emit('/w/plantB.slx');
      await repainted;
      expect(changes.map((c) => c.kind)).toEqual(['replaceAll']);
      const view = (changes[0] as Extract<TableChange, { kind: 'replaceAll' }>).view;
      const row = view.rows.find((r) => r.Name?.label === 'SharedGain');
      expect(names((row?.UsedBy as any).blockLinks)).toEqual(['GainA', 'LimitA']);
      // A model's own table takes no repost: it holds no subscription of its own.
      await ws.open(new Uint8Array(readFileSync(join(DIR, 'ctrlA.slx'))), 'ctrlA.slx', CTRL);
      doc.dispose();
      expect(state.stopped).toBe(1);
    } finally {
      ws.dispose();
    }
  });
});
