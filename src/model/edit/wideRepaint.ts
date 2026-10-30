// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/wideRepaint.ts at c73da3c. The extension keeps its own
// copy until its JSON dictionary editor moves onto view's engine; keep the two alike (view's CI
// reports a vscode commit to that file).
//
// WHEN A JSON .sldd's WIDE REPAINT MAY LAND. A wide repaint reads the document, parses it, builds
// every row — and then WAITS, for the usage graph that fills the Usage column, before it posts a
// byte. Anything can happen to the document in that window. So the rows are only posted if they
// are still the answer, which three facts decide, read once when the repaint began and once when
// its rows are ready:
//   - it is still the NEWEST repaint: a later one read later text, and lands for both;
//   - the text has not changed since it was read (the document version);
//   - the view has not touched its rows or its tree since (no narrow repaint, nothing declared out
//     of step). Counted per VIEW: two tables of one document share the session's tree.
// A repaint that is not the newest is dropped; one whose text or rows moved under it reads the
// document again.

/** What a wide repaint read when it began, or what the view says when its rows are ready. */
export interface WideState {
  /** The view's count of wide repaints begun. */
  epoch: number;
  /** The document's version. */
  version: number;
  /** The view's count of narrow repaints and out-of-step declarations. */
  touched: number;
}

/**
 * What to do with a wide repaint's rows once they are built: post them ('land'), drop them for a
 * newer repaint's ('superseded'), or read the document again ('reread').
 */
export type WideLanding = 'land' | 'superseded' | 'reread';

export function wideLanding(read: WideState, now: WideState): WideLanding {
  if (read.epoch !== now.epoch) return 'superseded';
  if (read.version !== now.version || read.touched !== now.touched) return 'reread';
  return 'land';
}
