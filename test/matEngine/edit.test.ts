// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/matEdit.test.ts at c73da3c: the MAT-file
// editor's cases, run against view's MAT-file engine (src/model/edit/matEngine.ts), with the edit
// stack VS Code holds as the list of edits it is handed (harness.ts). A save is the engine's
// beginSave, saved and the save point moved, and the file on disk the bytes it handed back. What
// is the extension's alone is left there: the disk (a file written outside, a folder deleted, the
// mode kept, a temporary file), the conflict prompt, the backup files and their ids, Save As, and
// the read-only view's hand-over.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { edit, fixture, keptUntouched, open, recordsOf, saidAfterPaint, same, tableOf, topRow, valuesOf, waitFor, nameOf, buffer } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MAT-file engine: edit, undo, save', () => {
  it('the view is editable, offers the gallery of the classes the file takes, and the clipboard', async () => {
    const o = await open('cases.mat');
    const set = o.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.editable, true);
    assert.ok(set.add.classes.includes('MatlabVariable'), 'the gallery offers a plain variable');
    assert.strictEqual(set.clipboard, undefined);
    assert.strictEqual(set.notice, undefined);
    const vec = topRow(o.view.posts, 'rowVec');
    assert.strictEqual(vec._canDelete, true);
    assert.strictEqual(vec._canAddChild, true);
    assert.strictEqual(vec._canCopy, true);
    assert.strictEqual(topRow(o.view.posts, 'strScalar')._valueEditable, true, 'a string takes a value edit');
    // Behind the rows, in the order the extension posts them: the drop rules, then the clipboard.
    assert.deepStrictEqual(
      o.view.posts.map((p) => p.type),
      ['setRows', 'sectionRules', 'clipboardState'],
    );
  });

  it('a value edit saves as that variable written fresh, and every other record as it was', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42', 'the row was repainted');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, 'Modified');
    const saved = o.save();
    assert.strictEqual(valuesOf(saved).get('scalarD').Value, '42');
    keptUntouched(o.original, saved, ['scalarD']);
    assert.ok(recordsOf(saved).get('scalarD')!.compressed, 'compressed, as the -v7 file it was written into');
    assert.strictEqual(o.index.dirty, false);
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '', 'saved: the row no longer differs from the file');
  });

  it('undo and redo move the tree and the dirty flag with the stack', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    edit(o, 'kp', 'Name', 'gain');
    assert.strictEqual(o.events.length, 2);
    o.undo();
    assert.ok(tableOf(o.view.posts).some((r) => nameOf(r) === 'kp'), 'the rename is undone');
    o.undo();
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '3.141592653589793', 'the value is undone');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '', 'and no longer differs from the file');
    assert.strictEqual(o.index.dirty, false, 'both undone: clean');
    o.redo();
    o.redo();
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42');
    assert.ok(tableOf(o.view.posts).some((r) => nameOf(r) === 'gain'));
    const back = valuesOf(o.save());
    assert.strictEqual(back.get('scalarD').Value, '42');
    assert.ok(back.has('gain') && !back.has('kp'));
    keptUntouched(o.original, o.disk(), ['scalarD', 'kp']);
  });

  it('an edit can still be undone after the save that wrote it, and the next save writes the undo', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    assert.strictEqual(valuesOf(o.save()).get('scalarD').Value, '42');
    assert.strictEqual((o.engine as any).generation, 0, 'the save keeps the tree');
    o.undo();
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '3.141592653589793');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, 'Modified', 'differs from the file as saved');
    assert.strictEqual(o.index.dirty, true);
    assert.strictEqual(valuesOf(o.save()).get('scalarD').Value, '3.141592653589793');
    keptUntouched(o.original, o.disk(), ['scalarD']);
  });

  it('an edit that lands while a save is writing is not in its bytes, and the save point stays before it', async () => {
    // The extension's save runs again until a round runs with the stack still (settledSave.ts);
    // what the engine owes that rule is a save point taken where the bytes were read.
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const save = o.engine.beginSave();
    edit(o, 'negD', 'Value', '7');
    o.engine.saved(save);
    o.index.saved(save.at);
    const back = valuesOf(save.bytes);
    assert.strictEqual(back.get('scalarD').Value, '42');
    assert.strictEqual(back.get('negD').Value, '-2.5', 'the edit that landed meanwhile is not in these bytes');
    assert.strictEqual(o.index.dirty, true, 'and the document is still dirty with it');
    assert.strictEqual(topRow(o.view.posts, 'negD').Status, 'Modified', 'which still differs from the file');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '');
    assert.strictEqual(valuesOf(o.save()).get('negD').Value, '7', 'the next round writes it');
    assert.strictEqual(o.index.dirty, false);
  });

  it('a paint in flight across a save paints the Status the save left', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const version = (o.engine as any).version;
    const from = o.view.posts.length;
    o.view.send({ type: 'ready' });
    o.save();
    assert.ok((o.engine as any).version > version, 'the save moved the version a paint checks after its await');
    await waitFor('the paint', () => o.view.posts.slice(from).some((p) => p.type === 'setRows'));
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '', 'not the Modified it built before the save');
  });

  it('a variable typed over as another class is Modified, and one added since the save stays New', async () => {
    const o = await open('cases.mat');
    const top = (name: string) => tableOf(o.view.posts).find((r) => r.parent == null && nameOf(r) === name);
    const str = topRow(o.view.posts, 'strScalar');
    o.view.send({ type: 'edit', rowId: str.ID, columnId: 'Value', oldValue: str.Value, newValue: '0' });
    await waitFor('strScalar a double', () => top('strScalar')?.Class === 'double');
    assert.strictEqual(top('strScalar').Status, 'Modified', 'the file holds a strScalar');
    o.view.send({ type: 'addEntry', className: 'MatlabVariable', rename: false });
    await waitFor('the added variable', () => !!top('var'));
    const added = top('var');
    o.view.send({ type: 'edit', rowId: added.ID, columnId: 'Value', oldValue: added.Value, newValue: '"abc"' });
    await waitFor('var a string', () => top('var')?.Class === 'string');
    assert.strictEqual(top('var').Status, 'New', 'the file holds no var');
    o.save();
    const again = top('var');
    o.view.send({ type: 'edit', rowId: again.ID, columnId: 'Value', oldValue: again.Value, newValue: '1' });
    await waitFor('var a double', () => top('var')?.Class === 'double');
    assert.strictEqual(top('var').Status, 'Modified', 'saved, the file holds it');
  });

  it('an undo or a redo that moves the classes core offers tells the gallery, as a gesture does', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const classes = () => [...o.view.posts].reverse().find((p) => p.type === 'setRows').add.classes as string[];
    const offered = classes();
    assert.ok(offered.length > 1, 'the file takes more than a plain variable');
    const mat: any = o.session.getDataSource(o.engine.srcId);
    mat.getAllowedTypes = () => ['MatlabVariable'];
    try {
      o.undo();
      await waitFor('the gallery told of the undo', () => classes().length === 1);
      delete mat.getAllowedTypes;
      o.redo();
      await waitFor('and of the redo', () => classes().length === offered.length);
    } finally {
      delete mat.getAllowedTypes;
    }
  });

  it('a save repaints the Status of the variables in the file, and not of one deleted from it', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    o.view.send({ type: 'delete', rowIds: [topRow(o.view.posts, 'negD').ID] });
    await waitFor('the deleted variable to leave the table', () => !tableOf(o.view.posts).some((r) => nameOf(r) === 'negD'));
    const from = o.view.posts.length;
    const held = new Set(tableOf(o.view.posts).map((r) => r.ID));
    o.save();
    const spliced = o.view.posts.slice(from).filter((p) => p.type === 'updateEntryRows');
    assert.deepStrictEqual(
      spliced.map((p) => p.entryRowId),
      [topRow(o.view.posts, 'scalarD').ID],
      'the one variable whose Status the save cleared, and no rows the table does not hold',
    );
    assert.ok(spliced.every((p) => held.has(p.entryRowId)));
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '');
  });

  it('a rename is the record with its new name; a delete leaves the rest as they were', async () => {
    const o = await open('cases.mat');
    edit(o, 'kp', 'Name', 'kpRenamed');
    o.view.send({ type: 'delete', rowIds: [topRow(o.view.posts, 'negD').ID] });
    assert.strictEqual(o.events.length, 2);
    await waitFor('the deleted variable to leave the table', () => !tableOf(o.view.posts).some((r) => nameOf(r) === 'negD'));
    const saved = o.save();
    const back = valuesOf(saved);
    assert.strictEqual(back.get('kpRenamed').Value, '1.5');
    assert.ok(!back.has('kp') && !back.has('negD'));
    keptUntouched(o.original, saved, ['kp', 'negD']);
  });

  it('Add makes `var` = 0, opens its name editor, and saves as a double', async () => {
    const o = await open('cases.mat');
    o.view.send({ type: 'addEntry', section: '', className: 'MatlabVariable', rename: true });
    assert.strictEqual(o.events.length, 1);
    await waitFor('the added row', () => tableOf(o.view.posts).some((r) => nameOf(r) === 'var'));
    const rename = o.view.posts.find((p) => p.type === 'beginRename');
    assert.ok(rename && rename.rowId === topRow(o.view.posts, 'var').ID, 'its name editor is asked for');
    assert.strictEqual(topRow(o.view.posts, 'var').Status, 'New');
    edit(o, 'var', 'Name', 'added1');
    const back = valuesOf(o.save());
    assert.strictEqual(back.get('added1').Value, '0');
    assert.strictEqual(back.get('added1').Class, 'double');
    keptUntouched(o.original, o.disk(), []);
  });

  it('two elements of a vector deleted in one gesture are one edit', async () => {
    const o = await open('cases.mat');
    const vec = topRow(o.view.posts, 'rowVec');
    const kids = tableOf(o.view.posts).filter((r) => r.parent === vec.ID);
    assert.strictEqual(kids.length, 3);
    o.view.send({ type: 'delete', rowIds: [kids[0].ID, kids[2].ID] });
    assert.strictEqual(o.events.length, 1, 'one gesture, one edit');
    assert.strictEqual(topRow(o.view.posts, 'rowVec').Value, '2');
    o.undo();
    assert.strictEqual(topRow(o.view.posts, 'rowVec').Value, '[1 2 3]', 'one undo puts both back');
    o.redo();
    assert.strictEqual(valuesOf(o.save()).get('rowVec').Value, '2');
    keptUntouched(o.original, o.disk(), ['rowVec']);
  });

  it('a Parameter takes an edit of its Value and its Storage Class; a property the save cannot write is refused', async () => {
    const o = await open('pv_basic.mat');
    edit(o, 'p', 'headerFile', 'a.h');
    const refused = o.view.posts.find((m) => m.type === 'validationError');
    assert.ok(refused, 'the edit is refused');
    assert.match(refused.reason, /"p"/);
    assert.ok(!refused.reason.includes('binedit:'), 'the refusal names the variable, not the srcId');
    assert.strictEqual(o.events.length, 0, 'and nothing reached the stack');
    assert.strictEqual(o.index.dirty, false);
    edit(o, 'p', 'storageClass', 'ExportedGlobal');
    edit(o, 'p', 'Value', '7');
    assert.strictEqual(o.events.length, 2);
    const saved = o.save();
    const p = valuesOf(saved).get('p');
    assert.strictEqual(p.Value, '7');
    assert.strictEqual(p.storageClass?.text ?? p.storageClass, 'ExportedGlobal');
    assert.strictEqual(valuesOf(saved).get('q').Value, '5', 'the other Parameter is untouched');
    keptUntouched(o.original, saved, ['']);
  });

  it('a -v6 file stays uncompressed through a rename and a delete', async () => {
    const o = await open('nested_handles.mat');
    assert.strictEqual(topRow(o.view.posts, 's_fh')._valueEditable, false, 'a struct of function handles takes no value edit');
    edit(o, 's_fh', 'Name', 's_renamed');
    o.view.send({ type: 'delete', rowIds: [topRow(o.view.posts, 'c_fh').ID] });
    assert.strictEqual(o.events.length, 2);
    const saved = o.save();
    for (const [name, rec] of recordsOf(saved)) assert.strictEqual(rec.compressed, false, `"${name}" is uncompressed`);
    const back = valuesOf(saved);
    assert.ok(back.has('s_renamed') && !back.has('s_fh') && !back.has('c_fh'));
    keptUntouched(o.original, saved, ['s_fh', 'c_fh']);
  });

  it('a save with no edit writes the file byte for byte', async () => {
    const o = await open('cases.mat');
    assert.ok(same(o.save(), o.original));
  });

  it('a save core refuses hands back nothing, keeps the edits, and says why', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const mat: any = o.session.getDataSource(o.engine.srcId);
    structuredClone(mat.headerBytes.buffer, { transfer: [mat.headerBytes.buffer] });
    assert.throws(
      () => o.engine.beginSave(),
      (err: Error) => {
        assert.match(err.message, /^Cannot save "cases\.mat": /);
        assert.match(err.message, /Nothing was written\.$/);
        return true;
      },
    );
    assert.strictEqual(o.index.dirty, true, 'the edit is still unsaved');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, 'Modified');
  });

  it('a reload puts the new tree in, and a paint that awaited across it paints that tree', async () => {
    const o = await open('cases.mat');
    const from = o.view.posts.length;
    o.view.send({ type: 'ready' });
    await o.engine.replace(buffer(fixture('pv_basic.mat')));
    const paints = () => o.view.posts.slice(from).filter((p) => p.type === 'setRows');
    await waitFor('both paints', () => paints().length >= 2);
    for (const paint of paints()) {
      const names = paint.rows.filter((r: any) => r.parent == null).map(nameOf);
      assert.ok(names.includes('p'), 'the reloaded file’s variables');
      assert.ok(!names.includes('scalarD'), 'and none of the tree the reload replaced');
    }
  });

  it('an edit from before a reload is not undone on the new tree, and says so', async () => {
    const changed: number[] = [];
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const saved = o.save();
    edit(o, 'negD', 'Value', '7');
    (o.engine as any).options.changed = () => changed.push(1);
    await o.engine.replace(buffer(saved));
    assert.deepStrictEqual(changed, [1], 'told the tree changed, once');
    await waitFor('the reloaded rows', () => topRow(o.view.posts, 'negD').Value === '-2.5');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42', 'the disk holds the save');
    o.undo();
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42', 'the old tree’s edit does nothing to this one');
    const mat: any = o.session.getDataSource(o.engine.srcId);
    assert.strictEqual(mat.children.find((c: any) => c.name === 'scalarD').toRow().Value, '42');
    assert.deepStrictEqual(o.notices, [
      { level: 'status', message: 'cases.mat was reloaded from disk since this edit was made, so it cannot be undone.', ms: 5000 },
    ]);
  });

  it('a gesture that throws part-way is still one edit, so Undo lands on the edit it undoes', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const vec = topRow(o.view.posts, 'rowVec');
    const kids = tableOf(o.view.posts).filter((r) => r.parent === vec.ID);
    const from = o.view.posts.length;
    const session = o.session as any;
    const real = session.deleteNodeById;
    let calls = 0;
    session.deleteNodeById = (id: string) => {
      if (++calls === 2) throw new Error('the second step failed');
      return real.call(session, id);
    };
    try {
      o.view.send({ type: 'delete', rowIds: [kids[0].ID, kids[2].ID] });
    } finally {
      session.deleteNodeById = real;
    }
    assert.strictEqual(o.events.length, 2, 'the step core recorded is an edit the stack knows of');
    await waitFor('the rows as core left them', () => topRow(o.view.posts, 'rowVec').Value === '[2 3]');
    await waitFor('the error, after the paint, which clears the banner', () => saidAfterPaint(o.view.posts.slice(from)));
    assert.match(o.view.posts.filter((p) => p.type === 'error').pop().message, /the second step failed/);
    o.undo();
    await waitFor('the delete undone', () => topRow(o.view.posts, 'rowVec').Value === '[1 2 3]');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42', 'and only the delete');
    o.undo();
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '3.141592653589793');
    assert.strictEqual(o.index.dirty, false);
  });

  it('an edit that does not land puts the cell back, then says why; so does a message that throws', async () => {
    const o = await open('cases.mat');
    const session = o.session as any;
    const scalar = topRow(o.view.posts, 'scalarD');
    let from = o.view.posts.length;
    o.view.send({ type: 'edit', rowId: scalar.ID + '-gone', columnId: 'Value', oldValue: scalar.Value, newValue: '42' });
    await waitFor('every row painted, then the error', () => saidAfterPaint(o.view.posts.slice(from)));
    assert.match(o.view.posts.filter((p) => p.type === 'error').pop().message, /Could not locate/);
    const real = session.editProperty;
    session.editProperty = () => false;
    from = o.view.posts.length;
    try {
      o.view.send({ type: 'edit', rowId: scalar.ID, columnId: 'Value', oldValue: scalar.Value, newValue: '42' });
    } finally {
      session.editProperty = real;
    }
    const after = o.view.posts.slice(from);
    assert.deepStrictEqual(
      after.map((p) => p.type),
      ['updateEntryRows', 'error'],
      'the variable put back as the tree holds it, and then the error',
    );
    assert.strictEqual(after[0].entryRowId, scalar.ID);
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, scalar.Value);
    assert.strictEqual(o.events.length, 0, 'and no edit');
    const find = session.findNodeById;
    session.findNodeById = () => {
      throw new Error('the lookup failed');
    };
    from = o.view.posts.length;
    try {
      o.view.send({ type: 'edit', rowId: scalar.ID, columnId: 'Value', oldValue: scalar.Value, newValue: '42' });
    } finally {
      session.findNodeById = find;
    }
    await waitFor('the error', () => saidAfterPaint(o.view.posts.slice(from)));
    assert.match(o.view.posts.filter((p) => p.type === 'error').pop().message, /the lookup failed/);
  });

  it('a listener of the table that throws costs the others nothing, and is no failed edit', async () => {
    const o = await open('cases.mat');
    o.view.source.subscribe((change) => {
      if (change.kind === 'updateEntry') throw new Error('the panel is gone');
    });
    const from = o.view.posts.length;
    edit(o, 'scalarD', 'Value', '42');
    // Time for the repaint and the report that a throw taken for a failed edit would send.
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    const after = o.view.posts.slice(from);
    assert.deepStrictEqual(after.map((p) => p.type), ['updateEntryRows'], 'the table served beside it got the rows, and no error');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Value, '42');
    assert.strictEqual(o.events.length, 1);
  });

  it('a backup core refuses says so once, naming who restores the one kept', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const first = o.engine.backup(false);
    assert.strictEqual(valuesOf(first).get('scalarD').Value, '42', 'a backup is the whole file as a save would write it');
    assert.strictEqual(o.index.dirty, true, 'and moves no save point');
    edit(o, 'negD', 'Value', '7');
    const mat: any = o.session.getDataSource(o.engine.srcId);
    const header = mat.headerBytes;
    mat.headerBytes = header.slice();
    structuredClone(mat.headerBytes.buffer, { transfer: [mat.headerBytes.buffer] });
    assert.throws(() => o.engine.backup(true));
    assert.throws(() => o.engine.backup(true));
    assert.strictEqual(o.notices.length, 1, 'said once, until a backup succeeds');
    assert.match(o.notices[0].message, /^Cannot save "cases\.mat": /);
    assert.match(o.notices[0].message, /If VS Code restarts now, it restores cases\.mat as it was before the latest edits\.$/);
    assert.strictEqual(o.notices[0].level, 'warning');

    // Bytes handed back are not yet a backup: only the host's write landing says it again.
    mat.headerBytes = header;
    o.engine.backup(true);
    structuredClone((mat.headerBytes = header.slice()).buffer, { transfer: [mat.headerBytes.buffer] });
    assert.throws(() => o.engine.backup(true));
    assert.strictEqual(o.notices.length, 1, 'a backup whose write never landed re-arms nothing');
    mat.headerBytes = header;
    o.engine.backup(true);
    o.engine.backupWritten();
    structuredClone((mat.headerBytes = header.slice()).buffer, { transfer: [mat.headerBytes.buffer] });
    assert.throws(() => o.engine.backup(true));
    assert.strictEqual(o.notices.length, 2, 'once a backup is written, the next refusal is said again');
  });

  it('a hot-exit backup is a whole MAT-file, and restoring it restores the edits', async () => {
    const o = await open('cases.mat');
    edit(o, 'scalarD', 'Value', '42');
    const backup = o.engine.backup(false);
    const restored = await open('cases.mat', backup, { fromBackup: true });
    assert.strictEqual(topRow(restored.view.posts, 'scalarD').Value, '42');
    assert.strictEqual(restored.index.dirty, true, 'a restored backup is unsaved');
    const saved = restored.save();
    assert.strictEqual(valuesOf(saved).get('scalarD').Value, '42');
    keptUntouched(o.original, saved, ['scalarD']);
    assert.strictEqual(restored.index.dirty, false);
  });

  it('a file whose records do not tile it opens read-only, and takes no edit', async () => {
    const junk = new Uint8Array([...fixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const o = await open('pv_basic.mat', junk, { as: 'tail.mat' });
    const set = o.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.editable, false);
    assert.match(set.notice, /^Read-only: Cannot save "tail\.mat": /);
    edit(o, 'x', 'Name', 'y');
    assert.strictEqual(o.events.length, 0);
    assert.strictEqual(o.index.dirty, false);
  });

  it('a -v7.3 file shows why it cannot be opened', async () => {
    const header = new Uint8Array(600);
    header.set(new TextEncoder().encode('MATLAB 7.3 MAT-file, Platform: x'));
    header[124] = 0x00;
    header[125] = 0x02;
    header[126] = 0x49; // 'I'
    header[127] = 0x4d; // 'M'
    const o = await open('cases.mat', header, { as: 'hdf5.mat' });
    const error = o.view.posts.find((p) => p.type === 'error');
    assert.ok(error, 'the tab says it failed');
    assert.match(error.message, /7\.3/);
  });
});
