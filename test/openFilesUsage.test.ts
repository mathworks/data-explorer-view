// Copyright 2026 The MathWorks, Inc.
//
// The Usage column over the files a page has open, for a page with no folder shown
// (usage/openFilesUsage.ts): the same graphs a folder's session gives (UsageGraphs, core's usage
// index), over the bytes each tab holds rather than the files on disk. What this protects:
//
//   - the answers are the open files' and nobody else's: a dictionary's entries are used by the
//     blocks of the models that are open, and a model's parameters resolve to a dictionary only
//     once it is open (until then, as a folder that lacks the file answers, unresolved);
//   - a file opened, closed, saved or reloaded (new bytes) is a change, and the same bytes asked
//     again are not, so a keystroke or a repaint rebuilds nothing;
//   - a change owes a repaint to each open document whose column was last filled over other files
//     than are open now, once a burst of changes is over, and to nobody else: not to a document
//     never painted, nor to one closed, nor twice for one burst.
//
// Over the integration suite's usageorder folder: two models (ctrlA, plantB) sharing a dictionary.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, type TableChange } from '../src/model/index.js';
import { createOpenFilesUsage, type OpenFile } from '../src/model/usage/openFilesUsage.js';
import type { UsageRepostTimers } from '../src/model/usage/usageRepost.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';

const DIR = resolve(import.meta.dirname, '../test-integration/fixtures/usageorder');
const uriOf = (name: string): string => `file:///w/${name}`;
const DICT = uriOf('sharedParams.sldd');
const CTRL = uriOf('ctrlA.slx');
const PLANT = uriOf('plantB.slx');

/** A file as a tab holds it: the bytes read off disk, a new array for each read. */
const opened = (name: string): OpenFile => ({ uri: uriOf(name), path: `/w/${name}`, bytes: new Uint8Array(readFileSync(resolve(DIR, name))) });

/** Timers the test runs by hand: what is set waits for flush(). */
function handTimers(): UsageRepostTimers & { flush(): void; armed(): number } {
  let pending = new Map<number, () => void>();
  let next = 0;
  return {
    setTimeout(fn) {
      pending.set(++next, fn);
      return next;
    },
    clearTimeout(handle) {
      pending.delete(handle as number);
    },
    flush() {
      const due = [...pending.values()];
      pending = new Map();
      for (const fn of due) fn();
    },
    armed: () => pending.size,
  };
}

/** A usage over `files` (the test changes the list), its refills recorded. */
function usageOver(files: OpenFile[]) {
  const timers = handTimers();
  const refills: string[][] = [];
  const usage = createOpenFilesUsage({ files: () => files, refill: (uris) => void refills.push([...uris]), timers });
  return { usage, timers, refills };
}

const blockNames = (links: { blockName: string }[]): string[] => links.map((l) => l.blockName);

