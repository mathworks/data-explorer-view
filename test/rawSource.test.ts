// Copyright 2026 The MathWorks, Inc.
//
// `TableSource.raw` on a workspace's documents: what the Raw pane shows for each row of each kind
// of file, read from real files (`createWorkspace().open(...)`, then `doc.table.raw(rowId)`).
//
// A raw form is the file's own record of the row, unrendered, so each case pins it against what
// the file holds: a JSON dictionary's entry as its text spells it, a compressed dictionary's entry
// as the XML of its chunk (test/fixtures/rt_bin.sldd's data/chunk0.xml is quoted below), a
// MAT-file's variable as the bytes of its element (an miMATRIX tag first), a model's block as the
// facts its file gives about it. A section heading and the file itself have a summary, and a row
// that is not there has nothing, said so: `raw` answers every id, as every other question of a
// TableSource does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { createWorkspace, type Doc, type Workspace } from '../src/model/index.js';
import { RAW_NOT_WRITTEN, rawOfRow } from '../src/model/raw/rawOfRow.js';
import { NO_RAW_DATA, type RawView } from '../src/model/raw/rawView.js';

const fixture = (rel: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url))));

// Every workspace a case opened, closed after it.
const spaces: Workspace[] = [];
afterEach(() => {
  for (const ws of spaces.splice(0)) ws.dispose();
  // Nothing here registers in core's module-level session, which the VS Code extension uses.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

function workspace(): Workspace {
  const ws = createWorkspace();
  spaces.push(ws);
  return ws;
}

async function open(rel: string): Promise<Doc> {
  const doc = await workspace().open(fixture(rel), rel.split('/').pop()!);
  await doc.table.open();
  return doc;
}

const raw = (doc: Doc, rowId: string): Promise<RawView> => doc.table.raw!(rowId);
const none = { format: 'none', reason: NO_RAW_DATA };

// The text of a JSON or XML answer, or a failure naming what came instead.
async function textOf(doc: Doc, rowId: string, format: 'json' | 'xml'): Promise<string> {
  const view = await raw(doc, rowId);
  expect(view.format, `${rowId}: ${JSON.stringify(view)}`).toBe(format);
  return view.format === format ? view.text : '';
}

async function bytesOf(doc: Doc, rowId: string): Promise<Uint8Array> {
  const view = await raw(doc, rowId);
  expect(view.format, rowId).toBe('hex');
  return view.format === 'hex' ? view.bytes : new Uint8Array(0);
}

// A MAT-file element's tag: its type (14, miMATRIX) and its length, little-endian, as MATLAB writes
// the element of every variable a MAT-file holds.
const miMatrixTag = (bytes: Uint8Array): number[] => [...bytes.subarray(0, 8)];
const tagOf = (length: number): number[] => [14, 0, 0, 0, length & 0xff, (length >> 8) & 0xff, 0, 0];

describe('a JSON dictionary', () => {
  it("shows an entry as the file's text spells it", async () => {
    const doc = await open('params.sldd');
    expect(await textOf(doc, 'file:///params.sldd/design/Kp', 'json')).toBe(
      ['{', '  "name": "Kp",', '  "metadata": {', '    "uuid": "fixture-uuid-Kp",', '    "isderived": "0"', '  },', '  "value": 1', '}'].join('\n'),
    );
  });

  it('shows a row inside an entry as its part of the record', async () => {
    const doc = await open('rt_text.sldd');
    expect(JSON.parse(await textOf(doc, 'file:///rt_text.sldd/other/gadget/Wheels', 'json'))).toBe(4);
    expect(JSON.parse(await textOf(doc, 'file:///rt_text.sldd/other/gadget/Tags', 'json'))).toMatchObject({
      _array_type: 'Cell',
      _elements: ['coupe', 'fast', 'v12'],
    });
    const entry = await textOf(doc, 'file:///rt_text.sldd/other/gadget', 'json');
    expect(JSON.parse(entry)).toMatchObject({ name: 'gadget', value: { _array_class: 'MyGadget' } });
  });

  it('shows a section heading and the file as a summary of them', async () => {
    const doc = await open('params.sldd');
    expect(JSON.parse(await textOf(doc, 'section:design', 'json'))).toEqual({ section: 'Design Data', entries: 3 });
    expect(JSON.parse(await textOf(doc, 'section:arch', 'json'))).toEqual({ section: 'Architectural Data', entries: 0 });
    expect(JSON.parse(await textOf(doc, 'file:///params.sldd', 'json'))).toEqual({
      format: 'uncompressed-text',
      coreProperties: { release: 'R2026b' },
      dictionaryReferences: [],
      // As the file holds it: the text "0", which a compressed dictionary holds as a logical.
      allowAccessBWS: '0',
      entries: 3,
    });
  });
});

describe('a compressed dictionary', () => {
  it('shows an entry as the XML of its chunk', async () => {
    const doc = await open('rt_bin.sldd');
    const xml = await textOf(doc, 'binedit:file:///rt_bin.sldd/other/gadget', 'xml');
    const lines = xml.split('\n');
    // Out of the chunk, its indent there taken off: the object starts at the left edge.
    expect(lines[0]).toBe('<Object Class="DD.ENTRY">');
    expect(lines.at(-1)).toBe('</Object>');
    expect(lines).toContain('    <P Name="Name" Class="char">gadget</P>');
    expect(lines).toContain('            <P Name="Wheels" Class="double">4.0</P>');
    expect(lines).toContain('                <Element Class="char">coupe</Element>');
  });

  it("shows a row inside an entry as its element, spelt as the chunk spells it", async () => {
    const doc = await open('rt_bin.sldd');
    const id = 'binedit:file:///rt_bin.sldd/other/gadget';
    expect(await textOf(doc, `${id}/Wheels`, 'xml')).toBe('<P Name="Wheels" Class="double">4.0</P>');
    expect(await textOf(doc, `${id}/Engine`, 'xml')).toBe(
      [
        '<P Name="Engine">',
        '    <Element Class="MyEngine">',
        '        <P Name="Cylinders" Class="double">12.0</P>',
        '        <P Name="Displacement" Class="double">6.2</P>',
        '    </Element>',
        '</P>',
      ].join('\n'),
    );
    // An element of a cell is named by its place, and has no name in the chunk.
    expect(await textOf(doc, `${id}/Tags/2`, 'xml')).toBe('<Element Class="char">fast</Element>');
  });

  it("shows an element of an array of objects as the one <Element> the chunk holds for it", async () => {
    // object_array_binary.sldd's chunk: <P Name="Value" Dimension="3*1"><Element Class="Simulink.Parameter">…
    const doc = await open('object_array_binary.sldd');
    expect(await textOf(doc, 'binedit:file:///object_array_binary.sldd/design/paramArray/2', 'xml')).toBe(
      [
        '<Element Class="Simulink.Parameter">',
        '    <P Name="Value" Class="int32">20</P>',
        '    <P Name="Description" Class="char">second</P>',
        '</Element>',
      ].join('\n'),
    );
    // An entry is its bytes in the chunk, as they are: this file's chunk is one line.
    const entry = await textOf(doc, 'binedit:file:///object_array_binary.sldd/design/paramArray', 'xml');
    expect(entry.startsWith('<Object Class="DD.ENTRY"><P Name="Name" Class="char">paramArray</P>')).toBe(true);
    expect(entry.endsWith('</P></Object>')).toBe(true);
  });

  it('shows the file, by its uri or the id its tree is read under, as a summary', async () => {
    const doc = await open('rt_bin.sldd');
    const summary = { format: 'compressed-binary', coreProperties: { release: 'R2027a' }, dictionaryReferences: [], allowAccessBWS: false, entries: 1 };
    expect(JSON.parse(await textOf(doc, 'file:///rt_bin.sldd', 'json'))).toEqual(summary);
    expect(JSON.parse(await textOf(doc, 'binedit:file:///rt_bin.sldd', 'json'))).toEqual(summary);
    expect(JSON.parse(await textOf(doc, 'section:other', 'json'))).toEqual({ section: 'Other Data', entries: 1 });
  });
});

describe('a MAT-file', () => {
  it('shows a variable as the bytes of its element', async () => {
    const doc = await open('nd_numeric.mat');
    const bytes = await bytesOf(doc, 'binedit:file:///nd_numeric.mat/Mat');
    expect(bytes.length).toBe(112);
    expect(miMatrixTag(bytes)).toEqual(tagOf(112 - 8));
  });

  it('shows an element of a variable, and an object it holds, as their records', async () => {
    const doc = await open('nd_numeric.mat');
    expect(await textOf(doc, 'binedit:file:///nd_numeric.mat/Mat/4', 'json')).toBe('4');
    const param = await open('mcos/Param.mat');
    expect(JSON.parse(await textOf(param, 'binedit:file:///Param.mat/Param', 'json'))).toMatchObject({
      name: 'Param',
      value: { _array_class: 'Simulink.Parameter' },
    });
  });

  it('shows the file as its header and how many variables it holds', async () => {
    const doc = await open('nd_numeric.mat');
    expect(JSON.parse(await textOf(doc, 'file:///nd_numeric.mat', 'json'))).toEqual({
      header: 'MATLAB 5.0 MAT-file, hand-built fixture for the Variable Editor',
      variables: 4,
    });
  });
});

describe('a model', () => {
  it('shows a block as what the model says of it', async () => {
    const doc = await open('shadow_ws.slx');
    expect(JSON.parse(await textOf(doc, 'file:///shadow_ws.slx/blocks/1', 'json'))).toEqual({
      name: 'WsGain',
      blockType: 'Gain',
      sid: '1',
      blockPath: 'WsGain',
      parameters: [{ property: 'Gain', value: 'Kp' }],
    });
  });

  it('shows a Model Workspace variable as the bytes of its element', async () => {
    const doc = await open('shadow_ws.slx');
    const bytes = await bytesOf(doc, 'file:///shadow_ws.slx/workspace/Kp');
    expect(miMatrixTag(bytes)).toEqual(tagOf(bytes.length - 8));
  });

  it('shows an external data source and a model reference by what names them', async () => {
    const doc = await open('model_with_refs.slx');
    expect(JSON.parse(await textOf(doc, 'file:///model_with_refs.slx/dataSources/params.sldd@params.sldd', 'json'))).toEqual({
      name: 'params.sldd',
      fullPath: 'params.sldd',
    });
    expect(JSON.parse(await textOf(doc, 'file:///model_with_refs.slx/references/plant.slx@ctrl/plant', 'json'))).toEqual({
      name: 'plant.slx',
      blockPath: 'ctrl/plant',
    });
  });

  it('shows a configuration set, and a workspace object, as their records', async () => {
    const doc = await open('mcos/mcosfix.slx');
    expect(JSON.parse(await textOf(doc, 'file:///mcosfix.slx/config/Configuration', 'json'))).toMatchObject({
      name: 'Configuration',
      value: { _array_class: 'Simulink.ConfigSet' },
    });
    expect(JSON.parse(await textOf(doc, 'file:///mcosfix.slx/workspace/Param', 'json'))).toMatchObject({
      value: { _array_class: 'Simulink.Parameter' },
    });
  });

  it('shows a section heading and the file as a summary of them', async () => {
    const doc = await open('shadow_ws.slx');
    expect(JSON.parse(await textOf(doc, 'section:blocks', 'json'))).toEqual({ section: 'Model Elements', entries: 2 });
    expect(JSON.parse(await textOf(doc, 'file:///shadow_ws.slx', 'json'))).toEqual({
      format: 'slx',
      release: 'R2026b',
      uuid: 'uuid-shadow-ws',
      dataDictionary: 'params.sldd',
      parts: ['simulink/blockDiagram.json', 'simulink/systems/system_root.xml', 'metadata/coreProperties.xml'],
    });
  });
});

describe('a large row of a compressed dictionary', () => {
  // A row inside an entry, as core writes it (serializeXml), over a tree of one: the XML of a
  // value of a quarter of a million elements, and one holding a long run of spaces. Each is
  // answered in a moment, whole: the indent is measured line by line, and only trailing
  // whitespace is trimmed off.
  const tree = (written: string) => ({
    root: () => ({ sourceFormat: 'xml' }),
    fileIds: [],
    find: () => ({ name: 'Big', serializeXml: () => written }),
  });
  const timed = (written: string): { view: RawView; ms: number } => {
    const at = performance.now();
    const view = rawOfRow(tree(written), 'binedit:file:///big.sldd/design/x/Big');
    return { view, ms: performance.now() - at };
  };

  it('outdents an element of 200,000 lines', () => {
    const lines = ['    <P Name="Big">', ...Array.from({ length: 200_000 }, () => '        <Element Class="double">1.0</Element>'), '    </P>'];
    const { view, ms } = timed(`${lines.join('\n')}\n`);
    expect(view.format).toBe('xml');
    const out = view.format === 'xml' ? view.text.split('\n') : [];
    expect(out).toHaveLength(200_002);
    expect([out[0], out[1], out.at(-1)]).toEqual(['<P Name="Big">', '    <Element Class="double">1.0</Element>', '</P>']);
    expect(ms).toBeLessThan(1500);
  });

  it('keeps a run of 80,000 spaces inside a value, and is quick about it', () => {
    const written = `<P Name="Big" Class="char">${' '.repeat(80_000)}x</P>\n`;
    const { view, ms } = timed(written);
    expect(view).toEqual({ format: 'xml', text: written.trimEnd() });
    expect(ms).toBeLessThan(500);
  });
});

describe('every answer is total', () => {
  it('says a row core will not write could not be written, which is not a row with nothing to show', () => {
    const tree = (node: unknown) => ({ root: () => ({ sourceFormat: 'xml' }), fileIds: [], find: () => node });
    const refusing = {
      name: 'Big',
      serializeXml: () => {
        throw new Error('Cannot write "Big": it holds what no Dimension spells. Nothing was written.');
      },
    };
    expect(RAW_NOT_WRITTEN).toBe("This row's raw form could not be written.");
    expect(rawOfRow(tree(refusing), 'binedit:file:///big.sldd/design/x/Big')).toEqual({ format: 'none', reason: RAW_NOT_WRITTEN });
    expect(rawOfRow(tree(null), 'binedit:file:///big.sldd/design/x/Big')).toEqual(none);
  });

  it('has nothing to show for a row that is not there, or names no row at all', async () => {
    const doc = await open('params.sldd');
    for (const id of ['', 'file:///params.sldd/design/Nope', 'section:nope', 'file:///other.sldd', 'garbage']) {
      expect(await raw(doc, id), id).toEqual(none);
    }
  });

  it('has nothing to show for a file that could not be read, a project, or a closed document', async () => {
    const ws = workspace();
    const broken = await ws.open(new TextEncoder().encode('{"not": "a dictionary"'), 'broken.sldd');
    expect(await broken.table.raw!('file:///broken.sldd')).toEqual(none);
    const project = await ws.open(new TextEncoder().encode('<x/>'), 'MyProj.prj');
    expect(await project.table.raw!('file:///MyProj.prj')).toEqual(none);
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    doc.dispose();
    expect(await doc.table.raw!('file:///params.sldd/design/Kp')).toEqual(none);
  });
});
