// Copyright 2026 The MathWorks, Inc.
//
// The JSON engine and its text where something around them misbehaves: a listener of the text, or
// of a table, that throws; a reload of the text the store already holds, or of one entry changed;
// and a throw in what follows a paint. Each is answered as VS Code answers it: a listener's throw is
// its own (VS Code's emitter calls each one on its own terms, and logs the throw), a reload reports
// what differs, and the trailer's throw is lost, as the extension's promise rejects with nobody to
// hear it, and with it whatever was to be said after that repaint.
import * as assert from 'node:assert';
import { describe, it, vi } from 'vitest';
import { createRegisters, type Registers } from '../../src/model/index.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import type { TextStoreChange } from '../../src/model/edit/hooks.js';
import { entryRow, file, open, settle, tableOf, WORKSPACE_PARAMS } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Run `body` with what is said on the console's error kept in `said`. */
async function quietConsole(body: (said: unknown[][]) => Promise<void>): Promise<void> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const said: unknown[][] = [];
  spy.mockImplementation((...args: unknown[]) => void said.push(args));
  try {
    await body(said);
  } finally {
    spy.mockRestore();
  }
}

const rowOf = (posts: any[], name: string): any => tableOf(posts).find((r) => r.parent?.startsWith('section:') && r.Name?.label === name);

