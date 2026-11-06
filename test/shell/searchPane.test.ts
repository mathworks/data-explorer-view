// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Search view's wiring on its own (connect/searchPane.ts), over a folder index whose answers
// the test settles: what the page tests cannot order. The open files' names answer at once; the
// folder's in their own time, the panel searching meanwhile, and an answer to a query the typing
// has moved past is dropped. An open file's names win over what the index read of it. An index
// that cannot be read leaves the open files' names searched, and says so once, not on every query.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { NameRecord } from '../../src/model/search/nameExtract.js';
import type { NameIndex } from '../../src/model/search/nameIndex.js';
import { connectSearchPane } from '../../src/widgets/app-shell/connect/searchPane.js';
import { DexSearchPanel, defineSearchPanel } from '../../src/widgets/app-shell/modules/dex-search-panel.js';

beforeAll(() => defineSearchPanel());
afterEach(() => document.body.replaceChildren());

const record = (name: string, file: string): NameRecord => ({ name, sourceUri: `file:///w/${file}`, sourceLabel: file, kind: 'sldd' });

/** A folder index whose list() answers wait for the test, one per ask, in any order. */
function heldIndex() {
  const asked: { answer: (records: NameRecord[]) => void; fail: (err: Error) => void }[] = [];
  const index = { list: () => new Promise<NameRecord[]>((answer, fail) => asked.push({ answer, fail })) };
  return { asked, index: index as unknown as NameIndex };
}

function setUp(open: NameRecord[], index?: NameIndex) {
  const panel = new DexSearchPanel();
  document.body.append(panel);
  const failures: string[] = [];
  const pane = connectSearchPane(panel, { openRecords: () => open, folderNames: () => index, open: () => {}, failed: (m) => void failures.push(m) });
  const query = (text: string) => panel.dispatchEvent(new CustomEvent('dex-search-query', { detail: { query: text } }));
  const found = () => panel.results.map((r) => `${r.label} ${r.description}`);
  return { panel, pane, failures, query, found };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('connectSearchPane', () => {
  it("answers the open files' names at once, with no folder shown", () => {
    const { panel, query, found } = setUp([record('Kp', 'params.sldd'), record('Ki', 'params.sldd')]);
    query('Kp');
    expect([panel.searching, found()]).toEqual([false, ['Kp params.sldd']]);
    query('  ');
    expect(found()).toEqual([]);
  });

  it("searches while the folder's index answers, and drops an answer the typing moved past", async () => {
    const held = heldIndex();
    const { panel, query, found } = setUp([], held.index);
    query('Gain');
    expect(panel.searching).toBe(true);
    query('Trim');
    // The second query's answer first, then the first's, which is dropped.
    held.asked[1]!.answer([record('Trim', 'shared_gain.slx')]);
    await tick();
    expect([panel.searching, found()]).toEqual([false, ['Trim shared_gain.slx']]);
    held.asked[0]!.answer([record('PlantGain', 'shared_gain.slx')]);
    await tick();
    expect(found()).toEqual(['Trim shared_gain.slx']);
  });

  it('takes an open file\'s names over what the index read of it', async () => {
    const held = heldIndex();
    const { query, found } = setUp([record('Kq', 'params.sldd')], held.index);
    query('K');
    held.asked[0]!.answer([record('Kp', 'params.sldd'), record('Kd', 'other.sldd')]);
    await tick();
    expect(found().sort()).toEqual(['Kd other.sldd', 'Kq params.sldd']);
  });

  it('searches the open files when the index cannot be read, and says so once', async () => {
    const held = heldIndex();
    const { panel, query, found, failures } = setUp([record('Kp', 'params.sldd')], held.index);
    for (const [i, text] of ['Kp', 'K', 'Kp'].entries()) {
      query(text);
      held.asked[i]!.fail(new Error('EACCES: permission denied'));
      await tick();
      expect([panel.searching, found()]).toEqual([false, ['Kp params.sldd']]);
    }
    expect(failures).toEqual(['Could not search the folder: EACCES: permission denied']);
    // Read again, and then refused again: said again.
    query('Kp');
    held.asked[3]!.answer([]);
    await tick();
    query('Kp');
    held.asked[4]!.fail(new Error('EACCES: permission denied'));
    await tick();
    expect(failures).toHaveLength(2);
  });

  it('says what it covers, and hears nothing once disposed', async () => {
    const held = heldIndex();
    const { panel, pane, query } = setUp([], held.index);
    pane.scope('plant');
    expect(panel.scope).toBe('Open files and plant');
    pane.scope(null);
    expect(panel.scope).toBe('Open files');
    query('Kp');
    pane.dispose();
    held.asked[0]!.answer([record('Kp', 'params.sldd')]);
    await tick();
    expect(panel.results).toEqual([]);
    query('Kp');
    expect(held.asked).toHaveLength(1);
  });
});
