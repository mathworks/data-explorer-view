// Copyright 2026 The MathWorks, Inc.
//
// A `.slx` model's Model Workspace edited by the MAT-file engine (MODEL_FILE, edit/modelFile.ts):
// the table shows the whole model, section by section, as the read-only view does; the workspace
// alone takes an edit, a delete, an Add, a paste or a drop, by core's rules (a MAT-file's, and what
// a model workspace keeps of them); and a save is the model's package, its workspace part written
// anew, every other part as read.
import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { createSession, parseSlx } from 'data-explorer-core';
import { MODEL_FILE } from '../../src/host/index.js';
import { createRegisters } from '../../src/model/index.js';
import { buffer, errorsIn, fixture as matFixture, nameOf, open, tableOf, waitFor } from '../matEngine/harness.js';
import { chunkOf, open as openDictionary } from '../jsonEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const model = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
const openModel = (name: string, opts: Parameters<typeof open>[2] = {}) => open(name, model(name), { ...opts, file: MODEL_FILE });

const WS = 'section:workspace';
const wsRow = (posts: any[], name: string): any => {
  const row = tableOf(posts).find((r) => r.parent === WS && nameOf(r) === name);
  if (!row) throw new Error(`the workspace has no row for "${name}"`);
  return row;
};
const sectionRows = (posts: any[]): string[] => tableOf(posts).filter((r) => r.parent == null).map((r) => String(r.ID));
const workspaceOf = (bytes: Uint8Array): Record<string, any> =>
  Object.fromEntries(parseSlx(buffer(bytes), 'saved.slx').workspace.map((v: any) => [v.name, v]));

