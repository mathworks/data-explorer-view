// Copyright 2026 The MathWorks, Inc.
//
// A check of a folder (checkFolder), as the app's command line runs one (`check`): its unresolved
// references, reference cycles, unused entries, shadowed parameters and duplicate definitions.
//
// What this protects is that a check says what the Folder view and the Usage column say of the
// same folder, by their rules: a reference no file of the folder answers is the hierarchy's
// missing row, an unused entry is one whose Usage cell would be empty, a shadowed parameter is the
// definition core's own resolution order passes over. And that it says nothing those rules do not:
// a data type or a signal, which a model uses where the usage index does not look, is never unused;
// a dictionary no model links is "not checked", not forty findings; two unrelated dictionaries that
// share a name are no duplicate. Over the integration suite's folders read from disk, and folders
// made here in memory from the fixtures' bytes.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { CHECK_FINDING_KINDS, UNUSED_SKIPPED_CLASSES, checkFolder, type CheckFinding } from '../src/model/check/folderCheck.js';
import { sourceUri } from '../src/model/source/sourceUri.js';
import { diskFolder, fixture, jsonDictionary, memoryFolder, named } from './check/folders.js';

const W = 'file:///w/';
const diskRoot = (rel: string): string => `${sourceUri(resolve(import.meta.dirname, '..', rel))}/`;

/** An unused entry of `file`, in `section`. */
const U = (file: string, entry: string, section = 'design'): CheckFinding => ({ kind: 'unused', file, section, entry });

const WORKSPACE = 'test-integration/fixtures/workspace';
const checkWorkspace = async () => named(await checkFolder(diskFolder(WORKSPACE)), diskRoot(WORKSPACE));

