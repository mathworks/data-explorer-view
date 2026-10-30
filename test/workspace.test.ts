// Copyright 2026 The MathWorks, Inc.
//
// A workspace's documents, beyond what the goldens hold (test/goldens/inPage.test.ts): what a file
// that cannot be read says, what a reload tells a table, what a closed document and a closed
// workspace answer, and that a workspace keeps to its own session.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { createWorkspace, sourceUri, type TableChange } from '../src/model/index.js';
import { findNode } from '../src/host/index.js';

const fixture = (rel: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url))));
const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const jsonError = (s: string): string => {
  try {
    JSON.parse(s);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('parses');
};

afterEach(() => {
  // Nothing here registers in core's module-level session, which the VS Code extension uses.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

describe('opening a document', () => {
  it('names it by its uri, sourceUri of its name by default, and tells its kind', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    expect(doc.uri).toBe('file:///params.sldd');
    expect(doc.name).toBe('params.sldd');
    expect(doc.kind).toBe('dictionary');
    const view = await doc.table.open();
    expect(view.docUri).toBe('file:///params.sldd');
    expect(view.editable).toBe(false);
    // A row id begins with the uri, but for a section heading's, which names only its section.
    expect(view.rows.every((r) => r.ID.startsWith('file:///params.sldd/') || r.ID.startsWith('section:'))).toBe(true);
    expect(ws.get('file:///params.sldd')).toBe(doc);

    expect((await ws.open(fixture('model_with_refs.slx'), 'model_with_refs.slx')).kind).toBe('model');
    expect((await ws.open(fixture('nd_numeric.mat'), 'nd_numeric.mat')).kind).toBe('mat');
    expect((await ws.open(fixture('params.sldd'), 'my plant@v2.sldd')).uri).toBe(
      'file:///my%20plant%40v2.sldd',
    );
    ws.dispose();
  });

  it('reads a Uint8Array that is a window on a larger buffer as just its bytes', async () => {
    const bytes = fixture('params.sldd');
    const padded = new Uint8Array(bytes.length + 20);
    padded.set(bytes, 10);
    const ws = createWorkspace();
    const a = await (await ws.open(bytes, 'a.sldd')).table.open();
    const b = await (await ws.open(padded.subarray(10, 10 + bytes.length), 'b.sldd')).table.open();
    expect(b.rows.length).toBe(a.rows.length);
    expect(b.rows.map((r) => r.Name)).toEqual(a.rows.map((r) => r.Name));
    ws.dispose();
  });

  it('refuses a file of another kind, a uri already open, and a closed workspace', async () => {
    const ws = createWorkspace();
    await expect(ws.open(text('x'), 'notes.txt')).rejects.toThrow('notes.txt is not a file this workspace opens');
    await ws.open(fixture('params.sldd'), 'params.sldd');
    await expect(ws.open(fixture('params.sldd'), 'params.sldd')).rejects.toThrow('file:///params.sldd is already open');
    // The same name under another uri is another document.
    await ws.open(fixture('params.sldd'), 'params.sldd', sourceUri('/other/params.sldd'));
    ws.get('file:///params.sldd')!.dispose();
    expect(ws.get('file:///params.sldd')).toBeUndefined();
    await ws.open(fixture('params.sldd'), 'params.sldd');
    ws.dispose();
    await expect(ws.open(fixture('params.sldd'), 'params.sldd')).rejects.toThrow('This workspace is closed.');
  });

  it('opens a project, whose table says it opens on a page', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(text('<x/>'), 'MyProj.prj');
    expect(doc.kind).toBe('project');
    await expect(doc.table.open()).rejects.toThrow('MyProj.prj is a project: it opens on a project page, not in a table.');
    expect((await ws.open(text(''), 'matlab.toml')).kind).toBe('project');
    ws.dispose();
  });
});

describe('a file that cannot be read', () => {
  // Each opens, and its table's open() rejects with the extension's banner text for the route.
  const cases: [string, Uint8Array, string][] = [
    ['broken JSON', text('{"x": '), `Failed to parse bad.sldd: ${jsonError('{"x": ')}`],
    ['neither JSON nor a zip', text('hello'), 'Failed to parse bad.sldd: invalid zip data'],
    ['a zip with no data part', zipSync({ 'other.txt': new Uint8Array([1]) }), 'Failed to parse bad.sldd: Missing data/chunk0.xml in binary SLDD'],
  ];
  it.each(cases)('a dictionary: %s', async (_what, bytes, message) => {
    const ws = createWorkspace();
    const doc = await ws.open(bytes, 'bad.sldd', 'file:///w/bad.sldd');
    await expect(doc.table.open()).rejects.toThrow(message);
    ws.dispose();
  });

  it('a model, named by its path as the extension names it', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(text('not a model'), 'bad.mdl', 'file:///w/my%20dir/bad.mdl');
    await expect(doc.table.open()).rejects.toThrow(/^Failed to parse bad\.mdl: Not a Simulink model: "\/w\/my dir\/bad\.mdl"/);
    ws.dispose();
  });

  it('a MAT-file, its srcId spelled as its name', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(new Uint8Array(300).fill(7), 'bad.mat', 'file:///w/bad.mat');
    const failure = await doc.table.open().catch((err: Error) => err.message);
    expect(failure).toMatch(/^Failed to parse bad\.mat: /);
    expect(failure).not.toContain('binedit:');
    ws.dispose();
  });

  it('holds nothing, and answers every question empty', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(text('{"x": '), 'bad.sldd');
    expect(await doc.table.children('anything')).toEqual({ nodeId: 'anything', rows: [], truncated: 0 });
    expect(await doc.table.matrix('anything')).toEqual({ nodeId: 'anything', message: 'This value could not be read as a table.' });
    expect(await doc.table.inspect(['anything'])).toEqual({ groups: [] });
    ws.dispose();
  });
});