describe('a model, edited by the MAT-file engine', () => {
  it('shows every section, takes a paste into its workspace and its configuration sets alone, and offers its classes', async () => {
    const o = await openModel('slxcases.slx');
    const set = o.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.editable, true);
    assert.strictEqual(set.notice, undefined);
    assert.deepStrictEqual(sectionRows(o.view.posts), ['section:blocks', 'section:workspace', 'section:config', 'section:references', 'section:dataSources']);
    const rules = o.view.posts.find((p) => p.type === 'sectionRules');
    assert.deepStrictEqual(rules.rules.map((r: any) => r.sectionName), ['workspace', 'config']);
    assert.ok(set.add.classes.includes('Simulink.Parameter'));
    assert.ok(!set.add.classes.includes('Simulink.Bus'), 'no bus in a model workspace');
    assert.ok(!set.add.classes.includes('Simulink.AliasType'), 'no alias type in a model workspace');
  });

  it("offers Delete of the workspace's variables and the configuration sets, and of no other section's rows", async () => {
    const o = await openModel('slxcases.slx');
    const rows = tableOf(o.view.posts);
    const ws = rows.filter((r) => r.parent === WS);
    assert.ok(ws.length > 0);
    assert.ok(ws.every((r) => r._canDelete === true), 'every workspace variable offers Delete');
    const sets = rows.filter((r) => r.parent === 'section:config');
    assert.ok(sets.length > 0);
    assert.ok(sets.every((r) => r._canDelete === true && r._canCut === false), 'every set offers Delete, and no Cut');
    const others = rows.filter((r) => r.parent && r.parent !== WS && r.parent !== 'section:config' && String(r.parent).startsWith('section:'));
    assert.ok(others.length > 0);
    assert.ok(others.every((r) => r._canDelete === false), 'no block, reference or data source does');
  });

  it("a value edit marks the variable, saves into the workspace part alone, and clears the mark", async () => {
    const o = await openModel('slxcases.slx');
    o.view.send({ type: 'edit', rowId: wsRow(o.view.posts, 'tau').ID, columnId: 'Value', oldValue: '', newValue: '0.5' });
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    assert.strictEqual(wsRow(o.view.posts, 'tau').Value, '0.5');
    assert.strictEqual(wsRow(o.view.posts, 'tau').Status, 'Modified');
    const saved = o.save();
    assert.strictEqual(workspaceOf(saved).tau.value, 0.5);
    const before = unzipSync(o.original);
    const after = unzipSync(saved);
    for (const name of Object.keys(before)) {
      if (name === 'simulink/modelWorkspace.mxarray') continue;
      assert.ok(Buffer.from(after[name]).equals(Buffer.from(before[name])), `${name} is as read`);
    }
    assert.strictEqual(wsRow(o.view.posts, 'tau').Status, '', 'saved: it no longer differs from the file');
    assert.strictEqual(o.index.dirty, false);
  });

  it('undo and redo move the workspace with the stack', async () => {
    const o = await openModel('slxcases.slx');
    o.view.send({ type: 'edit', rowId: wsRow(o.view.posts, 'tau').ID, columnId: 'Value', oldValue: '', newValue: '0.5' });
    o.undo();
    assert.strictEqual(wsRow(o.view.posts, 'tau').Value, '0.25');
    assert.strictEqual(o.index.dirty, false);
    o.redo();
    assert.strictEqual(wsRow(o.view.posts, 'tau').Value, '0.5');
    assert.strictEqual(o.index.dirty, true);
  });

  it("refuses a rename of a variable a block uses, in core's words, and takes one of a variable none does", async () => {
    const o = await openModel('slxcases.slx');
    o.view.send({ type: 'edit', rowId: wsRow(o.view.posts, 'span').ID, columnId: 'Name', oldValue: 'span', newValue: 'span2' });
    const invalid = o.view.posts.find((p) => p.type === 'validationError' || p.type === 'invalid');
    assert.ok(invalid, 'the cell is told the edit was refused');
    assert.match(JSON.stringify(invalid), /uses it by name, and would find no variable of that name once it is renamed here/);
    assert.strictEqual(o.events.length, 0, 'nothing reached the stack');
    o.view.send({ type: 'edit', rowId: wsRow(o.view.posts, 'label').ID, columnId: 'Name', oldValue: 'label', newValue: 'caption' });
    assert.strictEqual(o.events.length, 1);
    assert.ok(workspaceOf(o.save()).caption);
  });

  it('adds a variable of a class the gallery offers, into the workspace', async () => {
    const o = await openModel('slxcases.slx');
    o.view.send({ type: 'addEntry', className: 'Simulink.Parameter' });
    await waitFor('the added row', () => tableOf(o.view.posts).some((r) => r.parent === WS && /^Param/.test(nameOf(r))));
    const added = tableOf(o.view.posts).find((r) => r.parent === WS && /^Param/.test(nameOf(r)));
    assert.ok(added);
    assert.strictEqual(o.events.length, 1);
    assert.ok(Object.keys(workspaceOf(o.save())).includes(nameOf(added)));
  });

  it('deletes a variable no block uses, and a first variable of an empty workspace adds its part', async () => {
    const o = await openModel('slxcases.slx');
    o.view.send({ type: 'delete', rowIds: [wsRow(o.view.posts, 'names').ID] });
    assert.strictEqual(o.events.length, 1);
    assert.ok(!('names' in workspaceOf(o.save())));
    const empty = await openModel('slxcfgref.slx');
    assert.deepStrictEqual(tableOf(empty.view.posts).filter((r) => r.parent === WS), []);
    empty.view.send({ type: 'addEntry', className: 'MatlabVariable' });
    const saved = empty.save();
    assert.ok(unzipSync(saved)['simulink/modelWorkspace.mxarray'], 'the part is written');
    assert.strictEqual(Object.keys(workspaceOf(saved)).length, 1);
  });

  it('takes a variable pasted out of a MAT-file into its workspace', async () => {
    const registers = createRegisters();
    const session = createSession();
    const mat = await open('cases.mat', matFixture('cases.mat'), { registers, session });
    const m = await openModel('slxcases.slx', { registers, session });
    const source = tableOf(mat.view.posts).find((r) => r.parent == null && nameOf(r) === 'rowVec');
    mat.view.send({ type: 'copy', rowIds: [source.ID] });
    m.view.send({ type: 'paste', rowId: 'section:workspace' });
    await waitFor('the pasted row', () => tableOf(m.view.posts).some((r) => r.parent === WS && nameOf(r) === 'rowVec'));
    assert.deepStrictEqual(workspaceOf(m.save()).rowVec.value, [1, 2, 3]);
  });

  it('opens a model whose workspace is made from a MAT-file for viewing only, saying why', async () => {
    const o = await openModel('wsf_matfile.slx');
    const set = o.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.editable, false);
    assert.match(set.notice, /^Read-only: Cannot edit "wsf_matfile\.slx": its Model Workspace is loaded from the MAT-file "wsf_init\.mat" each time the model opens, so an edit of it here would not be kept\.$/);
    const rules = o.view.posts.find((p) => p.type === 'sectionRules');
    assert.deepStrictEqual(rules.rules, []);
  });

  it('edits the workspace of a model saved before R2019b, a whole MAT-file', async () => {
    const o = await openModel('slxcases_R2018a.slx');
    o.view.send({ type: 'edit', rowId: wsRow(o.view.posts, 'tau').ID, columnId: 'Value', oldValue: '', newValue: '0.75' });
    const saved = o.save();
    assert.ok(unzipSync(saved)['simulink/modelworkspace.mat']);
    assert.strictEqual(workspaceOf(saved).tau.value, 0.75);
  });
});