describe('the Usage column over the open files', () => {
  it("names the blocks of the open models that use a dictionary's entry, and only theirs", async () => {
    const files = [opened('sharedParams.sldd'), opened('ctrlA.slx')];
    const { usage } = usageOver(files);
    expect(blockNames((await usage.graphFor(DICT)).blocksUsing(DICT, 'SharedGain'))).toEqual(['GainA', 'LimitA']);
    // A second model opened: its blocks too, once the graph is asked again.
    files.push(opened('plantB.slx'));
    expect(blockNames((await usage.graphFor(DICT)).blocksUsing(DICT, 'SharedGain'))).toEqual(['GainA', 'LimitA', 'GainB']);
  });

  it("resolves a model's block parameter to an open dictionary by its uri, and while it is not open, to the dictionary the model names, by its name", async () => {
    const files = [opened('ctrlA.slx')];
    const { usage } = usageOver(files);
    // The graph itself, as a folder without the dictionary answers: unresolved.
    expect((await usage.graphs.graphFor(CTRL)).paramLinks(CTRL, '1')).toEqual([
      expect.objectContaining({ paramName: 'SharedGain', source: '', linkTarget: '' }),
    ]);
    // What the open files answer: the dictionary the model links, as the model names it, which a
    // click opens beside the model (as the prototype linked it).
    expect((await usage.graphFor(CTRL)).paramLinks(CTRL, '1')).toEqual([
      expect.objectContaining({ paramName: 'SharedGain', source: 'sharedParams.sldd', linkTarget: 'SharedGain@sharedParams.sldd' }),
    ]);
    files.push(opened('sharedParams.sldd'));
    expect((await usage.graphFor(CTRL)).paramLinks(CTRL, '1')).toEqual([
      expect.objectContaining({ paramName: 'SharedGain', source: 'sharedParams.sldd', linkTarget: `SharedGain@${DICT}` }),
    ]);
  });

  it("names no dictionary for a parameter its model's workspace holds", async () => {
    // shadow_ws's WsGain reads Kp, which its own workspace shadows: the workspace, never the dictionary.
    const shadow: OpenFile = {
      uri: 'file:///f/shadow_ws.slx',
      path: '/f/shadow_ws.slx',
      bytes: new Uint8Array(readFileSync(resolve(import.meta.dirname, 'fixtures/shadow_ws.slx'))),
    };
    const { usage } = usageOver([shadow]);
    const graph = await usage.graphFor(shadow.uri);
    const keys = ['1', '2'];
    expect(keys.map((key) => graph.paramLinks(shadow.uri, key).map((l) => `${l.paramName} ${l.source} ${l.linkTarget}`))).toEqual([
      [`Kp  workspace:Kp@${shadow.uri}`],
      ['Uo params.sldd Uo@params.sldd'],
    ]);
  });

  it('reads nothing a graph does not draw: a project open beside them is no candidate', async () => {
    const files: OpenFile[] = [opened('sharedParams.sldd'), opened('ctrlA.slx'), { uri: uriOf('p.prj'), path: '/w/p.prj', bytes: new Uint8Array([1, 2, 3]) }];
    const { usage } = usageOver(files);
    expect(blockNames((await usage.graphFor(DICT)).blocksUsing(DICT, 'SharedGain'))).toEqual(['GainA', 'LimitA']);
  });

  it('owes a repaint, once the burst is over, to each document filled over other files than are open now', async () => {
    const files = [opened('sharedParams.sldd'), opened('ctrlA.slx')];
    const { usage, timers, refills } = usageOver(files);
    await usage.graphFor(DICT);
    await usage.graphFor(CTRL);
    // Nothing changed since: nothing owed, and no window waited out.
    usage.changed();
    expect(timers.armed()).toBe(0);
    // Two files opened in one burst: one repaint each of the two filled before them, after it.
    files.push(opened('plantB.slx'));
    usage.changed();
    files.push({ uri: uriOf('more.mat'), path: '/w/more.mat', bytes: new Uint8Array(8) });
    usage.changed();
    expect(refills).toEqual([]);
    timers.flush();
    expect(refills).toEqual([[DICT, CTRL]]);
    // Owed once: a window with no change since owes nothing more.
    usage.changed();
    timers.flush();
    expect(refills).toHaveLength(1);
  });

  it('takes a document asked to repaint as answered over the files of the ask, its fill still to come', async () => {
    const files = [opened('sharedParams.sldd'), opened('ctrlA.slx')];
    // The refills are only recorded: no repaint runs, so no fill notes the files again.
    const { usage, timers, refills } = usageOver(files);
    await usage.graphFor(DICT);
    // plantB opened: the dictionary is asked, and counts from now as filled over the three.
    const plant = opened('plantB.slx');
    files.push(plant);
    usage.changed();
    timers.flush();
    expect(refills).toEqual([[DICT]]);
    // A second burst before that repaint's fill: plantB closed again. The files are the ones the
    // dictionary's last fill read, but not the ones it was last asked over, and its repaint may
    // read them as they were at the ask: asked again.
    files.pop();
    usage.changed();
    timers.flush();
    expect(refills).toEqual([[DICT], [DICT]]);
    // Its fill lands now, over the two: nothing more is owed.
    await usage.graphFor(DICT);
    usage.changed();
    timers.flush();
    expect(refills).toHaveLength(2);
  });

  it('owes nothing to a document never painted, nor to one closed since it was', async () => {
    const files = [opened('sharedParams.sldd'), opened('ctrlA.slx'), opened('plantB.slx')];
    const { usage, timers, refills } = usageOver(files);
    await usage.graphFor(DICT);
    await usage.graphFor(PLANT);
    // plantB closed; ctrlA, never painted, owes nothing.
    files.splice(2, 1);
    usage.changed();
    timers.flush();
    expect(refills).toEqual([[DICT]]);
  });

  it('takes a save or a reload (new bytes) for a change, the document itself owed one too, and the same bytes for none', async () => {
    const files = [opened('sharedParams.sldd'), opened('ctrlA.slx')];
    const { usage, timers, refills } = usageOver(files);
    await usage.graphFor(DICT);
    await usage.graphFor(CTRL);
    // The same bytes, in a list built again: no change.
    files.splice(0, 2, { ...files[0]! }, { ...files[1]! });
    usage.changed();
    expect(timers.armed()).toBe(0);
    // The model saved: its bytes are new. Its own column was filled from the bytes before.
    files[1] = opened('ctrlA.slx');
    usage.changed();
    timers.flush();
    expect(refills).toEqual([[DICT, CTRL]]);
  });

  it('owes nothing once disposed', async () => {
    const files = [opened('sharedParams.sldd')];
    const { usage, timers, refills } = usageOver(files);
    await usage.graphFor(DICT);
    files.push(opened('ctrlA.slx'));
    usage.changed();
    usage.dispose();
    timers.flush();
    usage.changed();
    timers.flush();
    expect(refills).toEqual([]);
  });
});

