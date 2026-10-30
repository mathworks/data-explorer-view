// Copyright 2026 The MathWorks, Inc.
//
// The half of the registers the extension keeps in its editorHub (src/model/edit/registers.ts):
// the deleters a cross-document move asks to take its originals out, and the broadcasts that tell
// every table what the clipboard and the drag register hold. And that two createRegisters() share
// nothing, which is what lets a page keep one per workspace.
import { describe, expect, it } from 'vitest';
import { NOT_FOUND_REASON, createRegisters, type ClipboardItem, type SourceDeleteResult } from '../src/model/index.js';

const A = 'file:///work/a.sldd';
const B = 'file:///work/b.mat';

function item(name: string, sourceSection = 'design'): ClipboardItem {
  return {
    payload: { name, metadata: { uuid: `u-${name}` }, value: 1 },
    sourceSection,
    className: 'Simulink.Parameter',
    arrayClass: '',
    kind: 'Parameter',
    isMatlabVariable: true,
    isScalarNumeric: true,
  };
}

describe('source deleters', () => {
  it("hand a move's targets to the deleter of the document they came from, and its answer back", async () => {
    const r = createRegisters();
    const asked: unknown[] = [];
    r.registerSourceDeleter(A, (targets) => {
      asked.push(targets);
      return { removed: true };
    });
    r.registerSourceDeleter(B, async () => ({ removed: false, reason: NOT_FOUND_REASON, gone: true }));
    expect(await r.deleteFromSource(A, ['Kp', { name: 'Ki', uuid: 'u-Ki' }])).toEqual({ removed: true });
    expect(asked).toEqual([['Kp', { name: 'Ki', uuid: 'u-Ki' }]]);
    expect(await r.deleteFromSource(B, ['x'])).toEqual({ removed: false, reason: NOT_FOUND_REASON, gone: true });
  });

  it('say a closed document cannot remove anything, and a deleter that answers nothing removed nothing', async () => {
    const r = createRegisters();
    expect(await r.deleteFromSource(A, ['Kp'])).toEqual({ removed: false, reason: 'its table is no longer open' });
    r.registerSourceDeleter(A, () => undefined as unknown as SourceDeleteResult);
    expect(await r.deleteFromSource(A, ['Kp'])).toEqual({ removed: false, reason: 'its editor did not say' });
    r.unregisterSourceDeleter(A);
    expect(await r.deleteFromSource(A, ['Kp'])).toEqual({ removed: false, reason: 'its table is no longer open' });
  });

  it('let a deleter that throws throw, for the transfer to report', async () => {
    const r = createRegisters();
    r.registerSourceDeleter(A, () => {
      throw new Error('the file is read-only');
    });
    await expect(r.deleteFromSource(A, ['Kp'])).rejects.toThrow('the file is read-only');
  });
});

describe('broadcasts', () => {
  it('tell every listener what the clipboard holds, payload-free, and the drag in flight', () => {
    const r = createRegisters();
    const heard: unknown[] = [];
    r.listen({ clipboard: (state) => void heard.push(['clipboard', state]), drag: (d) => void heard.push(['drag', d]) });
    r.listen({ drag: (d) => void heard.push(['drag only', d]) });
    r.setClipboard([item('Kp')], 'cut', A);
    r.broadcastClipboardState();
    r.setDrag(B, [item('x', '')]);
    r.broadcastDragState();
    r.clearDrag();
    r.broadcastDragState();
    const facts = { className: 'Simulink.Parameter', arrayClass: '', kind: 'Parameter', isMatlabVariable: true, isScalarNumeric: true };
    expect(heard).toEqual([
      ['clipboard', { canPaste: true, mode: 'cut', sourceDocUri: A, items: [{ sectionName: 'design', ...facts }] }],
      ['drag', { docUri: B, items: [{ sectionName: '', ...facts }] }],
      ['drag only', { docUri: B, items: [{ sectionName: '', ...facts }] }],
      ['drag', null],
      ['drag only', null],
    ]);
    expect(JSON.stringify(heard)).not.toContain('Kp');
  });

  it('reach each listener on its own terms: one that throws, now or later, costs the others nothing', async () => {
    const r = createRegisters();
    const heard: string[] = [];
    r.listen({ clipboard: () => heard.push('first') });
    r.listen({
      clipboard: () => {
        throw new Error('this panel is disposed');
      },
    });
    r.listen({ clipboard: () => Promise.reject(new Error('this post failed later')) });
    r.listen({ clipboard: () => heard.push('last') });
    expect(() => r.broadcastClipboardState()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(heard).toEqual(['first', 'last']);
  });

  it('stop for a listener that has stopped listening', () => {
    const r = createRegisters();
    const heard: unknown[] = [];
    const stop = r.listen({ clipboard: (s) => void heard.push(s) });
    stop();
    r.broadcastClipboardState();
    expect(heard).toEqual([]);
  });

  it("are what a transfer's registers broadcast with, unless it is given its own", () => {
    const r = createRegisters();
    const heard: string[] = [];
    r.listen({ clipboard: () => heard.push('clipboard'), drag: () => heard.push('drag') });
    r.clipboardRegister().broadcast();
    r.dragRegister('move').broadcast();
    r.clipboardRegister(() => heard.push('own')).broadcast();
    expect(heard).toEqual(['clipboard', 'drag', 'own']);
  });
});

describe('createRegisters', () => {
  it('makes registers that share nothing: one per workspace', async () => {
    const one = createRegisters();
    const two = createRegisters();
    one.setClipboard([item('Kp')], 'copy', A);
    one.setDrag(A, [item('Kp')]);
    one.registerSourceDeleter(A, () => ({ removed: true }));
    const heard: unknown[] = [];
    two.listen({ clipboard: (s) => void heard.push(s) });
    one.broadcastClipboardState();
    expect([two.getClipboard(), two.getDrag(), two.canPaste(), heard]).toEqual([null, null, false, []]);
    expect(await two.deleteFromSource(A, ['Kp'])).toEqual({ removed: false, reason: 'its table is no longer open' });
  });

  it('gives plain functions, which work taken off the object', () => {
    const { setClipboard, getClipboard, canPaste } = createRegisters();
    setClipboard([item('Kp')], 'copy', A);
    expect([canPaste(), getClipboard()?.sourceDocUri]).toEqual([true, A]);
  });
});