describe("a model's active configuration set, made another", () => {
  const CONFIG = 'section:config';
  const setRow = (posts: any[], name: string): any => {
    const row = tableOf(posts).find((r) => r.parent === CONFIG && nameOf(r) === name);
    if (!row) throw new Error(`the Configurations section has no row for "${name}"`);
    return row;
  };
  const activeIn = (bytes: Uint8Array) => parseSlx(buffer(bytes), 'saved.slx').configSets.filter((c: any) => c.active).map((c: any) => c.name);
  const flags = (posts: any[], names: string[]) => names.map((n) => [n, setRow(posts, n)._canSetActive, setRow(posts, n)._setActiveWhy, setRow(posts, n).Name.iconId]);

  it("says of each set whether it is made active, and why not, and of no other row", async () => {
    const o = await openModel('acs_sets.slx');
    assert.deepStrictEqual(flags(o.view.posts, ['Configuration', 'Fast', 'Slow']), [
      ['Configuration', false, 'It is the active one already', 'check_settings'],
      ['Fast', true, undefined, 'settings'],
      ['Slow', true, undefined, 'settings'],
    ]);
    assert.ok(tableOf(o.view.posts).filter((r) => r.parent !== CONFIG).every((r) => !('_canSetActive' in r)));
  });

  it.each(['acs_sets.slx', 'acs_sets_R2013b.slx'])('%s: makes a set active as one edit, painted again, saved, and undone', async (file) => {
    const o = await openModel(file);
    // Every row is painted again, as after an Add or a Delete: once the payload is built.
    const painted = (active: string) => waitFor(`${active} painted active`, () => setRow(o.view.posts, active).Name.iconId === 'check_settings');
    o.view.send({ type: 'setActiveConfigSet', rowId: setRow(o.view.posts, 'Fast').ID });
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    await painted('Fast');
    assert.deepStrictEqual(flags(o.view.posts, ['Configuration', 'Fast']), [
      ['Configuration', true, undefined, 'settings'],
      ['Fast', false, 'It is the active one already', 'check_settings'],
    ]);
    assert.strictEqual(o.index.dirty, true);
    const saved = o.save();
    assert.deepStrictEqual(activeIn(saved), ['Fast']);
    assert.strictEqual(o.index.dirty, false);
    o.undo();
    await painted('Configuration');
    assert.deepStrictEqual(flags(o.view.posts, ['Configuration', 'Fast']), [
      ['Configuration', false, 'It is the active one already', 'check_settings'],
      ['Fast', true, undefined, 'settings'],
    ]);
    assert.strictEqual(o.index.dirty, true, 'the file holds Fast active');
    assert.deepStrictEqual(activeIn(o.save()), ['Configuration']);
    o.redo();
    await painted('Fast');
  });

  it("makes a reference active, warning in core's words that MATLAB alone can check it", async () => {
    const o = await openModel('acs_ref.slx');
    const caution =
      '"RefFromDict" refers to the configuration set "dictCfg" in the data dictionary "acs_dict.sldd". Without MATLAB this editor ' +
      'cannot check that the set is there: open the model in MATLAB to confirm.';
    const ref = setRow(o.view.posts, 'RefFromDict');
    assert.deepStrictEqual([ref._canSetActive, ref._setActiveWhy, ref._setActiveCaution], [true, undefined, caution]);
    assert.strictEqual(setRow(o.view.posts, 'Configuration')._setActiveCaution, undefined, 'a plain set warns of nothing');
    o.view.send({ type: 'setActiveConfigSet', rowId: ref.ID });
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    assert.deepStrictEqual(o.notices, [{ level: 'warning', message: caution }]);
    await waitFor('the reference painted active', () => setRow(o.view.posts, 'RefFromDict').Name.iconId === 'check_configurationReference');
    assert.deepStrictEqual(activeIn(o.save()), ['RefFromDict']);
  });

  it('warns of nothing as a set that is no reference is made active', async () => {
    const o = await openModel('acs_sets.slx');
    o.view.send({ type: 'setActiveConfigSet', rowId: setRow(o.view.posts, 'Fast').ID });
    assert.strictEqual(o.events.length, 1);
    assert.deepStrictEqual(o.notices, []);
  });
});

