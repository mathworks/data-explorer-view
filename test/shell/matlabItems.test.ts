// Copyright 2026 The MathWorks, Inc.
//
// What the shell makes of a MATLAB its host reaches (src/widgets/app-shell/connect/matlab.ts), the
// pure part: what the status bar says of each status; what a row (or a file) is to MATLAB, and
// which of MATLAB's commands it is offered, in what order and under what label, waiting for a save
// where MATLAB reads or writes the saved file; what each command sends and what it says; and an
// evaluation kept for Properties while the row's value is still the one asked about. A MATLAB busy
// running something answers once it is done, which the bar says rather than leave the user to think
// the link is gone. Nothing here runs a MATLAB: the host is test/shell/matlabHost.ts's fake.
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import type { InspectorFeed, InspectorView } from '../../src/model/source/tableSource.js';
import {
  isMatlabAction,
  MATLAB_ACTIONS,
  matlabGroup,
  matlabLabel,
  matlabMenuItems,
  matlabOffers,
  matlabPaletteCommands,
  MatlabResults,
  matlabTargetOf,
  runMatlab,
  withMatlabResults,
  type MatlabOffer,
  type MatlabRunContext,
  type MatlabTarget,
} from '../../src/widgets/app-shell/connect/matlab.js';
import type { MatlabEvaluation, MatlabStatus } from '../../src/widgets/app-shell/connect/types.js';
import { CONNECTED, fakeMatlab, type FakeMatlab } from './matlabHost.js';

describe('matlabLabel', () => {
  it('says nothing with no MATLAB, or none connected', () => {
    expect(matlabLabel(undefined)).toEqual({ label: '', title: '' });
    expect(matlabLabel({ state: 'off' })).toEqual({ label: '', title: '' });
  });

  it('names the MATLAB connected, and its process in the tooltip', () => {
    expect(matlabLabel({ ...CONNECTED, pid: 47857 })).toEqual({ label: 'MATLAB R2027a', title: 'Connected to MATLAB R2027a (process 47857)' });
  });

  it('says when it is busy, and that it answers once it is done', () => {
    expect(matlabLabel({ ...CONNECTED, busy: true })).toEqual({
      label: 'MATLAB R2027a (busy)',
      title: 'MATLAB R2027a is running something and answers once it is done',
    });
  });
});

// --- Rows, as the shell's tables hold them (a dictionary's, a model's, a MAT-file's) ---------------

/** A row: its id, parent, name and Value cell, and what else it holds. */
const row = (ID: string, parent: string | null, label: string, Value: TreeTableRow['Value'] = '', more: Partial<TreeTableRow> = {}): TreeTableRow =>
  ({ ID, parent, Name: { label }, Value, ...more }) as TreeTableRow;

const DICT = { path: '/work/plant.sldd', name: 'plant.sldd', doc: { kind: 'dictionary', uri: 'file://work/plant.sldd' } };
const DICT_ROWS = [
  row('section:design', null, 'Design Data'),
  row('file://work/plant.sldd/design/Kp', 'section:design', 'Kp', { text: ' 1.5 ', editable: true }),
  row('file://work/plant.sldd/design/Kp/Min', 'file://work/plant.sldd/design/Kp', 'Min', '0'),
  row('file://work/plant.sldd/design/Big', 'section:design', 'Big', '<10x10 double>'),
  row('file://work/plant.sldd/design/Empty', 'section:design', 'Empty', ''),
  row('section:other', null, 'Other Data'),
  row('section:arch', null, 'Architectural Data'),
  row('file://work/plant.sldd/arch/Iface', 'section:arch', 'Iface', ''),
  row('file://work/plant.sldd/arch/Width', 'section:arch', 'Width', '4'),
  row('section:config', null, 'Configurations'),
  row('file://work/plant.sldd/config/Fast', 'section:config', 'Fast', ''),
  row('file://work/plant.sldd/config/My Config', 'section:config', 'My Config', ''),
];
const MODEL = { path: '/work/plant.slx', name: 'plant.slx', doc: { kind: 'model', uri: 'file://work/plant.slx' } };
const MODEL_ROWS = [
  row('section:blocks', null, 'Model Elements'),
  row('file://work/plant.slx/blocks/7', 'section:blocks', 'Gain', '', { _blockPath: 'Sub/Gain' }),
  row('section:workspace', null, 'Model Workspace'),
  row('file://work/plant.slx/workspace/k', 'section:workspace', 'k', '5'),
  row('section:dataSources', null, 'External Data'),
  row('file://work/plant.slx/dataSources/plant.sldd@plant.sldd', 'section:dataSources', 'plant.sldd', { text: 'plant.sldd', linkTarget: 'plant.sldd' }),
];
const MAT = { path: '/work/ParamMat.mat', name: 'ParamMat.mat', doc: { kind: 'mat', uri: 'file://work/ParamMat.mat' } };
const MAT_ROWS = [
  row('binedit:file://work/ParamMat.mat/gain', null, 'gain', '[1 2 3]'),
  row('binedit:file://work/ParamMat.mat/gain/Value/1', 'binedit:file://work/ParamMat.mat/gain', 'Value(1,1)', '1'),
];

