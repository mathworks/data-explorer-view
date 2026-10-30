// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/dropFacts.test.ts at cc8cb1b.
// All four of its cases, run against view's dropFactsOf (src/model/actions/dropFacts.ts) and view's
// copy of buildDragSnapshot (src/model/edit/clipboardAction.ts), given core's session.
//
// dropFactsOf answers "what does this entry look like to a drop target" — the
// payload-free facts dropDecision reasons over. Both registers that can be pasted
// FROM carry them: the drag register (dragState) and the clipboard. They were
// computed inline inside buildDragSnapshot, so a clipboard that grew its own copy
// would be the `one rule, two paths` bug again — a drag and a Cmd+V of the same
// entry disagreeing about where it may land. The last test here is the one that
// matters: the drag snapshot's facts ARE these facts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataModel } from 'data-explorer-core';
import { dropFactsOf } from '../src/model/index.js';
import { getModel, findNode, invalidate } from '../src/host/index.js';
import { buildDragSnapshot as buildWith } from '../src/host/index.js';

// The extension's builder reads core's module-level session; view's is given it.
const buildDragSnapshot = (rowIds: unknown, find: (rowId: string) => any) => buildWith(DataModel, rowIds, find);

const archText = readFileSync(fileURLToPath(new URL('./fixtures/arch.sldd', import.meta.url)), 'utf8');

function harness(uri: string) {
  invalidate(uri);
  const model = getModel(uri, 'arch.sldd', archText);
  return {
    model,
    find: (rowId: string) => findNode(uri, rowId),
    id: (section: string, ...rest: string[]) => [uri, section, ...rest].join('/'),
  };
}

describe('dropFactsOf', () => {
  it('reads the class, array class and kind off a real entry', () => {
    const h = harness('test://facts-bus.sldd');
    expect(dropFactsOf(h.find(h.id('arch', 'DataInterface')))).toEqual({
      className: 'Simulink.Bus',
      arrayClass: 'Simulink.Bus',
      kind: 'Data Interface',
      isMatlabVariable: false,
      isScalarNumeric: false,
    });
  });

  it('treats an entry with no _array_class as a plain MATLAB variable', () => {
    // Falsy-is-absent, the same rule the parser's value envelope uses. This is what
    // lets a scalar-numeric variable convert to a Constant when dropped into
    // Architectural Data. `Constant` is the fixture's one entry with no `_array_class`.
    const h = harness('test://facts-var.sldd');
    const facts = dropFactsOf(h.find(h.id('arch', 'Constant')));
    expect(facts.arrayClass).toBe('');
    expect(facts.isMatlabVariable).toBe(true);
  });

  it('answers with empty facts for a node that is not an entry', () => {
    // A section header or a detached node has nothing to offer a drop target; the
    // callers skip such rows, and this must not throw on the way there.
    expect(dropFactsOf(null)).toEqual({
      className: '',
      arrayClass: '',
      kind: '',
      isMatlabVariable: true,
      isScalarNumeric: false,
    });
  });

  // The point of the module: the drag path no longer computes its own answer.
  it('produces exactly the facts buildDragSnapshot puts in the register', () => {
    const h = harness('test://facts-parity.sldd');
    const rowId = h.id('arch', 'DataInterface');
    const { payload, sourceSection, ...facts } = buildDragSnapshot([rowId], h.find).items[0];
    expect(payload).toBeTruthy();
    expect(sourceSection).toBe('arch');
    expect(facts).toEqual(dropFactsOf(h.find(rowId)));
  });
});
