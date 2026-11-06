// Copyright 2026 The MathWorks, Inc.
//
// The relationship graph's model (src/model/graph/relationshipGraph.ts): which boxes, items and
// edges a set of files draws as.
//
// Nothing in it decides a relationship of its own. Which file a model links and which dictionary a
// dictionary references are read by core's extraction and shaped by graphSources.ts, the hierarchy
// tree's shaper; which block reads which variable is core's usage index. So what these tests pin is
// the seam: that each of those answers reaches the graph whole (a reference spelt in another case,
// a variable two dictionaries away, a workspace variable that shadows a dictionary's), that a file
// referenced and not given is still drawn, and that the same files draw the same graph, ids and
// order included, since the widget keeps its selection and its expanded boxes by id.
//
// Real MATLAB-written fixtures throughout: test-integration/fixtures/caserefs is a model linked to
// three dictionaries (one of them through another) and a MAT-file, spelt in the wrong case.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { buildUsageIndex, scanMat, scanSldd, sourceKind } from 'data-explorer-core';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { RawSource } from '../src/model/usage/usageCells.js';
import { buildRelationshipGraph } from '../src/model/graph/relationshipGraph.js';
import {
  BOX_ICONS,
  ITEM_ICONS,
  graphIdOf,
  type GraphBox,
  type GraphEdge,
  type GraphItem,
  type RelationshipGraph,
} from '../src/model/graph/graphTypes.js';

const ROOT = process.cwd();

