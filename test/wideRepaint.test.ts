// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/wideRepaint.test.ts at cc8cb1b.
// Runs against view's copy of the module (src/model/edit/wideRepaint.ts), whose wideLanding the
// JSON dictionary engine's wide repaint asks (src/model/edit/jsonView.ts, paintWide).
//
// When a JSON .sldd's wide repaint may post the rows it built.
//
// The repaint reads the text, then waits — seconds, when the workspace usage graph is cold —
// before it posts. It used to post whatever it had read, whenever its wait ended: over an edit
// made in the window, and in either order when two were in flight. The end-to-end races are in
// test/jsonEngine/sync.test.ts (vscode: test-integration/suite/jsonRebuildDuringWrite.test.ts);
// this pins the decision itself.
import { describe, it, expect } from 'vitest';
import { wideLanding } from '../src/model/edit/wideRepaint.js';

describe('a wide repaint posts only rows that are still the answer', () => {
  it('lands when nothing happened while it waited', () => {
    expect(wideLanding({ epoch: 4, version: 7, touched: 2 }, { epoch: 4, version: 7, touched: 2 })).toBe('land');
  });

  it('of two in flight, only the newer lands, whichever wait ends first', () => {
    const older = { epoch: 4, version: 7, touched: 2 };
    const newer = { epoch: 5, version: 8, touched: 3 };
    // The view as it stands once both have begun.
    const now = { ...newer };
    expect(wideLanding(older, now)).toBe('superseded');
    expect(wideLanding(newer, now)).toBe('land');
  });

  it('reads the text again when it changed under the rows', () => {
    expect(wideLanding({ epoch: 4, version: 7, touched: 2 }, { epoch: 4, version: 8, touched: 2 })).toBe('reread');
  });

  it('reads it again when the view painted behind it, even before that edit is written', () => {
    // An edit in the window paints before it writes, so the text still reads as it did — the
    // version cannot tell. The rows this repaint holds predate that paint, and posting them
    // would take it back off the screen.
    expect(wideLanding({ epoch: 4, version: 7, touched: 2 }, { epoch: 4, version: 7, touched: 3 })).toBe('reread');
  });

  it('is superseded before it is stale: a newer repaint already reads the newer text', () => {
    expect(wideLanding({ epoch: 4, version: 7, touched: 2 }, { epoch: 5, version: 9, touched: 5 })).toBe('superseded');
  });
});