describe('the answers after open()', () => {
  it('inspects the first row of a selection, and nothing for a section, none, or a row that is gone', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    const { rows } = await doc.table.open();
    const entries = rows.filter((r) => r.parent !== null && String(r.parent).startsWith('section:'));
    const [first, second] = entries;
    const page = await doc.table.inspect([first.ID, second.ID]);
    expect(page.rowId).toBe(first.ID);
    expect(page.groups.length).toBeGreaterThan(0);
    expect(await doc.table.inspect(first.ID)).toEqual(page);
    const section = rows.find((r) => r.parent === null)!;
    expect(await doc.table.inspect([section.ID, first.ID])).toEqual({ groups: [] });
    expect(await doc.table.inspect([])).toEqual({ groups: [] });
    expect(await doc.table.inspect('file:///params.sldd/nothing')).toEqual({ groups: [] });
    ws.dispose();
  });

  it('answers a matrix, and says why for a row with none', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('nd_numeric.mat'), 'nd_numeric.mat');
    const { rows } = await doc.table.open();
    const withMatrix = rows.find((r) => r._matrix)!;
    const page = await doc.table.matrix(withMatrix._matrix!.nodeId);
    expect(page.matrix?.cells.length).toBe(page.matrix!.dims.reduce((a, b) => a * b, 1));
    expect(await doc.table.matrix('')).toEqual({ nodeId: '', message: 'This value could not be read as a table.' });
    ws.dispose();
  });
});

