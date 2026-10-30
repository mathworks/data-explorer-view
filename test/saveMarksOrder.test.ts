// Copyright 2026 The MathWorks, Inc.
//
// open-questions 16 B (design: data-explorer-vscode docs/deep-work/2026-10-28-view-split/bug16-design.md),
// failing today. A save that commits after a newer one leaves the file holding what the OLDER save
// serialized: an edit made after its snapshot is not in the file, whatever the newer save wrote.
// SaveMarks.commit leaves such an edit as the newer commit left it, saved, and so marks nothing the
// file lacks; the whole-list model saveMarks.test.ts holds it to (EveryEdit.commit) does the same, so
// that model moves with the fix.
import { describe, it, expect } from 'vitest';
import { SaveMarks } from '../src/host/index.js';

const a = { name: 'a' };
const b = { name: 'b' };

describe('SaveMarks: a save that commits after a newer one', () => {
  it('marks again what only the newer one wrote', () => {
    const marks = new SaveMarks<object>();
    marks.push([a]);
    const older = marks.snapshot();
    marks.push([b]);
    const newer = marks.snapshot();
    marks.commit(newer);
    expect(marks.marks().size, 'the newer save wrote both').toBe(0);
    marks.commit(older);
    expect([...marks.marks()], 'the file now holds the older save, which lacks b').toEqual([[b, 'Modified']]);
  });

  it('and an edit made after the older snapshot and undone before the newer one stays unmarked', () => {
    const marks = new SaveMarks<object>();
    marks.push([a]);
    const older = marks.snapshot();
    marks.push([b]).undone();
    const newer = marks.snapshot();
    marks.commit(newer);
    marks.commit(older);
    expect(marks.marks().size, 'neither save wrote b, and the document does not hold it').toBe(0);
  });
});
