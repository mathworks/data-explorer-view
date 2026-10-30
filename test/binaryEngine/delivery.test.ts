// Copyright 2026 The MathWorks, Inc.
//
// The compressed dictionary engine for a host that delivers each whole paint's rows itself
// (trailerAfterDelivery: the VS Code extension's, which posts the rows and then, in the same run,
// what follows them and its own after-paint work): a paint's trailer waits for the host's
// `opened(view)`, and each paint's trailer follows its own rows, whatever order they are delivered in.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type TableChange } from '../../src/model/index.js';
import { BinaryEngine, EditStack, EditStackIndex } from '../../src/host/index.js';
import { file, PARAMS } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function openDelivered(trailerAfterDelivery = true) {
  const stack = new EditStack();
  const engine = new BinaryEngine({
    session: createSession(),
    uri: 'file:///work/params_binary.sldd',
    name: 'params_binary.sldd',
    bytes: file(PARAMS),
    sink: { push: (e) => stack.push(e), undo: () => stack.undo(), redo: () => stack.redo() },
    index: new EditStackIndex(),
    registers: createRegisters(),
    trailerAfterDelivery,
  });
  const view = engine.view();
  const heard: TableChange[] = [];
  view.subscribe((c) => void heard.push(c));
  return { engine, view, heard };
}

const kinds = (heard: TableChange[]): string[] => heard.map((c) => c.kind);

describe('compressed dictionary engine, delivered by its host (trailerAfterDelivery)', () => {
  it("a host that delivers in the same run gets the extension's order: the rows, what follows them, then what is said next", async () => {
    const { engine, view, heard } = openDelivered();
    const answer = await view.open();
    assert.deepStrictEqual(kinds(heard), [], 'nothing behind the rows until they are delivered');
    view.opened(answer);
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    // A relay that delivers each repaint's rows as they are said, as the extension's post() does.
    heard.length = 0;
    const order: string[] = [];
    view.subscribe((c) => {
      order.push(c.kind);
      if (c.kind === 'replaceAll') {
        order.push('delivered');
        view.opened(c.view);
        order.push('drained');
      }
    });
    engine.repaintAll();
    assert.deepStrictEqual(order, ['replaceAll', 'delivered', 'sectionRules', 'clipboard', 'drained']);
  });

  it("each paint's trailer follows its own rows, delivered in the other order, and a repaint resolves on its own", async () => {
    const { view, heard } = openDelivered();
    const first = await view.open();
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    const second = (heard.find((c) => c.kind === 'replaceAll') as any).view;
    assert.notStrictEqual(second, first);
    heard.length = 0;
    // The repaint's rows are delivered first.
    view.opened(second);
    await Promise.resolve();
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    assert.strictEqual(repainted, true, "the repaint's own trailer, not the open's");
    view.opened(first);
    await repaint;
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard', 'sectionRules', 'clipboard']);
    view.opened(first);
    assert.strictEqual(heard.length, 4, 'a paint delivered twice is told once');
  });

  it('without a view, the oldest paint not yet delivered; a closed table waits for none', async () => {
    const { view, heard } = openDelivered();
    await view.open();
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    heard.length = 0;
    view.opened();
    await Promise.resolve();
    assert.strictEqual(repainted, false, "the open's, the oldest");
    view.opened();
    await repaint;
    const waiting = view.repaintAll();
    view.dispose();
    await waiting;
  });

  it('without it, a repaint sends its trailer behind its rows at once, as before', async () => {
    const { view, heard } = openDelivered(false);
    await view.open();
    view.opened();
    heard.length = 0;
    await view.repaintAll();
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard']);
  });
});
