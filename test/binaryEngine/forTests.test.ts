// Copyright 2026 The MathWorks, Inc.
//
// The compressed dictionary engine's seam for the VS Code extension's integration suites
// (`forTests`), which do to the document what they did before its editor moved onto this engine:
// set its chunk as though an edit had written it, push an edit as a gesture pushes one, replace its
// parts as a reload does, and reach the tables a repaint reaches.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { unzipSync } from 'fflate';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { BinaryEngine, EditStack, EditStackIndex, type Edit } from '../../src/host/index.js';
import { file, PARAMS } from './harness.js';

function document() {
  const stack = new EditStack();
  const pushed: Edit[] = [];
  const index = new EditStackIndex();
  const engine = new BinaryEngine({
    session: createSession(),
    uri: 'file:///work/params_binary.sldd',
    name: 'params_binary.sldd',
    bytes: file(PARAMS),
    sink: { push: (e) => (pushed.push(e), stack.push(e)), undo: () => stack.undo(), redo: () => stack.redo() },
    index,
    registers: createRegisters(),
  });
  return { engine, stack, pushed, index };
}

describe("the compressed dictionary engine's seam for the extension's suites", () => {
  it('sets the chunk the save gate then holds a save to', () => {
    const { engine } = document();
    engine.forTests.setChunk('<Root><unterminated');
    assert.strictEqual(engine.chunkXml, '<Root><unterminated');
    assert.throws(() => engine.beginSave(), /^Error: Refusing to save: the document did not re-parse/);
  });

  it('pushes an edit as a gesture pushes one, whose undo and redo move the chunk and the stack', () => {
    const { engine, stack, pushed, index } = document();
    const before = engine.chunkXml;
    const after = before.replace('>gravity<', '>gravityR<');
    engine.forTests.pushEdit('Edit Name', before, after);
    assert.strictEqual(engine.chunkXml, after);
    assert.deepStrictEqual(
      pushed.map((e) => e.label),
      ['Edit Name'],
    );
    assert.strictEqual(index.dirty, true);
    stack.undo();
    assert.strictEqual(engine.chunkXml, before);
    assert.strictEqual(index.dirty, false);
    stack.redo();
    assert.strictEqual(engine.chunkXml, after);
  });

  it("replaces the parts from a zip's members, the data part left out, as a reload does", () => {
    const { engine } = document();
    const members = unzipSync(file(PARAMS));
    engine.forTests.resetParts({ ...members, 'extra/part.xml': new Uint8Array([1]) });
    assert.ok(!Object.keys(engine.parts).includes('data/chunk0.xml'), 'the data part is the chunk, never a part');
    assert.deepStrictEqual(
      Object.keys(engine.parts).sort(),
      [...Object.keys(members).filter((m) => m !== 'data/chunk0.xml'), 'extra/part.xml'].sort(),
    );
  });

  it('reaches the tables a repaint reaches, where a stand-in sees which repaint ran', () => {
    const { engine } = document();
    const calls: string[] = [];
    engine.forTests.views.add({ repaintAll: (from) => calls.push(`all ${from ?? 'chunk'}`), repaintOps: () => calls.push('ops') });
    engine.repaintAll('registered');
    assert.deepStrictEqual(calls, ['all registered']);
  });
});