const KP = 'file://work/plant.sldd/design/Kp';
const target = (tab: Parameters<typeof matlabTargetOf>[0], rows: readonly TreeTableRow[], rowId: string | null) => matlabTargetOf(tab, rows, rowId)!;

describe('matlabTargetOf', () => {
  it("takes a dictionary's entry as its entry, in its section by the section's label, with its value", () => {
    expect(target(DICT, DICT_ROWS, KP)).toEqual({
      file: '/work/plant.sldd',
      fileName: 'plant.sldd',
      kind: 'dictionary',
      dirty: false,
      docUri: 'file://work/plant.sldd',
      rowId: KP,
      entry: { name: 'Kp', section: 'Design Data' },
      value: '1.5',
    });
  });

  it('takes a field of an entry as a value only, and a section row as neither', () => {
    const field = target(DICT, DICT_ROWS, 'file://work/plant.sldd/design/Kp/Min');
    expect([field.entry, field.value]).toEqual([undefined, '0']);
    const section = target(DICT, DICT_ROWS, 'section:design');
    expect([section.rowId, section.entry, section.value, section.block]).toEqual(['section:design', undefined, undefined, undefined]);
  });

  it('takes no value MATLAB could not evaluate: a summary, or nothing', () => {
    expect(target(DICT, DICT_ROWS, 'file://work/plant.sldd/design/Big').value).toBeUndefined();
    expect(target(DICT, DICT_ROWS, 'file://work/plant.sldd/design/Empty').value).toBeUndefined();
    expect(target(DICT, DICT_ROWS, 'file://work/plant.sldd/design/Big').entry).toEqual({ name: 'Big', section: 'Design Data' });
  });

  it("takes a MAT-file's variable as an entry of no section, and its element as a value only", () => {
    expect(target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain')).toMatchObject({ kind: 'mat', entry: { name: 'gain', section: '' }, value: '[1 2 3]' });
    expect(target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain/Value/1')).toMatchObject({ value: '1' });
    expect(target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain/Value/1').entry).toBeUndefined();
  });

  it("takes a model's block by its path below the root, and its workspace's variable as an entry of Model Workspace", () => {
    const block = target(MODEL, MODEL_ROWS, 'file://work/plant.slx/blocks/7');
    expect(block).toMatchObject({ kind: 'model', modelName: 'plant', block: 'Sub/Gain' });
    expect([block.entry, block.value]).toEqual([undefined, undefined]);
    expect(target(MODEL, MODEL_ROWS, 'file://work/plant.slx/workspace/k')).toMatchObject({ entry: { name: 'k', section: 'Model Workspace' }, value: '5' });
  });

  it("takes a link to another file as neither a value nor an entry: it names that file (a model's data source)", () => {
    const link = target(MODEL, MODEL_ROWS, 'file://work/plant.slx/dataSources/plant.sldd@plant.sldd');
    expect([link.value, link.entry]).toEqual([undefined, undefined]);
  });

  it('takes no entry by a name MATLAB has no variable of (a config set named with a space)', () => {
    expect(target(DICT, DICT_ROWS, 'file://work/plant.sldd/config/My Config').entry).toBeUndefined();
    expect(target(DICT, DICT_ROWS, 'file://work/plant.sldd/config/Fast').entry).toEqual({ name: 'Fast', section: 'Configurations' });
  });

  it('takes no entry under a section row the table does not hold', () => {
    const rows = DICT_ROWS.filter((r) => r.ID !== 'section:design');
    expect(target(DICT, rows, KP).entry).toBeUndefined();
    expect(target(DICT, rows, KP).value).toBe('1.5');
  });

  it('takes the file itself with no row, and says whether the tab holds unsaved edits', () => {
    const file = target({ ...MODEL, dirty: true }, MODEL_ROWS, null);
    expect(file).toEqual({ file: '/work/plant.slx', fileName: 'plant.slx', modelName: 'plant', kind: 'model', dirty: true, docUri: 'file://work/plant.slx' });
  });

  it('is nothing for a project, or a tab whose file is not read yet', () => {
    expect(matlabTargetOf({ path: '/work/p/matlab.toml', name: 'p', doc: { kind: 'project', uri: 'file://work/p/matlab.toml' } }, [], null)).toBeUndefined();
    expect(matlabTargetOf({ path: '/work/plant.sldd', name: 'plant.sldd' }, [], null)).toBeUndefined();
  });
});

const ids = (offers: MatlabOffer[]) => offers.map((o) => o.id);
const labels = (offers: MatlabOffer[]) => offers.map((o) => o.label);

describe('matlabOffers', () => {
  it('offers nothing with no MATLAB connected, or nothing to offer it', () => {
    expect(matlabOffers(undefined, target(DICT, DICT_ROWS, KP))).toEqual([]);
    expect(matlabOffers({ state: 'off' }, target(DICT, DICT_ROWS, KP))).toEqual([]);
    expect(matlabOffers(CONNECTED, undefined)).toEqual([]);
  });

  it("offers a dictionary's entry Evaluate, Send, Get and the Data Explorer, in that order", () => {
    expect(matlabOffers(CONNECTED, target(DICT, DICT_ROWS, KP))).toEqual([
      { id: 'matlab-evaluate', label: 'Evaluate in MATLAB' },
      { id: 'matlab-to-workspace', label: 'Send to Workspace', icon: 'matlabWorkspaceFile' },
      { id: 'matlab-from-workspace', label: 'Get from Workspace', icon: 'matlabWorkspaceFile' },
      { id: 'matlab-data-explorer', label: "Open in MATLAB's Data Explorer" },
    ]);
  });

  it('offers a model Open in Simulink and Update Diagram first, and its workspace variable Send but not Get', () => {
    expect(matlabOffers(CONNECTED, target(MODEL, MODEL_ROWS, 'file://work/plant.slx/blocks/7'))).toEqual([
      { id: 'matlab-open', label: 'Open in Simulink', icon: 'simulink' },
      { id: 'matlab-update-diagram', label: 'Update Diagram', icon: 'simulink' },
      { id: 'matlab-data-explorer', label: "Open in MATLAB's Data Explorer" },
    ]);
    expect(ids(matlabOffers(CONNECTED, target(MODEL, MODEL_ROWS, 'file://work/plant.slx/workspace/k')))).toEqual([
      'matlab-open',
      'matlab-update-diagram',
      'matlab-evaluate',
      'matlab-to-workspace',
      'matlab-data-explorer',
    ]);
  });

  it("offers a MAT-file's variable Evaluate, Send, Get and the Data Explorer, and a field of it Evaluate", () => {
    expect(ids(matlabOffers(CONNECTED, target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain')))).toEqual([
      'matlab-evaluate',
      'matlab-to-workspace',
      'matlab-from-workspace',
      'matlab-data-explorer',
    ]);
    expect(ids(matlabOffers(CONNECTED, target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain/Value/1')))).toEqual(['matlab-evaluate', 'matlab-data-explorer']);
  });

  it('offers the file itself what takes no row', () => {
    expect(ids(matlabOffers(CONNECTED, target(MODEL, MODEL_ROWS, null)))).toEqual(['matlab-open', 'matlab-update-diagram', 'matlab-data-explorer']);
    expect(ids(matlabOffers(CONNECTED, target(DICT, DICT_ROWS, null)))).toEqual(['matlab-data-explorer']);
  });

  it('hides what needs Simulink from a MATLAB without it: a model\'s, a dictionary\'s workspace commands and Explorer', () => {
    const plain: MatlabStatus = { ...CONNECTED, simulink: false };
    expect(ids(matlabOffers(plain, target(MODEL, MODEL_ROWS, 'file://work/plant.slx/workspace/k')))).toEqual(['matlab-evaluate']);
    expect(ids(matlabOffers(plain, target(DICT, DICT_ROWS, KP)))).toEqual(['matlab-evaluate']);
    expect(ids(matlabOffers(plain, target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain')))).toEqual([
      'matlab-evaluate',
      'matlab-to-workspace',
      'matlab-from-workspace',
      'matlab-data-explorer',
    ]);
  });

  it('says Open in Model Explorer for a MATLAB with no Data Explorer, which opens no MAT-file', () => {
    const older: MatlabStatus = { ...CONNECTED, dataExplorer: false };
    expect(labels(matlabOffers(older, target(DICT, DICT_ROWS, KP))).at(-1)).toBe('Open in Model Explorer');
    expect(labels(matlabOffers(older, target(MODEL, MODEL_ROWS, null))).at(-1)).toBe('Open in Model Explorer');
    expect(ids(matlabOffers(older, target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain')))).not.toContain('matlab-data-explorer');
  });

  it("offers no Send or Get for a dictionary section MATLAB does not move entries in (Architectural Data)", () => {
    expect(ids(matlabOffers(CONNECTED, target(DICT, DICT_ROWS, 'file://work/plant.sldd/arch/Iface')))).toEqual(['matlab-data-explorer']);
  });

  it('waits for a save before Send and Get, which read and write the saved file, and says why', () => {
    const offers = matlabOffers(CONNECTED, target({ ...DICT, dirty: true }, DICT_ROWS, KP));
    expect(offers.find((o) => o.id === 'matlab-to-workspace')).toMatchObject({ disabled: true, reason: 'Save the file first: MATLAB reads the saved file.' });
    expect(offers.find((o) => o.id === 'matlab-from-workspace')).toMatchObject({ disabled: true, reason: 'Save the file first: MATLAB writes the saved file.' });
    expect(offers.filter((o) => o.disabled).map((o) => o.id)).toEqual(['matlab-to-workspace', 'matlab-from-workspace']);
  });

  it('knows its six commands, and no other', () => {
    expect(MATLAB_ACTIONS).toEqual(['matlab-open', 'matlab-update-diagram', 'matlab-evaluate', 'matlab-to-workspace', 'matlab-from-workspace', 'matlab-data-explorer']);
    expect(MATLAB_ACTIONS.every(isMatlabAction)).toBe(true);
    expect(['matlab-connect', 'save', 'showInGraph'].some(isMatlabAction)).toBe(false);
  });
});

describe('matlabMenuItems and matlabPaletteCommands', () => {
  const offers = matlabOffers(CONNECTED, target({ ...DICT, dirty: true }, DICT_ROWS, KP));

  it('adds no item for no offer, and a separator before the offers', () => {
    expect(matlabMenuItems([])).toEqual([]);
    const items = matlabMenuItems(offers);
    expect(items[0]).toMatchObject({ separator: true });
    expect(items.slice(1)).toEqual([
      { id: 'matlab-evaluate', label: 'Evaluate in MATLAB' },
      { id: 'matlab-to-workspace', label: 'Send to Workspace', icon: 'matlabWorkspaceFile', disabled: true, reason: 'Save the file first: MATLAB reads the saved file.' },
      { id: 'matlab-from-workspace', label: 'Get from Workspace', icon: 'matlabWorkspaceFile', disabled: true, reason: 'Save the file first: MATLAB writes the saved file.' },
      { id: 'matlab-data-explorer', label: "Open in MATLAB's Data Explorer" },
    ]);
  });

  it("puts Connect to MATLAB… first in the palette's MATLAB group, for a host with a MATLAB", () => {
    expect(matlabPaletteCommands(true, [])).toEqual([{ id: 'matlab-connect', label: 'Connect to MATLAB…', category: 'MATLAB' }]);
    expect(matlabPaletteCommands(false, offers)).toEqual([
      { id: 'matlab-evaluate', label: 'Evaluate in MATLAB', category: 'MATLAB' },
      { id: 'matlab-to-workspace', label: 'Send to Workspace', category: 'MATLAB', disabled: true },
      { id: 'matlab-from-workspace', label: 'Get from Workspace', category: 'MATLAB', disabled: true },
      { id: 'matlab-data-explorer', label: "Open in MATLAB's Data Explorer", category: 'MATLAB' },
    ]);
    expect(matlabPaletteCommands(true, offers).map((c) => c.id)[0]).toBe('matlab-connect');
  });
});

// --- What each command sends and says ----------------------------------------------------------

/** A run's context over `matlab`, recording what it says, logs, keeps and brings forward. */
function context(matlab: FakeMatlab) {
  const said: [string, string, number?][] = [];
  const logged: [string, string][] = [];
  const kept: [MatlabTarget, MatlabEvaluation][] = [];
  let shown = 0;
  const on: MatlabRunContext = {
    matlab,
    say: (level, text, ms) => void said.push(ms === undefined ? [level, text] : [level, text, ms]),
    log: (level, text) => void logged.push([level, text]),
    evaluated: (t, answer) => void kept.push([t, answer]),
    showProperties: () => void shown++,
  };
  return { on, said, logged, kept, shown: () => shown };
}
const sent = (matlab: FakeMatlab) => matlab.calls.filter((c) => c.name !== 'showConnect');

describe('runMatlab', () => {
  it('opens a model in Simulink, at the block', async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    await runMatlab('matlab-open', target(MODEL, MODEL_ROWS, 'file://work/plant.slx/blocks/7'), run.on);
    await runMatlab('matlab-open', target(MODEL, MODEL_ROWS, null), run.on);
    expect(sent(matlab)).toEqual([
      { name: 'open', arg: { model: '/work/plant.slx', block: 'Sub/Gain' } },
      { name: 'open', arg: { model: '/work/plant.slx' } },
    ]);
    expect(run.said).toEqual([
      ['info', 'Opened plant in Simulink at Sub/Gain', 2000],
      ['info', 'Opened plant in Simulink', 2000],
    ]);
  });

  it('updates a diagram, and says what it found: nothing, warnings, or errors, each in the Log', async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    const file = target(MODEL, MODEL_ROWS, null);
    await runMatlab('matlab-update-diagram', file, run.on);
    matlab.answer('updateDiagram', { model: 'plant', ok: true, errors: [], warnings: [{ message: "'Out1' is not connected." }, { message: 'Second.' }] });
    await runMatlab('matlab-update-diagram', file, run.on);
    matlab.answer('updateDiagram', { model: 'plant', ok: false, errors: [{ identifier: 'Simulink:Parameters:InvParamSetting', message: "Invalid setting in 'plant/C'." }], warnings: [] });
    await runMatlab('matlab-update-diagram', file, run.on);
    expect(sent(matlab).map((c) => c.arg)).toEqual(['/work/plant.slx', '/work/plant.slx', '/work/plant.slx']);
    expect(run.said).toEqual([
      ['info', 'Updated plant: no errors or warnings'],
      ['warning', 'Updated plant: 2 warnings'],
      ['error', 'plant could not be updated: 1 error'],
    ]);
    expect(run.logged).toEqual([
      ['warning', "plant: 'Out1' is not connected."],
      ['warning', 'plant: Second.'],
      ['error', "plant: Invalid setting in 'plant/C'."],
    ]);
  });

  it('says one warning, and two errors, in words', async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    matlab.answer('updateDiagram', { model: 'plant', ok: true, errors: [], warnings: [{ message: 'W.' }] });
    matlab.answer('updateDiagram', { model: 'plant', ok: false, errors: [{ message: 'A.' }, { message: 'B.' }], warnings: [] });
    await runMatlab('matlab-update-diagram', target(MODEL, MODEL_ROWS, null), run.on);
    await runMatlab('matlab-update-diagram', target(MODEL, MODEL_ROWS, null), run.on);
    expect(run.said.map(([, text]) => text)).toEqual(['Updated plant: 1 warning', 'plant could not be updated: 2 errors']);
  });

  it("evaluates a row's value where it lives, keeps the answer and brings Properties forward, saying nothing", async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    const kp = target(DICT, DICT_ROWS, KP);
    await runMatlab('matlab-evaluate', kp, run.on);
    await runMatlab('matlab-evaluate', target(DICT, DICT_ROWS, 'file://work/plant.sldd/design/Kp/Min'), run.on);
    await runMatlab('matlab-evaluate', target(MODEL, MODEL_ROWS, 'file://work/plant.slx/workspace/k'), run.on);
    await runMatlab('matlab-evaluate', target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain'), run.on);
    expect(sent(matlab)).toEqual([
      { name: 'evaluate', arg: { expression: '1.5', context: { dictionary: '/work/plant.sldd', section: 'Design Data' } } },
      { name: 'evaluate', arg: { expression: '0', context: { dictionary: '/work/plant.sldd' } } },
      { name: 'evaluate', arg: { expression: '5', context: { model: '/work/plant.slx' } } },
      { name: 'evaluate', arg: { expression: '[1 2 3]' } },
    ]);
    expect(run.kept[0]).toEqual([kp, { value: { text: '3', class: 'double', size: [1, 1], truncated: false } }]);
    expect(run.kept).toHaveLength(4);
    expect(run.shown()).toBe(4);
    expect([run.said, run.logged]).toEqual([[], []]);
  });

  it('evaluates an entry of a section MATLAB takes no section of in the dictionary, not the section', async () => {
    const matlab = fakeMatlab(CONNECTED);
    await runMatlab('matlab-evaluate', target(DICT, DICT_ROWS, 'file://work/plant.sldd/arch/Width'), context(matlab).on);
    expect(sent(matlab)).toEqual([{ name: 'evaluate', arg: { expression: '4', context: { dictionary: '/work/plant.sldd' } } }]);
  });

  it("keeps an expression's own error as its answer", async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    const error = { error: { identifier: 'MATLAB:UndefinedFunction', message: "Unrecognized function or variable 'nope'." } };
    matlab.answer('evaluate', error);
    await runMatlab('matlab-evaluate', target(DICT, DICT_ROWS, KP), run.on);
    expect(run.kept[0]![1]).toEqual(error);
    expect(run.said).toEqual([]);
  });

  it('sends an entry to the workspace, and gets one from it, from the saved file', async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    await runMatlab('matlab-to-workspace', target(DICT, DICT_ROWS, KP), run.on);
    await runMatlab('matlab-to-workspace', target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain'), run.on);
    await runMatlab('matlab-to-workspace', target(MODEL, MODEL_ROWS, 'file://work/plant.slx/workspace/k'), run.on);
    await runMatlab('matlab-from-workspace', target(DICT, DICT_ROWS, KP), run.on);
    await runMatlab('matlab-from-workspace', target(MAT, MAT_ROWS, 'binedit:file://work/ParamMat.mat/gain'), run.on);
    expect(sent(matlab)).toEqual([
      { name: 'toWorkspace', arg: { file: '/work/plant.sldd', section: 'Design Data', entry: 'Kp', name: 'Kp' } },
      { name: 'toWorkspace', arg: { file: '/work/ParamMat.mat', entry: 'gain', name: 'gain' } },
      { name: 'toWorkspace', arg: { file: '/work/plant.slx', section: 'Model Workspace', entry: 'k', name: 'k' } },
      { name: 'fromWorkspace', arg: { file: '/work/plant.sldd', section: 'Design Data', entry: 'Kp', name: 'Kp' } },
      { name: 'fromWorkspace', arg: { file: '/work/ParamMat.mat', entry: 'gain', name: 'gain' } },
    ]);
    expect(run.said).toEqual([
      ['info', 'Sent Kp to the MATLAB workspace', 2000],
      ['info', 'Sent gain to the MATLAB workspace', 2000],
      ['info', 'Sent k to the MATLAB workspace', 2000],
      ['info', 'Wrote Kp from the MATLAB workspace into plant.sldd', 2000],
      ['info', 'Wrote gain from the MATLAB workspace into ParamMat.mat', 2000],
    ]);
  });

  it("opens a file in MATLAB's Data Explorer at the entry, or in Model Explorer, and says when the entry could not be selected", async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    await runMatlab('matlab-data-explorer', target(DICT, DICT_ROWS, KP), run.on);
    await runMatlab('matlab-data-explorer', target(MODEL, MODEL_ROWS, null), run.on);
    matlab.answer('openInDataExplorer', { app: 'dataExplorer', selected: false });
    await runMatlab('matlab-data-explorer', target(DICT, DICT_ROWS, KP), run.on);
    matlab.answer('openInDataExplorer', { app: 'modelExplorer', selected: false });
    await runMatlab('matlab-data-explorer', target(DICT, DICT_ROWS, null), run.on);
    expect(sent(matlab).map((c) => c.arg)).toEqual([{ path: '/work/plant.sldd', entry: 'Kp' }, { path: '/work/plant.slx' }, { path: '/work/plant.sldd', entry: 'Kp' }, { path: '/work/plant.sldd' }]);
    expect(run.said).toEqual([
      ['info', "Opened plant.sldd in MATLAB's Data Explorer", 2000],
      ['info', "Opened plant.slx in MATLAB's Data Explorer", 2000],
      ['info', "Opened plant.sldd in MATLAB's Data Explorer; Kp could not be selected there", 2000],
      ['info', 'Opened plant.sldd in Model Explorer', 2000],
    ]);
  });

  it('says a failure of the link as an error, under the command\'s label, and never rejects', async () => {
    const matlab = fakeMatlab(CONNECTED);
    const run = context(matlab);
    matlab.answer('updateDiagram', new Error('MATLAB is not connected.'));
    matlab.answer('evaluate', new Error('No answer.'));
    await expect(runMatlab('matlab-update-diagram', target(MODEL, MODEL_ROWS, null), run.on)).resolves.toBeUndefined();
    await runMatlab('matlab-evaluate', target(DICT, DICT_ROWS, KP), run.on);
    expect(run.said).toEqual([
      ['error', 'Update Diagram failed: MATLAB is not connected.'],
      ['error', 'Evaluate in MATLAB failed: No answer.'],
    ]);
    expect(run.kept).toEqual([]);
    // Model Explorer's label, for a MATLAB without the Data Explorer.
    matlab.set({ ...CONNECTED, dataExplorer: false });
    matlab.answer('openInDataExplorer', new Error('Gone.'));
    await runMatlab('matlab-data-explorer', target(DICT, DICT_ROWS, null), run.on);
    expect(run.said.at(-1)).toEqual(['error', 'Open in Model Explorer failed: Gone.']);
  });
});

// --- The answer in Properties --------------------------------------------------------------------

const VALUE: MatlabEvaluation = { value: { text: '     2     4     6', class: 'double', size: [1, 3], truncated: false } };

describe('MatlabResults', () => {
  it('keeps an answer for a row while its value is the expression asked, and tells each change', () => {
    const results = new MatlabResults();
    let told = 0;
    const off = results.on(() => void told++);
    results.set('file://work/plant.sldd', KP, '1.5', VALUE);
    expect(results.get('file://work/plant.sldd', KP, '1.5')).toEqual(VALUE);
    expect(results.get('file://work/plant.sldd', KP, '2')).toBeUndefined();
    expect(results.get('file://work/other.sldd', KP, '1.5')).toBeUndefined();
    results.clear();
    expect(results.get('file://work/plant.sldd', KP, '1.5')).toBeUndefined();
    expect(told).toBe(2);
    off();
    results.set('file://work/plant.sldd', KP, '1.5', VALUE);
    expect(told).toBe(2);
  });
});

describe('matlabGroup', () => {
  it("shows a value as MATLAB displays it, its class and its size", () => {
    expect(matlabGroup(VALUE)).toEqual({
      title: 'MATLAB',
      properties: [
        { name: 'In MATLAB', value: '     2     4     6', multiline: true },
        { name: 'Class', value: 'double' },
        { name: 'Size', value: '1×3' },
      ],
    });
  });

  it("shows an expression's error as its answer", () => {
    expect(matlabGroup({ error: { message: "Unrecognized function or variable 'nope'." } })).toEqual({
      title: 'MATLAB',
      properties: [{ name: 'In MATLAB', value: "Error: Unrecognized function or variable 'nope'.", multiline: true }],
    });
  });

  it('cuts a long display at 2000 characters, and marks one MATLAB cut', () => {
    const long = matlabGroup({ value: { text: 'x'.repeat(2500), class: 'char', size: [1, 2500], truncated: false } });
    expect(long.properties[0]!.value).toBe(`${'x'.repeat(2000)}…`);
    const cut = matlabGroup({ value: { text: 'abc', class: 'char', size: [1, 30000], truncated: true } });
    expect(cut.properties[0]!.value).toBe('abc…');
  });
});

describe('withMatlabResults', () => {
  /** A feed of the pages a test sends, recording what reaches its matrix and edit. */
  function feedOf() {
    const listeners = new Set<(view: InspectorView) => void>();
    const reached: string[] = [];
    const feed: InspectorFeed = {
      onPage(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      matrix: async (nodeId) => (reached.push(`matrix ${nodeId}`), { nodeId, message: 'none' }),
      edit: (e) => void reached.push(`edit ${e.rowId}`),
    };
    return { feed, send: (view: InspectorView) => listeners.forEach((l) => l(view)), reached, listening: () => listeners.size };
  }
  const PAGE: InspectorView = { rowId: KP, groups: [{ title: 'Properties', properties: [{ name: 'Value', value: '1.5' }] }] };

  it("puts the MATLAB group last on a page whose row has an answer, and passes any other as it is", () => {
    const { feed, send } = feedOf();
    const answers = new Map([[KP, VALUE]]);
    const pages: InspectorView[] = [];
    withMatlabResults(feed, (rowId) => answers.get(rowId), () => () => {}).onPage((p) => pages.push(p));
    send(PAGE);
    const other: InspectorView = { rowId: 'other', groups: [] };
    send(other);
    send({ groups: [] });
    expect(pages[0]!.groups.map((g) => g.title)).toEqual(['Properties', 'MATLAB']);
    expect(pages.slice(1)).toEqual([other, { groups: [] }]);
  });

  it('sends the last page again when an answer comes or goes, and stops hearing both once let go', () => {
    const { feed, send, listening } = feedOf();
    const answers = new Map<string, MatlabEvaluation>();
    const told = new Set<() => void>();
    const changed = (l: () => void) => (told.add(l), () => void told.delete(l));
    const pages: InspectorView[] = [];
    const off = withMatlabResults(feed, (rowId) => answers.get(rowId), changed).onPage((p) => pages.push(p));
    send(PAGE);
    answers.set(KP, VALUE);
    told.forEach((l) => l());
    answers.delete(KP);
    told.forEach((l) => l());
    expect(pages.map((p) => p.groups.map((g) => g.title))).toEqual([['Properties'], ['Properties', 'MATLAB'], ['Properties']]);
    off();
    expect([listening(), told.size]).toEqual([0, 0]);
  });

  it('passes the matrix and edit on to the feed it wraps', async () => {
    const { feed, reached } = feedOf();
    const wrapped = withMatlabResults(feed, () => undefined, () => () => {});
    await wrapped.matrix('n1');
    wrapped.edit!({ rowId: KP, columnId: 'Value', oldValue: '1.5', newValue: '2' });
    expect(reached).toEqual(['matrix n1', `edit ${KP}`]);
    expect('edit' in withMatlabResults({ onPage: () => () => {}, matrix: feed.matrix }, () => undefined, () => () => {})).toBe(false);
  });
});
