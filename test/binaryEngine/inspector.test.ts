// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/binarySlddInspectorRefresh.test.ts at c73da3c.
//
// The Property Inspector and a compressed dictionary whose selected entry changes under it, run
// against view's binary dictionary engine. The inspector is handed a node when a row is selected,
// and builds its rows from it once; an edit, an undo or a redo, a save, a revert and a reload each
// leave the table showing nodes rebuilt under the same ids. The engine says when the document's tree
// changed (its `changed` hook, the extension's provider's `onChanged`), and the host answers that
// with the inspector's one re-resolve (InspectorSelection.refresh), as the extension's activate()
// wires it: the case wires its own engine to its own InspectorSelection the same way, and reads what
// the inspector was asked to show. A reload is the engine's `replace` with the bytes another program
// wrote (what the extension's disk follow hands it); following the disk is the extension's.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, it } from 'vitest';
import { buildPropertyGroups, createRegisters, InspectorSelection } from '../../src/model/index.js';
import { BinaryEngine, EditStack, EditStackIndex } from '../../src/host/index.js';
import { file, PARAMS, viewOf, waitFor, type View } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CHUNK = 'data/chunk0.xml';

/** The Value the inspector's rows say for `node`. */
const valueOf = (node: any): string | undefined =>
  buildPropertyGroups(node)
    .flatMap((g) => g.properties)
    .find((p) => p.name === 'Value')?.value;

describe('Binary .sldd: the Property Inspector follows the entry it shows', () => {
  let session: ReturnType<typeof createSession>;
  let engine: BinaryEngine;
  let view: View;
  let stack: EditStack;
  let index: EditStackIndex;
  let selection: InspectorSelection;
  /** The file on disk: what the last save wrote, and what a revert reads. */
  let disk: Uint8Array;
  /**
   * Every node the inspector was asked to show, with the Value its rows said, read when it was asked,
   * as the extension's inspector builds its rows; null for a clear.
   */
  let shown: ({ node: any; value: string | undefined } | null)[];

  beforeEach(async () => {
    session = createSession();
    shown = [];
    stack = new EditStack();
    index = new EditStackIndex();
    disk = file(PARAMS);
    // As activate() wires the registered provider: the selection relayed to the inspector, and the
    // tree's every change answered with its re-resolve.
    selection = new InspectorSelection(
      { showNode: (node) => void shown.push({ node, value: valueOf(node) }), clear: () => void shown.push(null) },
      (_uri, id) => session.findNodeById(id),
    );
    engine = new BinaryEngine({
      session,
      uri: 'file:///work/params.sldd',
      name: 'params.sldd',
      bytes: disk,
      sink: stack,
      index,
      registers: createRegisters(),
      changed: () => selection.refresh(engine.uri),
    });
    view = viewOf(engine);
    view.send({ type: 'ready' });
    await waitFor('the first rows', () => view.posts.some((p) => p.type === 'setRows'));
  });

  const entry = (name: string): any => {
    const found = (session.getDataSource(engine.srcId) as any)?.children.flatMap((s: any) => s.children).find((e: any) => e.name === name);
    assert.ok(found, `the document's model holds ${name}`);
    return found;
  };
  /** What the inspector shows now: the Value of the node it was last asked to show. */
  const showing = (): string | undefined => {
    const last = shown[shown.length - 1];
    assert.ok(last, 'the inspector shows a node');
    return last.value;
  };
  /** The node the inspector was last asked to show. */
  const showingNode = (): any => shown[shown.length - 1]?.node;
  // The table's `select`, relayed to the inspector as the extension's provider relays it (onSelect).
  const select = (name: string) => {
    view.send({ type: 'select', rowIds: [entry(name).id] });
    selection.show(engine.uri, [entry(name).id]);
  };
  const setValue = (name: string, value: string) => view.send({ type: 'edit', rowId: entry(name).id, columnId: 'Value', oldValue: '', newValue: value });
  const save = () => {
    const s = engine.beginSave();
    engine.saved(s);
    index.saved(s.at);
    disk = s.bytes;
  };

  it('an edit, its undo and its redo of the shown entry each show its value as it now is', () => {
    select('scalarD');
    assert.strictEqual(showing(), '3.14');
    setValue('scalarD', '42');
    assert.strictEqual(showing(), '42', 'the edit');
    view.send({ type: 'undo' });
    assert.strictEqual(showing(), '3.14', 'its undo');
    view.send({ type: 'redo' });
    assert.strictEqual(showing(), '42', 'its redo');
    assert.strictEqual(showingNode(), entry('scalarD'), 'from the node the session holds now');
  });

  it('a save, a revert and a reload from disk each show the node the document holds after it', () => {
    select('scalarD');
    setValue('scalarD', '42');
    save();
    assert.strictEqual(showingNode(), entry('scalarD'), 'the save re-registered the tree, and the inspector its node');
    assert.strictEqual(showing(), '42');

    setValue('scalarD', '7');
    assert.strictEqual(showing(), '7');
    engine.replace(disk);
    index.reverted();
    assert.strictEqual(showing(), '42', 'the revert');
    assert.strictEqual(showingNode(), entry('scalarD'));

    // Another program writes the file; the clean document follows it.
    const zip = unzipSync(disk);
    const saved = strFromU8(zip[CHUNK]);
    const changed = saved.replace(
      /(<P Name="Name" Class="char">scalarD<\/P>[\s\S]*?<P Name="Value" Class="double">)[^<]*</,
      (_, head: string) => `${head}5<`,
    );
    assert.notStrictEqual(changed, saved, 'the outside write changes scalarD');
    zip[CHUNK] = strToU8(changed);
    engine.replace(zipSync(zip, { level: 6 }));
    assert.strictEqual(showing(), '5', 'the inspector shows the value the file now holds');
    assert.strictEqual(showingNode(), entry('scalarD'));
  });

  it('a delete of the shown entry leaves the inspector to the table, which reports the selection that follows', () => {
    select('scalarD');
    const before = shown.length;
    view.send({ type: 'delete', rowIds: [entry('scalarD').id] });
    assert.ok(!engine.chunkXml.includes('>scalarD<'), 'the entry is gone');
    assert.ok(!shown.slice(before).includes(null), 'not cleared here: the table says what is selected next');
    const landing = view.posts.filter((p) => p.type === 'selectRows').pop();
    assert.ok(landing, 'and the table is told which row to select');
  });

  it('an edit of another entry shows the selected one again, unchanged', () => {
    select('scalarD');
    setValue('negD', '1');
    assert.strictEqual(showing(), '3.14');
    assert.strictEqual(showingNode(), entry('scalarD'));
  });

  // The table's own inspector page, which a page shows through connectInspector: what `inspect`
  // answers for the selected row follows the tree in the same way.
  it("the table's inspector page answers the entry as it now is", async () => {
    const page = async (): Promise<string | undefined> =>
      (await view.source.inspect(entry('scalarD').id)).groups.flatMap((g: any) => g.properties).find((p: any) => p.name === 'Value')?.value;
    assert.strictEqual(await page(), '3.14');
    setValue('scalarD', '42');
    assert.strictEqual(await page(), '42');
    view.send({ type: 'undo' });
    assert.strictEqual(await page(), '3.14');
  });
});
