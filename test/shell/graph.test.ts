// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The relationship graph, connected: the Explorer's Root shows it in the center while files are
// open (the welcome while none is), built from every open file's bytes (what the host read, and
// after a save what was saved) and the shown folder's files, and built again, shortly after the
// first change, as files open, close and are saved and the folder changes. A double-click opens a box's file (an item's on its row) in a
// preview tab; a box for a file referenced and not open is resolved as a link would be, through the
// folder, or said not to be open. A box's +/− shows or hides its items. A table's menu offers Show
// in Graph, and the palette Show Graph.
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choose, dirtyTabs, docTabs, edit, fixture, graph, graphShown, menuOn, open, previewTabs, rowOf, serveFolderTo, settled, startPage, tabIdOf, tabNames, tableOf, tempFolder, toastTexts, until, welcomeShown } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
  vi.restoreAllMocks();
});

const FILES = { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' };
const boxes = () => (graph().graph?.boxes ?? []).map((b) => (b.ghost ? `ghost ${b.ref}` : b.label));
const itemsOf = (label: string) => (graph().graph?.boxes.find((b) => b.label === label)?.items ?? []).map((i) => i.name);
const root = () => document.querySelector('dex-explorer')!.dispatchEvent(new CustomEvent('dex-explorer-open', { detail: { fileId: null, pin: false }, bubbles: true, composed: true }));
const graphOpen = (detail: object) => graph().dispatchEvent(new CustomEvent('dex-graph-open', { detail, bubbles: true, composed: true }));
const closeTab = (name: string) => docTabs().dispatchEvent(new CustomEvent('dex-tab-close', { detail: { id: tabIdOf(name) }, bubbles: true, composed: true }));
const selectTab = (name: string) => docTabs().dispatchEvent(new CustomEvent('dex-tab-select', { detail: { id: tabIdOf(name) }, bubbles: true, composed: true }));

describe('the relationship graph', () => {
  it('is what Root shows while files are open, built from them; the welcome while none is', async () => {
    const page = startPage(FILES);
    await until(welcomeShown);
    expect(graphShown()).toBe(false);
    await open(page, 'params.sldd', 'shadow_ws.slx');
    root();
    await until(() => graphShown() && boxes().length === 2);
    expect(welcomeShown()).toBe(false);
    expect(boxes().sort()).toEqual(['params.sldd', 'shadow_ws.slx']);
    // The model's DictOnly block reads the dictionary's Uo (its WsGain, Kp, from its own workspace).
    expect(itemsOf('params.sldd')).toEqual(['Uo']);
    // A file closed leaves it, a build later: the model's reference to it is a box of its own.
    closeTab('params.sldd');
    await until(() => tabNames().join() === 'shadow_ws.slx');
    root();
    await until(() => boxes().sort().join() === 'ghost params.sldd,shadow_ws.slx');
    closeTab('shadow_ws.slx');
    await until(() => tabNames().length === 0);
    await until(welcomeShown);
    expect(graphShown()).toBe(false);
  });

  it('draws what the host read until a save, and then what was saved', async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'params.sldd');
    await edit('params.sldd', 'Uo', 'Uq', 'Name');
    await until(() => dirtyTabs().length === 1);
    root();
    await until(() => itemsOf('params.sldd').includes('Uo'));
    selectTab('params.sldd');
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    root();
    await until(() => boxes().includes('params.sldd') && !itemsOf('params.sldd').includes('Uo'));
  });

  it("takes in the folder's files too", async () => {
    const dir = tempFolder('plant', { ...FILES, 'shared_gain.slx': 'shared_gain.slx' });
    const page = startPage();
    page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
    stop.push(serveFolderTo(page, dir).dispose);
    void page.handle.openPaths([path.join(dir, 'params.sldd')]);
    await until(() => tabNames().length === 1);
    root();
    await until(() => boxes().includes('shared_gain.slx') && boxes().includes('shadow_ws.slx'));
  });

  it('is built again as the folder shown changes: a file written into it is a box of its own', async () => {
    const dir = tempFolder('plant', FILES);
    const page = startPage();
    page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
    const served = serveFolderTo(page, dir);
    stop.push(served.dispose);
    void page.handle.openPaths([path.join(dir, 'params.sldd')]);
    await until(() => tabNames().length === 1);
    root();
    await until(() => boxes().includes('shadow_ws.slx'));
    copyFileSync(fixture('shared_gain.slx'), path.join(dir, 'new_gain.slx'));
    served.changed();
    await until(() => boxes().includes('new_gain.slx'));
  });

  it("opens a box's file, an item's on its row, in a preview tab", async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'params.sldd');
    root();
    await until(() => boxes().includes('params.sldd'));
    const params = graph().graph!.boxes.find((b) => b.label === 'params.sldd')!;
    closeTab('params.sldd');
    await until(() => tabNames().join() === 'shadow_ws.slx');
    graphOpen({ uri: params.uri, name: 'Kp' });
    await until(() => previewTabs().join() === 'params.sldd');
    const kp = await rowOf('params.sldd', 'Kp');
    await until(() => tableOf('params.sldd')!.selectedRowIds.join() === kp.ID);
  });

  it('says a box for a file not open is not, where there is no folder to look in', async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx');
    root();
    await until(() => boxes().includes('ghost params.sldd'));
    graphOpen({ uri: '', ref: 'params.sldd' });
    await until(() => toastTexts().includes('params.sldd is not open'));
  });

  it('opens a box for a file not open from the folder, as a link to it would', async () => {
    const dir = tempFolder('work', { 'models/shadow_ws.slx': 'shadow_ws.slx', 'data/params.sldd': 'params.sldd' });
    const page = startPage();
    page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
    stop.push(serveFolderTo(page, dir).dispose);
    void page.handle.openPaths([path.join(dir, 'models', 'shadow_ws.slx')]);
    await until(() => tabNames().join() === 'shadow_ws.slx');
    root();
    // The folder's file, drawn from the folder; its ref resolved through the folder's tree.
    await until(() => boxes().length > 0);
    graphOpen({ uri: '', ref: 'params.sldd' });
    await until(() => previewTabs().join() === 'params.sldd');
  });

  it("shows and hides a box's items as it asks", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'shadow_ws.slx');
    root();
    await until(() => boxes().length === 2);
    const id = graph().graph!.boxes[0]!.id;
    graph().dispatchEvent(new CustomEvent('dex-graph-expand', { detail: { id, expanded: true }, bubbles: true, composed: true }));
    expect(graph().expanded).toEqual([id]);
    graph().dispatchEvent(new CustomEvent('dex-graph-expand', { detail: { id, expanded: false }, bubbles: true, composed: true }));
    expect(graph().expanded).toEqual([]);
  });

  it("is where a table's Show in Graph goes, on the row's item", async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'params.sldd');
    const reveal = vi.spyOn(graph(), 'reveal');
    expect((await menuOn('params.sldd', 'Uo')).map((i) => i.id)).toContain('showInGraph');
    choose('showInGraph');
    await until(() => graphShown() && reveal.mock.calls.length === 1);
    const params = graph().graph!.boxes.find((b) => b.label === 'params.sldd')!;
    const uo = params.items.find((i) => i.name === 'Uo')!;
    expect(reveal.mock.calls[0]![0]).toBe(uo.id);
    // Selected, in its box opened to show it.
    expect(graph().selected).toBe(uo.id);
    expect(graph().expanded).toEqual([params.id]);
  });

  it("is where a model's External Data row's Show in Graph goes, on the file it names", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'shadow_ws.slx');
    const reveal = vi.spyOn(graph(), 'reveal');
    await menuOn('shadow_ws.slx', 'params.sldd');
    choose('showInGraph');
    await until(() => graphShown() && reveal.mock.calls.length === 1);
    const params = graph().graph!.boxes.find((b) => b.label === 'params.sldd')!;
    expect(reveal.mock.calls[0]![0]).toBe(params.id);
  });

  it('is shown by the Show Graph command, as the palette lists it', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.command('show-graph');
    await until(graphShown);
    await settled();
    expect(welcomeShown()).toBe(false);
  });
});
