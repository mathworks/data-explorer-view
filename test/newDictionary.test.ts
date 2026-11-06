// Copyright 2026 The MathWorks, Inc.
//
// A NEW DATA DICTIONARY, MADE IN THE PAGE (Workspace.create, the shell's New).
//
// What New makes is a file another program reads: its first save must be a dictionary MATLAB
// opens. So the bytes are held here to the ones MATLAB writes for a new dictionary itself, kept
// beside this test: newFile/fixtures/created_r2027a.sldd, which R2027a wrote by
// `Simulink.data.dictionary.create` and `saveChanges` (newFile/fixtures/created_r2027a.m says how).
// Those bytes are core's own writer's (textDictionaryJson) over core's own names for the parts, so
// a change on either side shows here. MATLAB opened what this writes, took an entry into it, saved
// it and opened it again (R2027a, 2026-11-06): the same script.
//
// And the document is the user's to save, as an untitled file in any editor is: unsaved from the
// moment it opens, whatever is undone, until a save of it lands. Before then no file holds it, so no
// state of its undo stack is the file, which is what a file kept over another program's write is
// (Doc.keepOver) too.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataModel } from 'data-explorer-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, isEditable, sourceUri, type Doc, type EditableTableSource, type Workspace } from '../src/model/index.js';
import { newDictionaryBytes } from '../src/model/source/newDictionary.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MATLAB_NEW = new Uint8Array(readFileSync(fileURLToPath(new URL('./newFile/fixtures/created_r2027a.sldd', import.meta.url))));

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
  // Nothing here registers in core's module-level session, which the VS Code extension uses.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

function workspace(editing = true): Workspace {
  const ws = createWorkspace({ editing });
  workspaces.push(ws);
  return ws;
}

/** A task or two: an edit, an undo and a dirty change land after the call that asks for them. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** The editable table of `doc`. */
function editableOf(doc: Doc): EditableTableSource {
  if (!isEditable(doc.table)) throw new Error(`${doc.name} takes no edits`);
  return doc.table;
}

/** Add a Simulink.Parameter to Design Data through `doc`'s table, and let it land. */
async function addParameter(doc: Doc): Promise<void> {
  editableOf(doc).addEntry({ section: 'design', className: 'Simulink.Parameter', rename: false });
  await settle();
}

/** The names of the entries a paint of `doc`'s table shows. */
async function entryNames(doc: Doc): Promise<string[]> {
  const rows = (await doc.table.open()).rows;
  return rows.filter((r) => !r.ID.startsWith('section:')).map((r) => String(r.Name?.label));
}

describe('newDictionaryBytes', () => {
  it('is what MATLAB writes for a new dictionary, byte for byte', () => {
    expect(newDictionaryBytes()).toEqual(MATLAB_NEW);
    // A copy each time: a workspace keeps the bytes it is given.
    expect(newDictionaryBytes()).not.toBe(newDictionaryBytes());
  });
});

describe('Workspace.create', () => {
  it('opens a new dictionary to edit, as a JSON dictionary is, unsaved from the start', async () => {
    const ws = workspace();
    const doc = await ws.create('untitled.sldd');
    expect(doc.uri).toBe(sourceUri('/untitled.sldd'));
    expect(doc.name).toBe('untitled.sldd');
    expect(doc.kind).toBe('dictionary');
    expect(doc.editable).toBe(true);
    expect(doc.dirty).toBe(true);
    expect(ws.get(doc.uri)).toBe(doc);
    const view = await doc.table.open();
    expect(view.editable).toBe(true);
    expect(await entryNames(doc)).toEqual([]);
    // Its first save writes MATLAB's own new dictionary.
    expect(doc.serialize().bytes).toEqual(MATLAB_NEW);
  });

  it('opens under the uri given, as open does', async () => {
    const ws = workspace();
    const uri = sourceUri('/work/plant.sldd');
    const doc = await ws.create('plant.sldd', uri);
    expect(doc.uri).toBe(uri);
    expect(ws.get(uri)).toBe(doc);
  });

  it('stays unsaved whatever is undone, until a save of it lands', async () => {
    const ws = workspace();
    const doc = await ws.create('untitled.sldd');
    await doc.table.open();
    const told: boolean[] = [];
    doc.onDirty((d) => void told.push(d));
    await addParameter(doc);
    expect(await entryNames(doc)).toHaveLength(1);
    editableOf(doc).undo();
    await settle();
    expect(await entryNames(doc)).toEqual([]);
    // Back at the text it opened with, which no file holds yet.
    expect(doc.dirty).toBe(true);
    expect(told).toEqual([]);

    const save = doc.serialize();
    doc.saved(save.at);
    expect(doc.dirty).toBe(false);
    expect(told).toEqual([false]);
    // Now a state of its stack is the file: an edit and its undo come back to it.
    await addParameter(doc);
    expect(doc.dirty).toBe(true);
    editableOf(doc).undo();
    await settle();
    expect(doc.dirty).toBe(false);
  });

  it('a save that never landed leaves it unsaved', async () => {
    const ws = workspace();
    const doc = await ws.create('untitled.sldd');
    const save = doc.serialize();
    doc.notSaved(save.at);
    expect(doc.dirty).toBe(true);
  });

  it('saves what was added to it as a dictionary core reads back', async () => {
    const ws = workspace();
    const doc = await ws.create('untitled.sldd');
    await doc.table.open();
    await addParameter(doc);
    const [name] = await entryNames(doc);
    const { bytes } = doc.serialize();
    expect(JSON.parse(new TextDecoder().decode(bytes)).__MW_TEXT_COREPROPERTIES__).toEqual({ release: 'R2027a' });
    const again = await workspace(false).open(bytes, 'untitled.sldd');
    expect(await entryNames(again)).toEqual([name]);
  });

  it('refuses a name that is not a dictionary, a uri already open, a workspace that does not edit, and a closed one', async () => {
    const ws = workspace();
    await expect(ws.create('untitled.mat')).rejects.toThrow('untitled.mat is not a data dictionary (.sldd)');
    await ws.create('untitled.sldd');
    await expect(ws.create('untitled.sldd')).rejects.toThrow('file:///untitled.sldd is already open in this workspace.');
    await expect(workspace(false).create('untitled.sldd')).rejects.toThrow('A workspace that does not edit makes no new file');
    ws.dispose();
    await expect(ws.create('other.sldd')).rejects.toThrow('This workspace is closed.');
  });
});
