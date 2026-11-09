// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Raw pane's wiring on its own (connect/rawPane.ts): the pane shows what the active document
// answers for the selected row (or for the file itself, with nothing selected), says it is loading
// while a new row's answer is on its way, keeps to the last row asked when answers come back out
// of order, asks nothing while its view is hidden and asks again once it is shown, and hands its
// Copy to the host's clipboard.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RawView } from '../../src/model/raw/rawView.js';
import { DexRawViewer, defineRawViewer } from '../../src/widgets/app-shell/modules/dex-raw-viewer.js';
import { connectRawPane, type RawTarget } from '../../src/widgets/app-shell/connect/rawPane.js';

beforeAll(() => defineRawViewer());
afterEach(() => document.body.replaceChildren());

const text = (t: string): RawView => ({ format: 'json', text: t });

/** A document whose raw answers the test settles, one per ask, in any order. */
function heldDoc() {
  const asked: { rowId: string; answer: (view: RawView) => void; fail: (err: Error) => void }[] = [];
  const raw = (rowId: string) => new Promise<RawView>((answer, fail) => asked.push({ rowId, answer, fail }));
  return { asked, raw };
}

function setUp(refuseCopy = false) {
  const viewer = new DexRawViewer();
  document.body.append(viewer);
  let target: RawTarget | null = null;
  let shown = true;
  const copied: string[] = [];
  const failures: string[] = [];
  const pane = connectRawPane(viewer, {
    target: () => target,
    shown: () => shown,
    copy: async (t) => {
      if (refuseCopy) throw new Error('The clipboard is not allowed here.');
      copied.push(t);
    },
    failed: (m) => void failures.push(m),
  });
  return {
    viewer,
    pane,
    copied,
    failures,
    at: (t: RawTarget | null) => (target = t),
    show: (on: boolean) => (shown = on),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('connectRawPane', () => {
  it("shows the active document's answer for the row, loading while it comes", async () => {
    const { viewer, pane, at } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp' });
    pane.refresh();
    expect(viewer.loading).toBe(true);
    expect(doc.asked.map((a) => a.rowId)).toEqual(['Kp']);
    doc.asked[0]!.answer(text('{"Kp": 1}'));
    await tick();
    expect([viewer.loading, viewer.raw]).toEqual([false, text('{"Kp": 1}')]);
  });

  it('names what each answer is for as it is shown, and nothing with no document', async () => {
    const { viewer, pane, at } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp', label: 'Kp' });
    pane.refresh();
    at({ key: 'd', raw: doc.raw, rowId: 'Ki', label: 'Ki' });
    pane.refresh();
    doc.asked[0]!.answer(text('{"Kp": 1}'));
    await tick();
    // Kp's answer was dropped, so its name is never shown over Ki's.
    expect(viewer.label).toBe('');
    doc.asked[1]!.answer(text('{"Ki": 2}'));
    await tick();
    expect(viewer.label).toBe('Ki');
    at({ key: 'p', rowId: 'p', label: 'project.prj' });
    pane.refresh();
    expect(viewer.label).toBe('project.prj');
    at(null);
    pane.refresh();
    expect(viewer.label).toBe('');
  });

  it('keeps to the last row asked: an answer for one the selection moved past is dropped', async () => {
    const { viewer, pane, at } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp' });
    pane.refresh();
    at({ key: 'd', raw: doc.raw, rowId: 'Ki' });
    pane.refresh();
    doc.asked[1]!.answer(text('Ki'));
    doc.asked[0]!.answer(text('Kp'));
    await tick();
    expect(viewer.raw).toEqual(text('Ki'));
  });

  it("asks the same row again after a change, keeping its answer up rather than a loading note", async () => {
    const { viewer, pane, at } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp' });
    pane.refresh();
    doc.asked[0]!.answer(text('1'));
    await tick();
    pane.refresh();
    expect(viewer.loading).toBe(false);
    doc.asked[1]!.answer(text('5'));
    await tick();
    expect(viewer.raw).toEqual(text('5'));
  });

  it('shows no answer with no document, and says so for one that has no raw form', async () => {
    const { viewer, pane, at } = setUp();
    at(null);
    pane.refresh();
    expect(viewer.raw).toBeNull();
    at({ key: 'p', rowId: 'x' });
    pane.refresh();
    expect(viewer.raw).toEqual({ format: 'none', reason: 'This file has no raw data.' });
  });

  it('says why when the document could not answer', async () => {
    const { viewer, pane, at } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp' });
    pane.refresh();
    doc.asked[0]!.fail(new Error('core refused'));
    await tick();
    expect(viewer.raw).toEqual({ format: 'none', reason: 'core refused' });
  });

  it('asks nothing while hidden, and asks once shown', () => {
    const { pane, at, show } = setUp();
    const doc = heldDoc();
    at({ key: 'd', raw: doc.raw, rowId: 'Kp' });
    show(false);
    pane.refresh();
    expect(doc.asked).toEqual([]);
    show(true);
    pane.refresh();
    expect(doc.asked.map((a) => a.rowId)).toEqual(['Kp']);
  });

  it("puts Copy's text on the host's clipboard, and says when it could not", async () => {
    const { viewer, copied, failures, pane } = setUp();
    viewer.dispatchEvent(new CustomEvent('dex-raw-copy', { detail: { text: '{"Kp": 1}' }, bubbles: true, composed: true }));
    await tick();
    expect(copied).toEqual(['{"Kp": 1}']);
    pane.dispose();
    viewer.dispatchEvent(new CustomEvent('dex-raw-copy', { detail: { text: 'after' }, bubbles: true, composed: true }));
    await tick();
    expect(copied).toEqual(['{"Kp": 1}']);
    expect(failures).toEqual([]);
    const refusing = setUp(true);
    refusing.viewer.dispatchEvent(new CustomEvent('dex-raw-copy', { detail: { text: 'x' }, bubbles: true, composed: true }));
    await tick();
    expect(refusing.failures).toEqual(['Could not copy the raw data: The clipboard is not allowed here.']);
  });
});
