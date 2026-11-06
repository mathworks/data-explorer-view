// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Usage column with no folder shown: answered over the open tabs (usage/openFilesUsage.ts), as
// the prototype answered it from its open files, where before a dictionary or a MAT-file opened
// outside a folder hid the column and a model's blocks named no source file. What this protects:
//
//   - every table shows the column with no folder shown, a dictionary's and a MAT-file's too;
//   - a dictionary's entries name the blocks of the open models that use them, a model opened or
//     closed after it included: its table is painted again once the burst is over;
//   - a model's blocks name the open dictionary their parameters come from, by its uri, once it is
//     open (until then, as a folder without it answers, they resolve to nothing), and a parameter
//     its own workspace shadows names that workspace, never the dictionary;
//   - a folder shown still wins: its usage fills the column from then on, and a file outside it
//     has none, as before.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceUri } from '../../src/model/source/sourceUri.js';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import { at, open, rowOf, serveFolderTo, startPage, tableOf, tempFolder, until } from './harness.js';

const DICT = sourceUri(at('params.sldd'));
const MODEL = sourceUri(at('shadow_ws.slx'));

/** The blocks a variable's Usage cell names, as `block (model)`, or the model's own as `block`. */
const usedBy = (row: TreeTableRow | undefined): string[] =>
  ((row?.UsedBy as { blockLinks?: { blockName: string; modelName: string }[] } | undefined)?.blockLinks ?? []).map((b) =>
    b.modelName ? `${b.blockName} (${b.modelName})` : b.blockName,
  );
/** A block's parameters, as its Usage cell names them: `Value=Uo (params.sldd) -> its link`. */
const paramsOf = (row: TreeTableRow | undefined): string[] =>
  ((row?.UsedBy as { paramLinks?: { property: string; paramName: string; source: string; linkTarget: string }[] } | undefined)?.paramLinks ?? []).map(
    (p) => `${p.property}=${p.paramName}${p.source ? ` (${p.source})` : ''} -> ${p.linkTarget}`,
  );
const rowNamed = (file: string, name: string) => tableOf(file)?.rows.find((r) => r.Name?.label === name);
const hasUsage = (table: DexTreeTable | null) => !!table?.columns?.includes('UsedBy');

describe('the Usage column with no folder shown', () => {
  it("shows a dictionary's and a MAT-file's column, filled from the open models", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => hasUsage(tableOf('params.sldd')) && hasUsage(tableOf('ParamMat.mat')));
    expect(usedBy(rowNamed('params.sldd', 'Uo'))).toEqual([]);

    // The model opened after the dictionary: the dictionary is painted again, its Uo read by DictOnly.
    await open(page, 'shadow_ws.slx');
    await until(() => usedBy(rowNamed('params.sldd', 'Uo')).length > 0);
    expect(usedBy(rowNamed('params.sldd', 'Uo'))).toEqual(['DictOnly (shadow_ws)']);
    // Kp is the model's workspace's, which shadows the dictionary's: no block reads this one.
    expect(usedBy(rowNamed('params.sldd', 'Kp'))).toEqual([]);
    expect(usedBy(rowNamed('shadow_ws.slx', 'Kp'))).toEqual(['WsGain']);
  });

  it("names the open dictionary a model's block reads, once it is open, and the workspace a parameter it shadows", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'shadow_ws.slx');
    await until(() => paramsOf(rowNamed('shadow_ws.slx', 'DictOnly')).length > 0);
    // The dictionary is not open: Uo resolves to nothing, as in a folder without the dictionary.
    expect(paramsOf(rowNamed('shadow_ws.slx', 'DictOnly'))).toEqual(['Value=Uo -> ']);
    expect(paramsOf(rowNamed('shadow_ws.slx', 'WsGain'))).toEqual([`Gain=Kp -> workspace:Kp@${MODEL}`]);

    // Opened: the model is painted again, its block naming the dictionary by its uri.
    await open(page, 'params.sldd');
    await until(() => paramsOf(rowNamed('shadow_ws.slx', 'DictOnly'))[0] !== 'Value=Uo -> ');
    expect(paramsOf(rowNamed('shadow_ws.slx', 'DictOnly'))).toEqual([`Value=Uo (params.sldd) -> Uo@${DICT}`]);
    expect(paramsOf(rowNamed('shadow_ws.slx', 'WsGain'))).toEqual([`Gain=Kp -> workspace:Kp@${MODEL}`]);
  });

  it('forgets a model closed: the dictionary it read is painted again without its blocks', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'params.sldd', 'shadow_ws.slx');
    await until(() => usedBy(rowNamed('params.sldd', 'Uo')).length > 0);
    page.command('close-tab');
    await until(() => !tableOf('shadow_ws.slx'));
    await until(() => usedBy(rowNamed('params.sldd', 'Uo')).length === 0);
  });

  it('a folder shown wins: its usage fills the column, and a file outside it shows none', async () => {
    const dir = tempFolder('plant', { 'params.sldd': 'params.sldd', 'shared_gain.slx': 'shared_gain.slx' });
    const page = startPage({ 'outside.sldd': 'params.sldd' });
    const read = page.host.readFile;
    page.host.readFile = async (p) => (p.startsWith(dir) ? new Uint8Array(readFileSync(p)) : read(p));
    await open(page, 'outside.sldd');
    await until(() => hasUsage(tableOf('outside.sldd')));
    const inside = path.join(dir, 'params.sldd');
    void page.handle.openPaths([inside]);
    const insideTable = () => document.querySelector<DexTreeTable>(`.doc-panel[data-path="${CSS.escape(inside)}"] dex-tree-table`);
    await until(() => (insideTable()?.rows.length ?? 0) > 0);
    serveFolderTo(page, dir);
    // The folder's own models (shared_gain.slx, not open) read the dictionary in it.
    await until(() => usedBy(insideTable()?.rows.find((r) => r.Name?.label === 'Kp')).length > 0);
    expect(usedBy(insideTable()!.rows.find((r) => r.Name?.label === 'Kp'))).toEqual(['PlantGain (shared_gain)', 'Trim (shared_gain)']);
    await until(() => !hasUsage(tableOf('outside.sldd')));
    await rowOf('outside.sldd', 'Kp');
  });
});
