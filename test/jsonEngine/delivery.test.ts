// Copyright 2026 The MathWorks, Inc.
//
// The JSON dictionary engine for a host that delivers each whole paint's rows itself
// (trailerAfterDelivery: the VS Code extension's, which posts the rows and then, in the same run,
// what follows them and its own after-paint work): a paint's trailer waits for the host's
// `opened(view)`, and each paint's trailer follows its own rows, whatever order they are delivered
// in. And what a table has of its own (its `changed`), and the registry an engine shares with the
// module's functions (defaultRegistry).
import * as assert from 'node:assert';
import { createSession, DataModel } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type TableChange } from '../../src/model/index.js';
import { defaultRegistry, getModel, JsonEngine, peekModel, releaseSourceView } from '../../src/host/index.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { diskOf, file, settle, WORKSPACE_PARAMS } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function openDelivered(opts: { trailerAfterDelivery?: boolean; changed?: () => void; registry?: DocumentRegistry; uri?: string } = {}) {
  const bytes = file(WORKSPACE_PARAMS);
  const engine = new JsonEngine({
    registry: opts.registry ?? new DocumentRegistry(createSession()),
    uri: opts.uri ?? 'file:///work/params.sldd',
    name: 'params.sldd',
    text: createTextStore(new TextDecoder().decode(bytes)),
    registers: createRegisters(),
    disk: diskOf(bytes),
    trailerAfterDelivery: opts.trailerAfterDelivery ?? true,
    ...(opts.changed ? { changed: opts.changed } : {}),
  });
  const view = engine.view();
  const heard: TableChange[] = [];
  view.subscribe((c) => void heard.push(c));
  return { engine, view, heard };
}

const kinds = (heard: TableChange[]): string[] => heard.map((c) => c.kind);

/** The next whole paint the table says, once it has said one (a repaint waits on the Usage column). */
async function nextReplaceAll(heard: TableChange[]): Promise<any> {
  for (let i = 0; i < 50 && !heard.some((c) => c.kind === 'replaceAll'); i++) await settle(1);
  const paint = heard.find((c) => c.kind === 'replaceAll') as any;
  assert.ok(paint, 'the repaint said its rows');
  return paint.view;
}

describe('JSON dictionary engine, delivered by its host (trailerAfterDelivery)', () => {
  it("a host that delivers in the same run gets the extension's order: the rows, what follows them, then what it does after a paint", async () => {
    const order: string[] = [];
    const { view, heard } = openDelivered({ changed: () => void order.push('changed') });
    const answer = await view.open();
    assert.deepStrictEqual(kinds(heard), [], 'nothing behind the rows until they are delivered');
    view.opened(answer);
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    assert.deepStrictEqual(order, ['changed']);
    // A relay that delivers each repaint's rows as they are said, as the extension's post() does,
    // and then drains the navigation it holds.
    order.length = 0;
    view.subscribe((c) => {
      order.push(c.kind);
      if (c.kind === 'replaceAll') {
        order.push('delivered');
        view.opened(c.view);
        order.push('drained');
      }
    });
    await view.repaintAll();
    assert.deepStrictEqual(order, ['replaceAll', 'delivered', 'sectionRules', 'clipboard', 'changed', 'drained']);
  });

  it("each paint's trailer follows its own rows, delivered in the other order, and a repaint resolves on its own", async () => {
    const { view, heard } = openDelivered();
    const first = await view.open();
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    const second = await nextReplaceAll(heard);
    assert.notStrictEqual(second, first);
    heard.length = 0;
    // The repaint's rows are delivered first, the open's after them.
    view.opened(second);
    await settle(1);
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    assert.strictEqual(repainted, true, "the repaint's own trailer, not the open's");
    view.opened(first);
    await repaint;
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard', 'sectionRules', 'clipboard']);
    view.opened(first);
    assert.strictEqual(heard.length, 4, 'a paint delivered twice is told once');
  });

  it("two opens answered by one paint wait for one delivery, and the repaint's waits for its own", async () => {
    const { view, heard } = openDelivered();
    // A second `ready` before the first paint has landed: both are answered by the newest paint.
    const [a, b] = await Promise.all([view.open(), view.open()]);
    assert.strictEqual(a, b, 'one paint answers both');
    view.opened(a);
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard']);
    view.opened(b);
    assert.deepStrictEqual(kinds(heard), ['sectionRules', 'clipboard'], 'and its trailer is sent once');
  });

  it('without a view, the oldest paint not yet delivered; a closed table waits for none', async () => {
    const { view, heard } = openDelivered();
    await view.open();
    let repainted = false;
    const repaint = view.repaintAll().then(() => void (repainted = true));
    await nextReplaceAll(heard);
    view.opened();
    await settle(1);
    assert.strictEqual(repainted, false, "the open's, the oldest");
    view.opened();
    await repaint;
    heard.length = 0;
    const waiting = view.repaintAll();
    await nextReplaceAll(heard);
    view.dispose();
    await waiting;
  });

  it('without it, a repaint sends its trailer behind its rows at once, as before', async () => {
    const { view, heard } = openDelivered({ trailerAfterDelivery: false });
    await view.open();
    view.opened();
    heard.length = 0;
    await view.repaintAll();
    assert.deepStrictEqual(kinds(heard), ['replaceAll', 'sectionRules', 'clipboard']);
  });
});

describe("a JSON dictionary's table and its own `changed`", () => {
  it("a table given its own is told of its repaints in place of the engine's; one without it tells the engine's", async () => {
    const said: string[] = [];
    const { engine, view } = openDelivered({ trailerAfterDelivery: false, changed: () => void said.push('engine') });
    const own = engine.view({ changed: () => void said.push('own') });
    await view.open();
    view.opened();
    await own.open();
    own.opened();
    assert.deepStrictEqual(said, ['engine', 'own']);
    said.length = 0;
    await own.repaintAll();
    assert.deepStrictEqual(said, ['own'], "its repaint says it to its own hook, not the engine's");
    said.length = 0;
    await view.repaintAll();
    assert.deepStrictEqual(said, ['engine']);
    own.dispose();
    view.dispose();
  });
});

describe('defaultRegistry', () => {
  it("is the registry the module's functions answer from, so an engine over it holds its tree where they find it", async () => {
    const uri = 'file:///work/default-registry.sldd';
    assert.strictEqual(peekModel(uri), null);
    const { view } = openDelivered({ registry: defaultRegistry, uri, trailerAfterDelivery: false });
    await view.open();
    view.opened();
    const tree = peekModel(uri);
    assert.ok(tree, "the engine's tree is found by peekModel");
    assert.strictEqual(defaultRegistry.peekModel(uri), tree);
    assert.ok(DataModel.hasDataSource(uri), "in core's module-level session");
    // And the other way round: what the module's getModel registers, the registry holds.
    const other = 'file:///work/default-registry-other.sldd';
    const built = getModel(other, 'other.sldd', new TextDecoder().decode(file(WORKSPACE_PARAMS)));
    assert.strictEqual(defaultRegistry.peekModel(other), built);
    view.dispose();
    assert.ok(!DataModel.hasDataSource(uri), 'the last table closing released it');
    defaultRegistry.invalidate(other);
    releaseSourceView(other);
  });
});