function bytesOf(path: string): ArrayBuffer {
  const b = readFileSync(join(ROOT, path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

// A fixture as an app hands it over: a uri of its own, the path that decides how it is read, and
// its bytes. The uri is not the path on purpose, so a box that carries the path instead fails.
function file(dir: string, name: string, folder = '/w'): RawSource {
  return { uriString: `mem://${folder}/${name}`, path: `${folder}/${name}`, bytes: bytesOf(`${dir}/${name}`) };
}

const CASEREFS = 'test-integration/fixtures/caserefs';
const FIXTURES = 'test/fixtures';
const USAGEORDER = 'test-integration/fixtures/usageorder';

const caseRefs = (): RawSource[] =>
  ['caseRefs.slx', 'CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd', 'CaseBp.mat'].map((n) => file(CASEREFS, n));

const box = (g: RelationshipGraph, label: string): GraphBox => {
  const found = g.boxes.find((b) => b.label === label);
  if (!found) throw new Error(`no box ${label} in ${g.boxes.map((b) => b.label).join(', ')}`);
  return found;
};
const item = (b: GraphBox, name: string): GraphItem => {
  const found = b.items.find((i) => i.name === name);
  if (!found) throw new Error(`no item ${name} in ${b.label}`);
  return found;
};
const nameOf = (g: RelationshipGraph, id: string): string => {
  for (const b of g.boxes) {
    if (b.id === id) return b.label;
    const i = b.items.find((x) => x.id === id);
    if (i) return `${b.label}:${i.name}`;
  }
  return `?${id}`;
};
// Every edge as `kind from -> to (label)`, by name: what a reader of the graph sees.
const edgesOf = (g: RelationshipGraph, kinds?: GraphEdge['kind'][]): string[] =>
  g.edges
    .filter((e) => !kinds || kinds.includes(e.kind))
    .map((e) => `${e.kind} ${nameOf(g, e.from)} -> ${nameOf(g, e.to)}${e.label ? ` (${e.label})` : ''}`);

describe('a model, its dictionaries and its MAT-file', () => {
  const g = buildRelationshipGraph(caseRefs());

  it('draws a box per file, in the order given, each with its kind and its file', () => {
    expect(g.boxes.map((b) => [b.label, b.kind, b.ghost])).toEqual([
      ['caseRefs.slx', 'model', false],
      ['CaseParams.sldd', 'sldd', false],
      ['chained.sldd', 'sldd', false],
      ['ExtraDict.sldd', 'sldd', false],
      ['CaseBp.mat', 'mat', false],
    ]);
    // A file's box is known by its uri, so an app names it with what it already holds.
    expect(g.boxes.map((b) => b.uri)).toEqual(caseRefs().map((f) => f.uriString));
    expect(g.boxes.map((b) => b.id)).toEqual(caseRefs().map((f) => f.uriString));
  });

  it("links the model to each file it names, whatever case it names them in, and a dictionary to the one it references", () => {
    // The model records `caseparams.sldd`, `EXTRADICT.SLDD` and `CaseBp.MAT`; the dictionary
    // `Chained.SLDD`. Each reaches the file on disk, as it does for MATLAB.
    expect(edgesOf(g, ['data-link', 'sldd-ref', 'model-ref'])).toEqual([
      'data-link caseRefs.slx -> CaseParams.sldd',
      'data-link caseRefs.slx -> ExtraDict.sldd',
      'data-link caseRefs.slx -> CaseBp.mat',
      'sldd-ref CaseParams.sldd -> chained.sldd',
    ]);
    expect(g.boxes.some((b) => b.ghost)).toBe(false);
  });

  it("lists a model's blocks that read a variable, and each data file's variables a block reads", () => {
    const model = box(g, 'caseRefs.slx');
    expect(model.items.map((i) => [i.name, i.group, i.iconId])).toEqual([
      ['Const1', 'data', ITEM_ICONS.block],
      ['Gain1', 'data', ITEM_ICONS.block],
      ['Gain2', 'data', ITEM_ICONS.block],
      ['Gain3', 'data', ITEM_ICONS.block],
    ]);
    expect(box(g, 'CaseParams.sldd').items.map((i) => i.name)).toEqual(['CaseVar']);
    expect(box(g, 'chained.sldd').items.map((i) => i.name)).toEqual(['ChainedVar']);
    expect(box(g, 'ExtraDict.sldd').items.map((i) => [i.name, i.iconId])).toEqual([['ExtraVar', ITEM_ICONS.sldd]]);
    expect(box(g, 'CaseBp.mat').items.map((i) => [i.name, i.iconId])).toEqual([['Bp', ITEM_ICONS.mat]]);
    for (const b of g.boxes) for (const i of b.items) expect(i.boxId).toBe(b.id);
  });

  it('draws each block parameter to the variable it resolves to, a dictionary away included, labelled with the parameter', () => {
    // In the order of the blocks in their box, top to bottom, after the edges between files.
    expect(edgesOf(g, ['param-usage', 'ws-usage'])).toEqual([
      'param-usage caseRefs.slx:Const1 -> CaseBp.mat:Bp (Value)',
      'param-usage caseRefs.slx:Gain1 -> CaseParams.sldd:CaseVar (Gain)',
      // Through CaseParams.sldd's reference: the model never names chained.sldd itself.
      'param-usage caseRefs.slx:Gain2 -> chained.sldd:ChainedVar (Gain)',
      'param-usage caseRefs.slx:Gain3 -> ExtraDict.sldd:ExtraVar (Gain)',
    ]);
    expect(g.edges.slice(0, 4).every((e) => !e.label)).toBe(true);
  });

  it('reveals a block by its key and a variable by its name, which is what a table selects them by', () => {
    const model = box(g, 'caseRefs.slx');
    // The block's SID, as `selectByName` takes it for a block row.
    expect(item(model, 'Gain1').revealName).toBe('1');
    expect(item(model, 'Const1').revealName).toBe('4');
    expect(item(box(g, 'CaseBp.mat'), 'Bp').revealName).toBe('Bp');
  });
});

describe('a file referenced and not given', () => {
  it('is a ghost box, of the kind the reference says, with no uri, no items, and the reference as written', () => {
    const g = buildRelationshipGraph([file(CASEREFS, 'caseRefs.slx')]);
    expect(g.boxes.map((b) => [b.label, b.kind, b.ghost, b.uri, b.items.length, b.ref])).toEqual([
      // A file given has no reference to carry: it is named by its uri.
      ['caseRefs.slx', 'model', false, 'mem:///w/caseRefs.slx', 0, undefined],
      // Labelled as the model spells them, and carrying that spelling for an app to resolve as it
      // resolves a link: it is the only name there is for a file not read.
      ['caseparams.sldd', 'sldd', true, '', 0, 'caseparams.sldd'],
      ['EXTRADICT.SLDD', 'sldd', true, '', 0, 'EXTRADICT.SLDD'],
      ['CaseBp.MAT', 'mat', true, '', 0, 'CaseBp.MAT'],
    ]);
    expect('ref' in g.boxes[0]!).toBe(false);
    expect(edgesOf(g)).toEqual([
      'data-link caseRefs.slx -> caseparams.sldd',
      'data-link caseRefs.slx -> EXTRADICT.SLDD',
      'data-link caseRefs.slx -> CaseBp.MAT',
    ]);
  });

  it('is a model box for a referenced model, on the models side', () => {
    const g = buildRelationshipGraph([file(FIXTURES, 'model_with_refs.slx')]);
    expect(g.boxes.map((b) => [b.label, b.kind, b.ghost])).toEqual([
      ['model_with_refs.slx', 'model', false],
      ['plant.slx', 'model', true],
      ['params.sldd', 'sldd', true],
      ['signals.mat', 'mat', true],
    ]);
    expect(edgesOf(g)).toEqual([
      'model-ref model_with_refs.slx -> plant.slx',
      'data-link model_with_refs.slx -> params.sldd',
      'data-link model_with_refs.slx -> signals.mat',
    ]);
  });

  it("is one box however many files name it, in whatever case, with the first one's spelling", () => {
    const g = buildRelationshipGraph([file(USAGEORDER, 'ctrlA.slx'), file(USAGEORDER, 'plantB.slx')]);
    expect(g.boxes.filter((b) => b.ghost).map((b) => [b.label, b.ref])).toEqual([['sharedParams.sldd', 'sharedParams.sldd']]);
    expect(edgesOf(g)).toEqual([
      'data-link ctrlA.slx -> sharedParams.sldd',
      'data-link plantB.slx -> sharedParams.sldd',
    ]);
  });
});

describe('a model workspace', () => {
  // shadow_ws.slx: WsGain reads Kp, which its own workspace defines and params.sldd defines too;
  // DictOnly reads Uo, which only the dictionary defines.
  const g = buildRelationshipGraph([file(FIXTURES, 'shadow_ws.slx'), file(FIXTURES, 'params.sldd')]);

  it('lists the workspace variables a block reads after the blocks, as a group of their own', () => {
    expect(box(g, 'shadow_ws.slx').items.map((i) => [i.name, i.group, i.iconId])).toEqual([
      ['DictOnly', 'data', ITEM_ICONS.block],
      ['WsGain', 'data', ITEM_ICONS.block],
      ['Kp', 'workspace', ITEM_ICONS.workspace],
    ]);
  });

  it('draws a block to its own workspace, and leaves the dictionary variable it shadows unused', () => {
    expect(edgesOf(g, ['param-usage', 'ws-usage'])).toEqual([
      'param-usage shadow_ws.slx:DictOnly -> params.sldd:Uo (Value)',
      'ws-usage shadow_ws.slx:WsGain -> shadow_ws.slx:Kp (Gain)',
    ]);
    // Kp is read from the workspace, and Ki by no block: neither is an item of the dictionary.
    expect(box(g, 'params.sldd').items.map((i) => i.name)).toEqual(['Uo']);
  });
});

describe('blocks', () => {
  it('keeps two blocks of one name apart by their paths, and names a block with no name as the table does', () => {
    // sid_blocks.slx: a Gain (SID 15) in the top system, and in subsystem Inner another Gain
    // (SID 24) and SID 65, which has no name.
    const g = buildRelationshipGraph([file(FIXTURES, 'sid_blocks.slx'), file(FIXTURES, 'params.sldd')]);
    const model = box(g, 'sid_blocks.slx');
    expect(model.items.map((i) => [i.name, i.revealName])).toEqual([
      ['Gain', '15'],
      ['Inner/<SID: 65>', '65'],
      ['Inner/Gain', '24'],
    ]);
    expect(new Set(model.items.map((i) => i.id)).size).toBe(3);
    expect(edgesOf(g, ['param-usage'])).toEqual([
      'param-usage sid_blocks.slx:Gain -> params.sldd:Kp (Gain)',
      'param-usage sid_blocks.slx:Inner/<SID: 65> -> params.sldd:Uo (Value)',
      'param-usage sid_blocks.slx:Inner/Gain -> params.sldd:Ki (Gain)',
    ]);
  });

  it('draws a block once to a variable it reads twice, and to each variable an expression reads', () => {
    // shared_gain.slx: PlantGain reads Kp, Trim reads `2*Kp`; the model links `Params.SLDD`.
    const g = buildRelationshipGraph([file(FIXTURES, 'shared_gain.slx'), file(FIXTURES, 'params.sldd')]);
    expect(edgesOf(g, ['data-link', 'param-usage'])).toEqual([
      'data-link shared_gain.slx -> params.sldd',
      'param-usage shared_gain.slx:PlantGain -> params.sldd:Kp (Gain)',
      'param-usage shared_gain.slx:Trim -> params.sldd:Kp (Value)',
    ]);
  });

  it('draws a block to every variable its expression reads, not only the first', () => {
    // A model holding one block whose Gain is `Kp*Ki` (slx, below).
    const system = '<Block BlockType="Gain" Name="Pid" SID="7"><P Name="Gain">Kp*Ki</P></Block>';
    const model = raw('/w/pid.slx', slx({ blocks: system, dictionary: 'params.sldd' }));
    const g = buildRelationshipGraph([model, file(FIXTURES, 'params.sldd')]);
    expect(edgesOf(g, ['param-usage'])).toEqual([
      'param-usage pid.slx:Pid -> params.sldd:Kp (Gain)',
      'param-usage pid.slx:Pid -> params.sldd:Ki (Gain)',
    ]);
  });

  it('lists the blocks of every model that reads a shared dictionary, and only the variables they read', () => {
    const g = buildRelationshipGraph(['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map((n) => file(USAGEORDER, n)));
    // UnusedVar is in the dictionary and read by no block.
    expect(box(g, 'sharedParams.sldd').items.map((i) => i.name)).toEqual(['SharedGain']);
    expect(edgesOf(g, ['param-usage'])).toEqual([
      'param-usage ctrlA.slx:GainA -> sharedParams.sldd:SharedGain (Gain)',
      'param-usage ctrlA.slx:LimitA -> sharedParams.sldd:SharedGain (Value)',
      'param-usage plantB.slx:GainB -> sharedParams.sldd:SharedGain (Gain)',
    ]);
  });
});

// --- Synthetic models, built as usageCells.test.ts builds them ----------------------------------

const toArrayBuffer = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

// A `.slx` holding just what a usage answer needs, through the same parser as a real one: its
// blocks, its linked dictionary, its workspace as the pre-R2019b MAT part inside the package, or
// its workspace kept in a MAT-file beside it (`WSDataSource: 'MAT-File'`).
function slx(opts: { blocks: string; dictionary?: string; workspaceMat?: Uint8Array; workspaceFile?: string }): ArrayBuffer {
  const diagram: Record<string, unknown> = { ModelUUID: 'u1' };
  if (opts.dictionary) diagram.DataDictionary = opts.dictionary;
  if (opts.workspaceFile) diagram.ModelWorkspace = { WSDataSource: 'MAT-File', WSSourceFileName: opts.workspaceFile };
  const parts: Record<string, Uint8Array> = {
    'simulink/blockDiagram.json': strToU8(JSON.stringify({ BlockDiagram: diagram })),
    'simulink/systems/system_root.xml': strToU8(`<?xml version="1.0" encoding="utf-8"?><System>${opts.blocks}</System>`),
    'metadata/coreProperties.xml': strToU8('<?xml version="1.0"?><coreProperties><version>R2026b</version></coreProperties>'),
  };
  if (opts.workspaceMat) parts['simulink/modelworkspace.mat'] = opts.workspaceMat;
  return toArrayBuffer(zipSync(parts));
}

// A textual dictionary of Simulink.Parameter entries.
const sldd = (names: string[]): ArrayBuffer =>
  toArrayBuffer(
    strToU8(
      JSON.stringify({
        __MW_TEXT_PARTS__: {
          '__MW_TEXT_PART__/data/chunk0': { __MW_TEXT_content: { entries: names.map((name) => ({ name, class: 'Simulink.Parameter' })) } },
        },
      }),
    ),
  );

// nd_numeric.mat, whose variables are Mat, Nd, Nd4 and Vec.
const ND = (): ArrayBuffer => bytesOf(`${FIXTURES}/nd_numeric.mat`);
const raw = (path: string, bytes: ArrayBuffer): RawSource => ({ uriString: `mem://${path}`, path, bytes });

describe('a mask and a workspace in a MAT-file', () => {
  it('draws no item for a mask parameter, and the masked block to what its mask value reads', () => {
    // usageCells.test.ts's masked subsystem: MulAdd (SID 158) declares `g1 = 2*Vec`, and its
    // inner Gain (SID 154) reads `g1`. The inner read resolves in the mask, inside the model, so it
    // is no edge to any file or workspace; the mask's value is the masked block's own parameter,
    // and reads `Vec` from the model workspace (the MAT part inside the package).
    const blocks =
      `<Block BlockType="SubSystem" Name="MulAdd" SID="158">` +
      `<Mask><MaskParameter Name="g1" Type="edit"><Value>2*Vec</Value></MaskParameter></Mask>` +
      `<System><Block BlockType="Gain" Name="Gain" SID="154"><P Name="Gain">g1</P></Block></System>` +
      `</Block>`;
    const g = buildRelationshipGraph([raw('/w/plant.slx', slx({ blocks, workspaceMat: new Uint8Array(ND()) }))]);
    expect(box(g, 'plant.slx').items.map((i) => [i.name, i.group, i.revealName])).toEqual([
      ['MulAdd', 'data', '158'],
      ['Vec', 'workspace', 'Vec'],
    ]);
    expect(edgesOf(g)).toEqual(['ws-usage plant.slx:MulAdd -> plant.slx:Vec (g1)']);
  });

  it("reads a workspace kept in a MAT-file as that file's variables, ahead of the dictionary's", () => {
    // Both wsvars.mat and params.sldd define Vec; the model workspace's file resolves first, so the
    // dictionary's Vec is read by no block and is no item. Kp is the dictionary's alone.
    const blocks =
      '<Block BlockType="Gain" Name="FromWs" SID="1"><P Name="Gain">Vec</P></Block>' +
      '<Block BlockType="Gain" Name="FromDict" SID="2"><P Name="Gain">Kp</P></Block>';
    const g = buildRelationshipGraph([
      raw('/w/m.slx', slx({ blocks, dictionary: 'params.sldd', workspaceFile: 'wsvars.mat' })),
      raw('/w/wsvars.mat', ND()),
      raw('/w/params.sldd', sldd(['Vec', 'Kp'])),
    ]);
    expect(edgesOf(g)).toEqual([
      'data-link m.slx -> params.sldd',
      'data-link m.slx -> wsvars.mat',
      'param-usage m.slx:FromDict -> params.sldd:Kp (Gain)',
      'param-usage m.slx:FromWs -> wsvars.mat:Vec (Gain)',
    ]);
    expect(box(g, 'params.sldd').items.map((i) => i.name)).toEqual(['Kp']);
  });
});

describe('files of one name in different folders', () => {
  const copy = (folder: string) => ['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map((n) => file(USAGEORDER, n, folder));

  it("draws each copy's models to their own copy's dictionary, by the rule the file edges follow", () => {
    // Two copies of one set side by side, as a project's variants sit. Core's index keys
    // dictionaries by name, so one index over both copies sends every model's usages to the copy
    // given last; the graph scopes an index to each model's own references, resolved as the file
    // edges are (the referrer's folder first).
    const g = buildRelationshipGraph([...copy('/w/a'), ...copy('/w/b')]);
    const where = (id: string) => g.boxes.find((b) => b.id === id || b.items.some((i) => i.id === id))!.uri.replace(/\/[^/]+$/, '');
    const usages = g.edges.filter((e) => e.kind === 'param-usage');
    expect(usages).toHaveLength(6);
    for (const e of usages) expect(where(e.to), e.id).toBe(where(e.from));
    for (const e of g.edges.filter((x) => x.kind === 'data-link')) expect(where(e.to), e.id).toBe(where(e.from));
    for (const folder of ['mem:///w/a', 'mem:///w/b']) {
      expect(g.boxes.find((b) => b.uri === `${folder}/sharedParams.sldd`)!.items.map((i) => i.name)).toEqual(['SharedGain']);
    }
  });

  it('follows a reference into another folder when the referrer\'s own has no such file', () => {
    // Models in one folder and their dictionary in another, the common layout: two folders, and
    // the reference reaches across, for the file edge and the usages alike.
    const g = buildRelationshipGraph([file(USAGEORDER, 'ctrlA.slx', '/w/models'), file(USAGEORDER, 'sharedParams.sldd', '/w/data')]);
    expect(edgesOf(g)).toEqual([
      'data-link ctrlA.slx -> sharedParams.sldd',
      'param-usage ctrlA.slx:GainA -> sharedParams.sldd:SharedGain (Gain)',
      'param-usage ctrlA.slx:LimitA -> sharedParams.sldd:SharedGain (Value)',
    ]);
  });
});

describe('what it asks core', () => {
  // The builder asks core's index only for the names a model's blocks mention, not for every name
  // of every file in the model's scope. Pinned as an equality with asking for every one: over each
  // fixture set (no two files of one name in a set, so one index over all of it answers as the
  // per-model ones do), the usage edges are exactly those a brute force finds by asking core about
  // every variable of every data file and every model's workspace.
  const setOf = (dir: string): RawSource[] =>
    readdirSync(join(ROOT, dir))
      .filter((n) => sourceKind(n) !== null && sourceKind(n) !== 'prj' && statSync(join(ROOT, dir, n)).isFile())
      .sort()
      .map((n) => file(dir, n));
  const SETS = [FIXTURES, ...readdirSync(join(ROOT, 'test-integration/fixtures')).map((d) => `test-integration/fixtures/${d}`)];

  const bruteForce = (files: RawSource[]): string[] => {
    const index = buildUsageIndex(files.map((f) => ({ srcId: f.uriString, filename: f.path, bytes: f.bytes })));
    const out: string[] = [];
    const ask = (uri: string, names: Iterable<string>, group: string) => {
      for (const name of names) for (const u of index.usagesOf(uri, name)) out.push(`${u.linkTarget} -> ${uri} ${group}:${name} (${u.paramProperty})`);
    };
    for (const m of index.models) ask(m.srcId, m.workspaceNames, 'workspace');
    for (const f of files) {
      try {
        if (sourceKind(f.path) === 'sldd') ask(f.uriString, scanSldd(f.bytes).names.filter(Boolean), 'data');
        if (sourceKind(f.path) === 'mat') ask(f.uriString, scanMat(f.bytes).names.filter(Boolean), 'data');
      } catch {
        /* unreadable: no names, as for the builder */
      }
    }
    return out.sort();
  };
  const drawn = (g: RelationshipGraph): string[] =>
    g.edges
      .filter((e) => e.kind === 'param-usage' || e.kind === 'ws-usage')
      .map((e) => {
        const [, , target] = JSON.parse(e.from) as string[];
        const [uri, group, name] = JSON.parse(e.to) as string[];
        return `${target} -> ${uri} ${group}:${name} (${e.label})`;
      })
      .sort();

  it.each(SETS)('%s: draws every usage asking for every name would find, and no other', (dir) => {
    const files = setOf(dir);
    expect(drawn(buildRelationshipGraph(files))).toEqual(bruteForce(files));
  });

  it('finds usages in the sets above, so the equality is not of two empty lists', () => {
    const total = SETS.reduce((n, dir) => n + bruteForce(setOf(dir)).length, 0);
    expect(total).toBeGreaterThan(20);
  });

  it(
    'builds a graph of many models over a very large dictionary in a fraction of a second',
    () => {
      // 320 models sharing a dictionary of 140,000 entries, each block reading two of them: asked
      // name by name for every model, that was 45 million questions and 3.6 seconds. The bound is
      // far above what it takes, so a slow machine does not fail it and the old cost would.
      const entries = Array.from({ length: 140_000 }, (_, i) => `P${i}`);
      const files: RawSource[] = [raw('/w/big.sldd', sldd(entries))];
      for (let m = 0; m < 320; m++) {
        const blocks = `<Block BlockType="Gain" Name="G" SID="1"><P Name="Gain">P${m * 7}*P${m * 11 + 1}</P></Block>`;
        files.push(raw(`/w/m${m}.slx`, slx({ blocks, dictionary: 'big.sldd' })));
      }
      const start = performance.now();
      const g = buildRelationshipGraph(files);
      const took = performance.now() - start;
      expect(g.edges.filter((e) => e.kind === 'param-usage')).toHaveLength(640);
      expect(g.boxes[0]!.items.length).toBeGreaterThan(400);
      expect(took).toBeLessThan(2000);
    },
    60_000,
  );
});

describe('what it is given', () => {
  it('draws a file it cannot read as a box with no items and no edges, and the rest as ever', () => {
    const broken: RawSource = { uriString: 'mem:///w/broken.slx', path: '/w/broken.slx', bytes: new Uint8Array([1, 2, 3]).buffer };
    const g = buildRelationshipGraph([broken, ...caseRefs()]);
    expect(box(g, 'broken.slx')).toMatchObject({ kind: 'model', ghost: false, items: [] });
    expect(g.edges.some((e) => e.from === broken.uriString || e.to === broken.uriString)).toBe(false);
    expect(edgesOf(g, ['param-usage'])).toHaveLength(4);
  });

  it('draws no box for a project, nor for a file of a kind it does not know, and one box for a file given twice', () => {
    const toml: RawSource = { uriString: 'mem:///w/matlab.toml', path: '/w/matlab.toml', bytes: bytesOf('test-integration/fixtures/tomlproject/matlab.toml') };
    const notes: RawSource = { uriString: 'mem:///w/notes.txt', path: '/w/notes.txt', bytes: new ArrayBuffer(0) };
    const mat = file(CASEREFS, 'CaseBp.mat');
    const g = buildRelationshipGraph([toml, notes, mat, mat]);
    expect(g.boxes.map((b) => b.label)).toEqual(['CaseBp.mat']);
  });

  it('draws nothing for nothing', () => {
    expect(buildRelationshipGraph([])).toEqual({ boxes: [], edges: [] });
  });

  it('draws the same graph from the same files, ids and order included, with every id unique and every edge between two of them', () => {
    const files = [...caseRefs(), file(FIXTURES, 'shadow_ws.slx'), file(FIXTURES, 'params.sldd'), file(FIXTURES, 'model_with_refs.slx')];
    const a = buildRelationshipGraph(files);
    const b = buildRelationshipGraph(files.map((f) => ({ ...f, bytes: f.bytes.slice(0) })));
    expect(b).toEqual(a);
    const ids = [...a.boxes.map((x) => x.id), ...a.boxes.flatMap((x) => x.items.map((i) => i.id))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(a.edges.map((e) => e.id)).size).toBe(a.edges.length);
    const known = new Set(ids);
    for (const e of a.edges) {
      expect(known.has(e.from), e.id).toBe(true);
      expect(known.has(e.to), e.id).toBe(true);
    }
  });

  it('keeps every id it gives a box or an item apart from any file uri', () => {
    // An app passes a file's uri as `selected` or to reveal(): an item's or a ghost's id must
    // never be one, whatever the names in the files hold.
    const g = buildRelationshipGraph([file(FIXTURES, 'model_with_refs.slx'), ...caseRefs()]);
    const uris = new Set(caseRefs().map((f) => f.uriString));
    for (const b of g.boxes) {
      if (b.ghost) expect(uris.has(b.id)).toBe(false);
      for (const i of b.items) expect(uris.has(i.id) || i.id === b.id).toBe(false);
    }
  });
});

describe('graphIdOf', () => {
  const g = buildRelationshipGraph([file(FIXTURES, 'shadow_ws.slx'), file(FIXTURES, 'params.sldd')]);
  const model = box(g, 'shadow_ws.slx');
  const dict = box(g, 'params.sldd');

  it("finds a file's box by its uri, and an item in it by the name a table row is selected by", () => {
    expect(graphIdOf(g, dict.uri)).toBe(dict.id);
    expect(graphIdOf(g, dict.uri, 'Uo')).toBe(item(dict, 'Uo').id);
    expect(graphIdOf(g, model.uri, 'Kp')).toBe(item(model, 'Kp').id);
    // A block row is selected by its key, its SID.
    expect(graphIdOf(g, model.uri, '1')).toBe(item(model, 'WsGain').id);
  });

  it('falls back to the box for a name that is no item of it, and answers null for a file not drawn', () => {
    expect(graphIdOf(g, dict.uri, 'Ki')).toBe(dict.id);
    expect(graphIdOf(g, 'mem:///w/elsewhere.sldd')).toBeNull();
    expect(graphIdOf(g, '')).toBeNull();
  });
});

describe('icons', () => {
  it('names only icons that ship in icons/', () => {
    const shipped = new Set(readdirSync(join(ROOT, 'icons')).map((f) => f.replace(/\.svg$/, '')));
    for (const id of [...Object.values(BOX_ICONS), ...Object.values(ITEM_ICONS)]) expect(shipped.has(id), id).toBe(true);
  });

  it("gives a file's box the icon the hierarchy gives its row", () => {
    expect(BOX_ICONS).toEqual({ model: 'simulink', sldd: 'simulink_database', mat: 'matlabWorkspaceFile' });
  });
});