describe('reload', () => {
  it('tells every subscriber the new paint, then why the file could not be read', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    const before = await doc.table.open();
    const heard: TableChange[] = [];
    const stop = doc.table.subscribe((c) => heard.push(c));

    await doc.reload(fixture('chain_leaf.sldd'));
    expect(heard.map((c) => c.kind)).toEqual(['replaceAll']);
    const after = heard[0].kind === 'replaceAll' ? heard[0].view : undefined;
    expect(after).toEqual(await doc.table.open());
    expect(after!.rows).not.toEqual(before.rows);

    await doc.reload(text('{"x": '));
    expect(heard[1]).toEqual({ kind: 'error', message: `Failed to parse params.sldd: ${jsonError('{"x": ')}` });
    await expect(doc.table.open()).rejects.toThrow('Failed to parse params.sldd');
    // The old tree went with the failed read.
    expect(await doc.table.inspect(before.rows[1].ID)).toEqual({ groups: [] });

    stop();
    await doc.reload(fixture('params.sldd'));
    expect(heard).toHaveLength(2);
    expect((await doc.table.open()).rows).toEqual(before.rows);
    ws.dispose();
  });

  it('keeps telling the other subscribers when one throws, and says the throw', async () => {
    const notices: unknown[] = [];
    const ws = createWorkspace({ notify: (n) => void notices.push(n) });
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    const heard: string[] = [];
    doc.table.subscribe(() => {
      throw new Error('a listener of its own');
    });
    doc.table.subscribe((c) => heard.push(c.kind));
    // Its error is said as an error notice, as VS Code's emitter logs it: never thrown again,
    // which a Node or Electron host would take for a crash.
    const later = vi.fn();
    vi.stubGlobal('queueMicrotask', later);
    try {
      await doc.reload(fixture('params.sldd'));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(heard).toEqual(['replaceAll']);
    expect(notices).toEqual([{ level: 'error', message: 'A listener of params.sldd failed: a listener of its own' }]);
    expect(later).not.toHaveBeenCalled();
    ws.dispose();
  });

  it('with no notify, says a subscriber\'s throw on the console', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    const thrown = new Error('a listener of its own');
    doc.table.subscribe(() => {
      throw thrown;
    });
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls: unknown[][];
    try {
      await doc.reload(fixture('params.sldd'));
    } finally {
      calls = [...said.mock.calls];
      said.mockRestore();
    }
    expect(calls).toEqual([[thrown]]);
    ws.dispose();
  });
});

describe('closing', () => {
  it('a document: its table rejects open() and answers nothing, and its uri is free', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(fixture('params.sldd'), 'params.sldd');
    const { rows } = await doc.table.open();
    const heard: TableChange[] = [];
    doc.table.subscribe((c) => heard.push(c));
    doc.dispose();
    doc.dispose();
    await expect(doc.table.open()).rejects.toThrow('params.sldd is closed.');
    await expect(doc.reload(fixture('params.sldd'))).rejects.toThrow('params.sldd is closed.');
    expect(await doc.table.inspect(rows[1].ID)).toEqual({ groups: [] });
    expect(heard).toEqual([]);
    expect(ws.get(doc.uri)).toBeUndefined();
    ws.dispose();
  });

  it('a workspace: every document, and nothing of another workspace', async () => {
    const a = createWorkspace();
    const b = createWorkspace();
    const inA = await a.open(fixture('params.sldd'), 'params.sldd');
    const inB = await b.open(fixture('params.sldd'), 'params.sldd');
    const { rows } = await inB.table.open();
    // One uri, two sessions: neither sees the other's tree, nor the module-level registry either.
    expect(findNode('file:///params.sldd', rows[1].ID)).toBeNull();
    a.dispose();
    await expect(inA.table.open()).rejects.toThrow('closed');
    expect((await inB.table.inspect(rows[1].ID)).rowId).toBe(rows[1].ID);
    b.dispose();
  });
});

describe('createWorkspace', () => {
  it('takes a row budget of at least one row', () => {
    expect(() => createWorkspace({ rowBudget: 0 })).toThrow(RangeError);
    expect(() => createWorkspace({ rowBudget: Number.NaN })).toThrow(RangeError);
    createWorkspace({ rowBudget: Number.POSITIVE_INFINITY }).dispose();
  });
});