describe('a workspace whose Usage is its open files', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
  });
  const usedBy = (rows: readonly TreeTableRow[], name: string): string[] =>
    blockNames((rows.find((r) => r.Name?.label === name)?.UsedBy as { blockLinks?: { blockName: string }[] } | undefined)?.blockLinks ?? []);

  it("fills a dictionary's column from a model opened after it, once the repaint it is owed lands", async () => {
    const files: OpenFile[] = [];
    const timers = handTimers();
    const repainted: Promise<void>[] = [];
    const usage = createOpenFilesUsage({
      files: () => files,
      refill: (uris) => uris.forEach((uri) => repainted.push(ws.get(uri)?.repaint() ?? Promise.resolve())),
      timers,
    });
    // With `editing`, as the shell makes it: a JSON dictionary and an .slx are the editing engines'.
    const ws = createWorkspace({ editing: true, usage });
    cleanups.push(() => ws.dispose());
    const dictFile = opened('sharedParams.sldd');
    files.push(dictFile);
    const dict = await ws.open(dictFile.bytes, 'sharedParams.sldd', DICT);
    expect(usedBy((await dict.table.open()).rows, 'SharedGain')).toEqual([]);
    const heard: TableChange[] = [];
    dict.table.subscribe((change) => heard.push(change));

    const modelFile = opened('ctrlA.slx');
    files.push(modelFile);
    const model = await ws.open(modelFile.bytes, 'ctrlA.slx', CTRL);
    // The model's own first paint is over both files: its block reads the open dictionary.
    const block = (await model.table.open()).rows.find((r) => r._isBlockRow && r._blockKey === '1');
    expect(block?.UsedBy).toEqual({ paramLinks: [expect.objectContaining({ source: 'sharedParams.sldd', linkTarget: `SharedGain@${DICT}` })] });
    // Told of the change (the shell tells it on every refresh), it repaints the dictionary after the window.
    usage.changed();
    expect(heard).toEqual([]);
    timers.flush();
    await Promise.all(repainted);
    const painted = heard.filter((c): c is Extract<TableChange, { kind: 'replaceAll' }> => c.kind === 'replaceAll');
    expect(painted).toHaveLength(1);
    expect(usedBy(painted[0]!.view.rows, 'SharedGain')).toEqual(['GainA', 'LimitA']);
  });

  it('repaints an edited model when a usage source comes later (setUsage), as it does a dictionary', async () => {
    const ws = createWorkspace({ editing: true });
    cleanups.push(() => ws.dispose());
    const files = [opened('ctrlA.slx'), opened('sharedParams.sldd')];
    const model = await ws.open(files[0]!.bytes, 'ctrlA.slx', CTRL);
    expect(model.editable).toBe(true);
    await model.table.open();
    const heard: TableChange[] = [];
    model.table.subscribe((change) => heard.push(change));
    await ws.setUsage(createOpenFilesUsage({ files: () => files, refill: () => {} }));
    const painted = heard.filter((c): c is Extract<TableChange, { kind: 'replaceAll' }> => c.kind === 'replaceAll');
    expect(painted).toHaveLength(1);
    const block = painted[0]!.view.rows.find((r) => r._isBlockRow && r._blockKey === '1');
    expect(block?.UsedBy).toEqual({ paramLinks: [expect.objectContaining({ source: 'sharedParams.sldd', linkTarget: `SharedGain@${DICT}` })] });
  });
});
