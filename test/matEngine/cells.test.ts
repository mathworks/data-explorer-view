// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/readOnlyCellEdit.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/descriptionApplies.test.ts at c73da3c
//
// A cell of a MAT-file as its table edits it, run against view's MAT-file engine through the
// messages its table sends: a read-only cell refused, and a Description shown and saved only where
// the object has one. Each suite's MAT-file half is here; its dictionary halves are
// test/jsonEngine/cells.test.ts and test/binaryEngine/cells.test.ts, under the same names.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { fixture, open, readMat, topRow, variableOf, waitFor } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('An edit of a read-only cell is refused, with its reason, and changes nothing', () => {
  /** What a refused edit leaves on the view: the validation dialog, then a repaint of that row. */
  const refusal = (posts: any[]) => {
    const at = posts.findIndex((p) => p.type === 'validationError');
    assert.ok(at >= 0, 'the edit is answered with a validation error');
    return { error: posts[at], after: posts.slice(at + 1) };
  };

  it('in a MAT-file: no edit is pushed', async () => {
    const m = await open('ro.mat', fixture('cases.mat'));
    const row = topRow(m.view.posts, 'scalarD');
    m.view.posts.length = 0;
    m.view.send({ type: 'edit', rowId: row.ID, columnId: 'Kind', oldValue: row.Kind, newValue: 'Numeric Type' });
    const { error } = refusal(m.view.posts);
    assert.ok(typeof error.reason === 'string' && error.reason.length > 0, `refused with a reason (${error.reason})`);
    assert.ok(!error.reason.includes(m.engine.srcId), 'naming the file, not its srcId');
    assert.ok(m.view.posts.some((p) => p.type === 'updateEntryRows'), 'the row painted again');
    assert.strictEqual(m.events.length, 0, 'no edit reached VS Code');
    assert.strictEqual(m.index.dirty, false);
    assert.strictEqual(variableOf(m, 'scalarD').toRow().Kind, row.Kind);
  });
});

const NEW_TEXT = 'gravity in metres per second squared';

describe('A Description is shown and saved where the object has one, and refused where it has none', () => {
  /** The validation error a refused edit is answered with. */
  const refusalIn = async (posts: any[]): Promise<any> => {
    await waitFor('the refusal', () => posts.some((p) => p.type === 'validationError'));
    return posts.find((p) => p.type === 'validationError');
  };

  /** The view offers a Description column, labelled: every host's posted columns left it out. */
  const assertDescriptionColumn = (posts: any[]) => {
    const payload = posts.filter((p) => p.type === 'setRows').pop();
    assert.ok(payload?.columns?.includes('Description'), `the Description column is offered (${payload?.columns})`);
    assert.strictEqual(payload.columnLabels?.Description, 'Description');
  };

  const editDescription = (view: { send(m: any): void }, row: any, newValue: string) =>
    view.send({ type: 'edit', rowId: row.ID, columnId: 'Description', oldValue: String(row.Description ?? ''), newValue });

  it('in a MAT-file', async () => {
    const m = await open('desc.mat', fixture('pv_basic.mat'));
    assertDescriptionColumn(m.view.posts);

    const [x, p] = ['x', 'p'].map((n) => topRow(m.view.posts, n));
    assert.strictEqual(x._descriptionApplies, false, 'a plain variable has no Description');
    m.view.posts.length = 0;
    editDescription(m.view, x, 'typed anyway');
    const error = await refusalIn(m.view.posts);
    assert.match(error.reason, /^Cannot edit "x": an? \S.* has no Description\.$/);
    assert.strictEqual(m.events.length, 0, 'no edit reached VS Code');
    assert.strictEqual(m.index.dirty, false);

    assert.strictEqual(p._descriptionApplies, true, 'a Simulink.Parameter has a Description');
    m.view.posts.length = 0;
    editDescription(m.view, p, NEW_TEXT);
    await waitFor('the edit pushed', () => m.events.length > 0);
    assert.ok(!m.view.posts.some((post) => post.type === 'validationError'), 'the edit was not refused');
    const saved = readMat(m.save(), (mat) => (mat.children as any[]).find((v) => v.name === 'p').toRow().Description);
    assert.strictEqual(saved, NEW_TEXT, 'the Description survives a fresh read of the saved file');
  });
});