describe('checkFolder', () => {
  it("finds the integration workspace's missing files and the dictionary entries no block uses", async () => {
    const check = await checkWorkspace();
    expect(check.files).toBe(4);
    expect(check.truncated).toBe(false);
    expect(check.unreadable).toEqual([]);
    expect(check.findings).toEqual([
      { kind: 'unresolved-reference', file: 'model.slx', relation: 'model reference', reference: 'plant.slx' },
      { kind: 'unresolved-reference', file: 'model.slx', relation: 'external data', reference: 'signals.mat' },
      { kind: 'unresolved-reference', file: 'params.sldd', relation: 'referenced dictionary', reference: 'common.sldd' },
      ...[
        'MyBkpt', 'MyLUT', 'MyVarCtrl', 'MyVarExpr', 'MyVarVar', 'boolFlag', 'boolVec', 'charStr', 'colVec', 'cplxScalar',
        'cplxVec', 'emptyD', 'gravity', 'i16Scalar', 'i32Scalar', 'i32Vec', 'i8Scalar', 'mat2x2', 'mat2x3', 'myCell',
        'myStruct', 'negD', 'nestedStruct', 'pInt16', 'rowVec', 'scalarD', 'sglScalar', 'strArray', 'strScalar',
        'structArray', 'u16Scalar', 'u32Scalar', 'u8Scalar',
      ].map((entry) => U('params.sldd', entry)),
    ]);
    // No model links these two, directly or through a dictionary: every entry would be unused.
    expect(check.notChecked).toEqual(['binary.sldd', 'data.sldd']);
  });

  it('never calls a data type or a signal unused: a model uses those where the usage index does not look', async () => {
    const check = await checkWorkspace();
    const entries = check.findings.flatMap((f) => (f.kind === 'unused' || f.kind === 'duplicate' ? [f.entry] : f.kind === 'shadowed' ? [f.variable] : []));
    for (const typed of ['MyAlias', 'MyBus', 'MyConnBus', 'MyEnum', 'MyNumType', 'MyValueType', 'sig1']) expect(entries).not.toContain(typed);
  });

  it('finds the one entry no model of two sharing a dictionary uses', async () => {
    const rel = 'test-integration/fixtures/usageorder';
    const check = named(await checkFolder(diskFolder(rel)), diskRoot(rel));
    expect(check.findings).toEqual([U('sharedParams.sldd', 'UnusedVar')]);
    expect(check.notChecked).toEqual([]);
  });

  it("finds a workspace variable that hides a dictionary's entry from the model's blocks", async () => {
    const check = named(await checkFolder(memoryFolder({ 'params.sldd': fixture('params.sldd'), 'shadow_ws.slx': fixture('shadow_ws.slx') })), W);
    // The workspace's Kp is the one the blocks read, so the dictionary's is unused as well as hidden.
    expect(check.findings).toEqual([
      U('params.sldd', 'Kp'),
      U('params.sldd', 'Ki'),
      { kind: 'shadowed', model: 'shadow_ws.slx', variable: 'Kp', hidden: 'params.sldd' },
    ]);
  });

  it('finds a name defined in both dictionaries one model links', async () => {
    const folder = memoryFolder({
      'shadow_pair.slx': fixture('shadow_pair.slx'),
      'shadow_first.sldd': fixture('shadow_first.sldd'),
      'shadow_second.sldd': fixture('shadow_second.sldd'),
    });
    expect(named(await checkFolder(folder), W).findings).toEqual([
      U('shadow_second.sldd', 'PairVar'),
      { kind: 'duplicate', entry: 'PairVar', files: ['shadow_first.sldd', 'shadow_second.sldd'] },
    ]);
  });

  const cyclic = { 'a.sldd': jsonDictionary({ X: 1, Y: 2 }, ['b.sldd']), 'b.sldd': jsonDictionary({ X: 3 }, ['a.sldd', 'gone.sldd']) };

  it('finds two dictionaries that reference each other, what one of them misses, and a name both define', async () => {
    const check = named(await checkFolder(memoryFolder(cyclic)), W);
    expect(check.findings).toEqual([
      { kind: 'unresolved-reference', file: 'b.sldd', relation: 'referenced dictionary', reference: 'gone.sldd' },
      { kind: 'cycle', files: ['a.sldd', 'b.sldd', 'a.sldd'] },
      { kind: 'duplicate', entry: 'X', files: ['a.sldd', 'b.sldd'] },
    ]);
    expect(check.notChecked).toEqual(['a.sldd', 'b.sldd']);
  });

  it('finds the cycle when the folder also holds a file nothing references', async () => {
    // The Folder view's tree does not draw a and b here: RelGraph.groupRoots keeps the group's
    // unreferenced members (c alone) and falls back to every member only when there is none. The
    // check walks every file of the listing, so it finds the cycle all the same.
    const check = named(await checkFolder(memoryFolder({ ...cyclic, 'c.sldd': jsonDictionary({}) })), W);
    expect(check.findings.filter((f) => f.kind === 'cycle')).toEqual([{ kind: 'cycle', files: ['a.sldd', 'b.sldd', 'a.sldd'] }]);
  });

  it('finds a dictionary that references itself', async () => {
    const check = named(await checkFolder(memoryFolder({ 'a.sldd': jsonDictionary({}, ['a.sldd']) })), W);
    expect(check.findings).toEqual([{ kind: 'cycle', files: ['a.sldd', 'a.sldd'] }]);
  });

  it('gives one cycle for a knot of three, the shortest circle through its first file', async () => {
    const folder = memoryFolder({
      'a.sldd': jsonDictionary({}, ['b.sldd', 'c.sldd']),
      'b.sldd': jsonDictionary({}, ['c.sldd']),
      'c.sldd': jsonDictionary({}, ['a.sldd']),
    });
    expect(named(await checkFolder(folder), W).findings).toEqual([{ kind: 'cycle', files: ['a.sldd', 'c.sldd', 'a.sldd'] }]);
  });

  it('lists a file that does not read, and checks the rest', async () => {
    const check = named(await checkFolder(memoryFolder({ 'bad.sldd': 'not a dictionary', 'params.sldd': fixture('params.sldd') })), W);
    expect(check.unreadable).toHaveLength(1);
    expect(check.unreadable[0].file).toBe('bad.sldd');
    expect(check.unreadable[0].message).toMatch(/^Failed to parse bad\.sldd/);
    expect(check.findings).toEqual([]);
    expect(check.notChecked).toEqual(['params.sldd']);
  });

  it('says when the listing stopped at a limit', async () => {
    const check = await checkFolder(memoryFolder({ 'params.sldd': fixture('params.sldd') }, { truncated: true }));
    expect(check.truncated).toBe(true);
    expect(check.files).toBe(1);
  });

  it('counts a project among the files, and checks nothing of it', async () => {
    const check = await checkFolder(memoryFolder({ 'MyProj.prj': '', 'params.sldd': fixture('params.sldd') }));
    expect(check.files).toBe(2);
    expect(check.findings).toEqual([]);
    expect(check.unreadable).toEqual([]);
  });

  it("finds a model's missing reference and dictionary, and the workspace variables no block uses", async () => {
    const check = named(await checkFolder(memoryFolder({ 'slxcases.slx': fixture('slxcases.slx', true) })), W);
    expect(check.findings).toEqual([
      { kind: 'unresolved-reference', file: 'slxcases.slx', relation: 'model reference', reference: 'slx_child.slx' },
      { kind: 'unresolved-reference', file: 'slxcases.slx', relation: 'data dictionary', reference: 'slxparams.sldd' },
      U('slxcases.slx', 'cfg', 'workspace'),
      U('slxcases.slx', 'flag', 'workspace'),
      U('slxcases.slx', 'grid', 'workspace'),
      U('slxcases.slx', 'label', 'workspace'),
      U('slxcases.slx', 'names', 'workspace'),
    ]);
  });

  it('gives the same answer twice, and lists its kinds and skipped classes as documented', async () => {
    expect(await checkWorkspace()).toEqual(await checkWorkspace());
    expect(UNUSED_SKIPPED_CLASSES).toEqual([
      'Simulink.AliasType',
      'Simulink.Bus',
      'Simulink.ConnectionBus',
      'Simulink.NumericType',
      'Simulink.Signal',
      'Simulink.ValueType',
      'Simulink.data.dictionary.EnumTypeDefinition',
    ]);
    expect(CHECK_FINDING_KINDS).toEqual(['unresolved-reference', 'cycle', 'unused', 'shadowed', 'duplicate']);
  });
});