describe("a model's configuration sets, edited as a dictionary's are", () => {
  const CONFIG = 'section:config';
  const setRow = (posts: any[], name: string): any => tableOf(posts).find((r) => r.parent === CONFIG && nameOf(r) === name);
  const setsIn = (bytes: Uint8Array) =>
    parseSlx(buffer(bytes), 'saved.slx').configSets.map((c: any) => [c.name, c.objectClass || 'Simulink.ConfigSet', c.description ?? '']);
  const lastSet = (posts: any[]) => [...posts].reverse().find((p) => p.type === 'setRows');

  it("offers the gallery's Configurations tiles beside the workspace's classes", async () => {
    const o = await openModel('acs_sets.slx');
    const set = lastSet(o.view.posts);
    assert.deepStrictEqual(set.addSections, ['config']);
    assert.ok(set.add.classes.includes('Simulink.Parameter'));
  });

  it.each(['acs_sets.slx', 'acs_sets_R2013b.slx'])('%s: adds a set and a reference from the tiles, one edit each, and saves them', async (file) => {
    const o = await openModel(file);
    o.view.send({ type: 'addEntry', className: 'Simulink.ConfigSet', section: 'config', rename: true });
    await waitFor('the added set', () => !!setRow(o.view.posts, 'Configuration1'));
    assert.ok(o.view.posts.some((p) => p.type === 'beginRename' && p.rowId === setRow(o.view.posts, 'Configuration1').ID), 'its name editor opens');
    o.view.send({ type: 'addEntry', className: 'Simulink.ConfigSetRef', section: 'config' });
    await waitFor('the added reference', () => !!setRow(o.view.posts, 'Reference'));
    assert.strictEqual(o.events.length, 2, 'two edits reached the stack');
    assert.strictEqual(setRow(o.view.posts, 'Configuration1')._canDelete, true);
    assert.deepStrictEqual(setsIn(o.save()).slice(-2), [
      ['Configuration1', 'Simulink.ConfigSet', ''],
      ['Reference', 'Simulink.ConfigSetRef', ''],
    ]);
    o.undo();
    await waitFor('the reference gone', () => !setRow(o.view.posts, 'Reference'));
  });

  it('renames a set and gives it a Description, one edit each, and saves both', async () => {
    const o = await openModel('acs_sets.slx');
    o.view.send({ type: 'edit', rowId: setRow(o.view.posts, 'Fast').ID, columnId: 'Name', oldValue: 'Fast', newValue: 'Faster' });
    await waitFor('the renamed set', () => !!setRow(o.view.posts, 'Faster'));
    o.view.send({ type: 'edit', rowId: setRow(o.view.posts, 'Faster').ID, columnId: 'Description', oldValue: '', newValue: 'Quick runs' });
    await waitFor('its Description', () => setRow(o.view.posts, 'Faster').Description === 'Quick runs');
    assert.strictEqual(o.events.length, 2);
    assert.deepStrictEqual(setsIn(o.save())[1], ['Faster', 'Simulink.ConfigSet', 'Quick runs']);
  });

  it("refuses a name MATLAB does not give a set, in MATLAB's words, and changes nothing", async () => {
    const o = await openModel('acs_sets.slx');
    o.view.send({ type: 'edit', rowId: setRow(o.view.posts, 'Fast').ID, columnId: 'Name', oldValue: 'Fast', newValue: 'R&D' });
    const invalid = o.view.posts.find((p) => p.type === 'validationError' || p.type === 'invalid');
    assert.ok(invalid, 'the cell is told the edit was refused');
    assert.match(JSON.stringify(invalid), /Invalid character in name for configuration object/);
    assert.strictEqual(o.events.length, 0);
    assert.strictEqual(o.index.dirty, false);
  });

  it('deletes a set as one edit, and refuses the active one, saying why', async () => {
    const o = await openModel('acs_sets.slx');
    o.view.send({ type: 'delete', rowIds: [setRow(o.view.posts, 'Slow').ID] });
    await waitFor('the set gone', () => !setRow(o.view.posts, 'Slow'));
    assert.strictEqual(o.events.length, 1);
    assert.deepStrictEqual(setsIn(o.save()).map((s) => s[0]), ['Configuration', 'Fast']);
    o.view.send({ type: 'delete', rowIds: [setRow(o.view.posts, 'Configuration').ID] });
    const refusal = o.view.posts.filter((p) => p.type === 'refused').pop();
    assert.match(refusal?.reason ?? '', /it is the active configuration set, which MATLAB does not delete: make another set active first/);
    assert.strictEqual(o.events.length, 1, 'nothing more reached the stack');
  });

  it('a package whose sets are not laid out as MATLAB writes them offers no tile, and no Delete of a set', async () => {
    const entries = unzipSync(model('acs_sets.slx'));
    const index = new TextDecoder().decode(entries['simulink/configSetInfo.json']);
    entries['simulink/configSetInfo.json'] = new TextEncoder().encode(JSON.stringify(JSON.parse(index)));
    const o = await open('acs_sets.slx', zipSync(entries), { file: MODEL_FILE });
    assert.strictEqual(lastSet(o.view.posts).addSections, undefined);
    const sets = tableOf(o.view.posts).filter((r) => r.parent === CONFIG);
    assert.ok(sets.length === 3 && sets.every((r) => r._canDelete === false && r.Name.editable === false));
  });
});