describe('the text store: a listener that throws', () => {
  it('costs the other listeners nothing, nor the dirty change, nor the edit its answer; its throw is reported', async () => {
    const reported: unknown[] = [];
    const later = vi.fn();
    vi.stubGlobal('queueMicrotask', later);
    try {
      const store = createTextStore('{"a": 1}', (err) => void reported.push(err));
      const heard: TextStoreChange[] = [];
      store.onChange(() => {
        throw new Error('the panel is gone');
      });
      store.onChange((c) => void heard.push(c));
      const landed = await store.apply([{ offset: 6, length: 1, text: '2' }]);
      assert.strictEqual(landed, true, 'the edit landed, and says so');
      assert.strictEqual(store.text, '{"a": 2}');
      assert.deepStrictEqual(
        heard.map((c) => c.changes.length),
        [1, 0],
        'the other listener heard the edit, and then the dirty change',
      );
      assert.strictEqual(store.dirty, true);
      await settle();
      assert.deepStrictEqual(
        reported.map((err) => (err as Error).message),
        ['the panel is gone', 'the panel is gone'],
        'each throw is reported, once',
      );
      assert.strictEqual(later.mock.calls.length, 0, 'and never thrown again, which a Node or Electron host would take for a crash');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with no report given, says a throw on the console', async () => {
    await quietConsole(async (said) => {
      const store = createTextStore('{"a": 1}');
      const thrown = new Error('the panel is gone');
      store.onChange(() => {
        throw thrown;
      });
      assert.strictEqual(await store.apply([{ offset: 6, length: 1, text: '2' }]), true);
      assert.deepStrictEqual(said, [[thrown], [thrown]]);
    });
  });

  it("costs a table nothing: an edit through it lands, and says no 'Failed to apply edit'", async () => {
    await quietConsole(async () => {
      const o = await open(WORKSPACE_PARAMS);
      o.text.onChange(() => {
        throw new Error('an app listener that breaks');
      });
      const from = o.view.posts.length;
      o.view.send({ type: 'edit', rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
      await settle();
      assert.deepStrictEqual(o.view.posts.slice(from).filter((p) => p.type === 'error'), []);
      assert.ok(o.text.text.includes('9.8'));
      assert.strictEqual(o.text.dirty, true);
    });
  });
});

describe('a table listener that throws', () => {
  it('costs the other listeners nothing, and is no failed repaint', async () => {
    const o = await open(WORKSPACE_PARAMS);
    o.view.source.subscribe((change) => {
      if (change.kind === 'updateEntry') throw new Error('the panel is gone');
    });
    const from = o.view.posts.length;
    o.view.send({ type: 'edit', rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await settle();
    const after = o.view.posts.slice(from);
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.8', 'the table served beside it got the rows');
    assert.deepStrictEqual(after.filter((p) => p.type === 'error'), [], 'no "Failed to update the row"');
    assert.strictEqual(after.filter((p) => p.type === 'setRows').length, 0, 'and no wide repaint for it');
  });
});

describe('a reload of the text', () => {
  it('of the text the store holds is no change: no repaint, no new baseline, and the undo stack cleared', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const heard: TextStoreChange[] = [];
    o.text.onChange((c) => void heard.push(c));
    const from = o.view.posts.length;
    await o.text.reset(o.text.text);
    await settle();
    assert.deepStrictEqual(heard, []);
    assert.deepStrictEqual(o.view.posts.slice(from), [], 'nothing repainted');
    const before = o.text.text;
    await o.undo().catch(() => {});
    assert.strictEqual(o.text.text, before, 'nothing to undo');
  });

  it('of one entry changed is that one replacement, painted narrowly and then baselined from the file', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const heard: TextStoreChange[] = [];
    o.text.onChange((c) => void heard.push(c));
    const at = o.text.text.indexOf('"name": "gravity"');
    const value = o.text.text.indexOf('9.81', at);
    const next = o.text.text.slice(0, value) + '9.7' + o.text.text.slice(value + 4);
    const from = o.view.posts.length;
    o.disk.write(new TextEncoder().encode(next));
    await o.text.reset(next);
    await settle();
    assert.strictEqual(heard[0].changes.length, 1, 'one replacement');
    assert.ok(heard[0].changes[0].rangeLength < 10, 'of what differs, not of the whole text');
    // The entry first, and then, the text now known to be the file's, every row against it.
    assert.deepStrictEqual(
      o.view.posts.slice(from).map((p) => p.type),
      ['updateEntryRows', 'setRows', 'sectionRules', 'clipboardState'],
    );
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.7');
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Status, '', 'what the file holds is no modification');
  });
});

describe('a throw in what follows a paint', () => {
  it('is lost, as the extension loses it: no banner, the rows still in step, and no changed for that paint', async () => {
    const inner = createRegisters();
    let broken = false;
    const registers: Registers = {
      ...inner,
      clipboardState: () => {
        if (broken) throw new Error('the registers broke');
        return inner.clipboardState();
      },
    };
    let changed = 0;
    const o = await open(WORKSPACE_PARAMS, file(WORKSPACE_PARAMS), { registers });
    (o.view.source as any).doc.options.changed = () => changed++;
    broken = true;
    const from = o.view.posts.length;
    o.view.send({ type: 'ready' });
    await settle();
    broken = false;
    const after = o.view.posts.slice(from).map((p) => p.type);
    assert.deepStrictEqual(after, ['setRows', 'sectionRules'], 'the rows and the rules, and nothing said of the throw');
    assert.strictEqual(changed, 0, 'what follows the throw, changed included, did not happen');
    // The rows are in step: the next edit takes the narrow path.
    const at = o.view.posts.length;
    o.view.send({ type: 'edit', rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await settle();
    assert.strictEqual(o.view.posts.slice(at).filter((p) => p.type === 'setRows').length, 0);
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.8');
  });

  // A delete whose write is refused repaints wide and then says why. The same refusal with a throw
  // behind those rows says nothing: the extension's repaint rejects, and the banner chained on it
  // never posts.
  for (const [label, breaks, said] of [
    ['what follows the repaint goes out', false, ['error']],
    ['what follows the repaint throws', true, []],
  ] as const) {
    it(`a write refused after its paint repaints wide, and says why only if ${label}`, async () => {
      const inner = createRegisters();
      let broken = false;
      const registers: Registers = {
        ...inner,
        clipboardState: () => {
          if (broken) throw new Error('the registers broke');
          return inner.clipboardState();
        },
      };
      const o = await open(WORKSPACE_PARAMS, file(WORKSPACE_PARAMS), { registers });
      const text = o.text.text;
      o.text.apply = async () => false;
      broken = breaks;
      const from = o.view.posts.length;
      o.view.send({ type: 'delete', rowIds: [entryRow(o.view.posts, 'gravity').ID] });
      await settle();
      broken = false;
      const after = o.view.posts.slice(from);
      assert.ok(after.some((p) => p.type === 'setRows'), 'the table is repainted from the text');
      assert.ok(rowOf(o.view.posts, 'gravity'), 'which still holds the entry');
      assert.strictEqual(o.text.text, text);
      assert.deepStrictEqual(after.filter((p) => p.type === 'error').map((p) => p.type), said);
    });
  }
});
