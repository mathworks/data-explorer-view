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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { RawSource } from '../src/model/usage/usageCells.js';
import {
  BOX_ICONS,
  ITEM_ICONS,
  buildRelationshipGraph,
  graphIdOf,
  type GraphBox,
  type GraphEdge,
  type GraphItem,
  type RelationshipGraph,
} from '../src/model/graph/relationshipGraph.js';

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
    // A model holding one block whose Gain is `Kp*Ki`, built the way usageCells.test.ts builds
    // its models, so it goes through the same parser.
    const system = '<Block BlockType="Gain" Name="Pid" SID="7"><P Name="Gain">Kp*Ki</P></Block>';
    const zipped = zipSync({
      'simulink/blockDiagram.json': strToU8(JSON.stringify({ BlockDiagram: { ModelUUID: 'u1', DataDictionary: 'params.sldd' } })),
      'simulink/systems/system_root.xml': strToU8(`<?xml version="1.0" encoding="utf-8"?><System>${system}</System>`),
      'metadata/coreProperties.xml': strToU8('<?xml version="1.0"?><coreProperties><version>R2026b</version></coreProperties>'),
    });
    const model: RawSource = {
      uriString: 'mem:///w/pid.slx',
      path: '/w/pid.slx',
      bytes: zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer,
    };
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