describe("a configuration set pasted into a model's Configurations, and out of one", () => {
  const CONFIG = 'section:config';
  const setRow = (posts: any[], name: string): any => tableOf(posts).find((r) => r.parent === CONFIG && nameOf(r) === name);
  const setsIn = (bytes: Uint8Array) => parseSlx(buffer(bytes), 'saved.slx').configSets.map((c: any) => c.name);
  const lastSet = (posts: any[]) => [...posts].reverse().find((p) => p.type === 'setRows');

  it('a copy of one of its own sets: named as MATLAB names a duplicate, one edit, saved', async () => {
    const o = await openModel('acs_sets.slx');
    const rules = [...o.view.posts].reverse().find((p) => p.type === 'sectionRules');
    assert.deepStrictEqual(rules.rules.map((r: any) => [r.sectionName, r.allowedTypes]), [
      ['workspace', rules.rules[0].allowedTypes],
      ['config', ['Simulink.ConfigSet', 'Simulink.ConfigSetRef']],
    ]);
    o.view.send({ type: 'copy', rowIds: [setRow(o.view.posts, 'Fast').ID] });
    o.view.send({ type: 'paste', rowId: CONFIG });
    await waitFor('the pasted set', () => !!setRow(o.view.posts, 'Fast1'));
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    assert.deepStrictEqual(setsIn(o.save()), ['Configuration', 'Fast', 'Slow', 'Fast1']);
    o.undo();
    await waitFor('the paste undone', () => !setRow(o.view.posts, 'Fast1'));
  });

  it("a dictionary's set pasted into the model, and the model's into the dictionary", async () => {
    const registers = createRegisters();
    const dict = await openDictionary('pd.sldd', model('pd.sldd'), { registers });
    const m = await openModel('acs_sets.slx', { registers });
    const fromDict = tableOf(dict.view.posts).find((r) => r.parent === CONFIG && nameOf(r) === 'Fast');
    dict.view.send({ type: 'copy', rowIds: [fromDict.ID] });
    m.view.send({ type: 'paste', rowId: setRow(m.view.posts, 'Slow').ID });
    await waitFor('the pasted set', () => !!setRow(m.view.posts, 'Fast1'));
    assert.deepStrictEqual(setsIn(m.save()), ['Configuration', 'Fast', 'Slow', 'Fast1']);
    m.view.send({ type: 'copy', rowIds: [setRow(m.view.posts, 'Slow').ID] });
    dict.view.send({ type: 'paste', rowId: CONFIG });
    await waitFor('the set in the dictionary', () => dict.names().includes('Slow'));
    // With its settings: Slow is acs_sets's fixed-step set, StopTime 20.
    const slow = (chunkOf(dict.text.text).entries as any[]).find((e) => e.name === 'Slow');
    const solver = slow.value._elements[0]._properties.Components._elements.find((c: any) => c._object_class === 'Simulink.SolverCC');
    assert.strictEqual(solver._properties.SolverName, 'FixedStepDiscrete');
  });

  it("an older layout's set is not copied, nor a set pasted into one, saying why; a workspace takes none", async () => {
    const registers = createRegisters();
    const old = await openModel('acs_sets_R2013b.slx', { registers });
    old.view.send({ type: 'copy', rowIds: [setRow(old.view.posts, 'Fast').ID] });
    await waitFor('the refusal', () => errorsIn(old.view.posts).length > 0);
    assert.match(errorsIn(old.view.posts).at(-1)!, /a configuration set's settings are copied out of a model saved in R2026b or later/);
    const m = await openModel('acs_sets.slx', { registers });
    m.view.send({ type: 'copy', rowIds: [setRow(m.view.posts, 'Fast').ID] });
    old.view.send({ type: 'paste', rowId: CONFIG });
    await waitFor('the paste refused', () => old.view.posts.some((p) => /written into a model saved in R2026b or later/.test(JSON.stringify(p))));
    assert.strictEqual(old.events.length, 0);
    m.view.send({ type: 'paste', rowId: 'section:workspace' });
    await waitFor('the workspace refusal', () => m.view.posts.some((p) => /Simulink\.ConfigSet/.test(JSON.stringify(p)) && (p.type === 'error' || p.type === 'refused')));
    assert.ok(!lastSet(m.view.posts).rows.some((r: any) => r.parent === 'section:workspace' && nameOf(r) === 'Fast'), 'no set lands in the workspace');
  });
});
