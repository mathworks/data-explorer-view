// Copyright 2026 The MathWorks, Inc.
//
// A refused Add Child, Delete or Add (src/model/edit/refusal.ts, copied from the extension's
// refusal.ts): core is asked why through the session it is given, the dialog is titled by the
// gesture in the extension's words, and core's reason names the file, not its source id.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSession } from 'data-explorer-core';
import {
  REFUSAL_TITLES,
  addChildRefusal,
  addEntryRefusal,
  deleteRefusal,
  describeSource,
  refusedChange,
} from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const srcId = 'binedit:file:///work/refusals.mat';
let session: ReturnType<typeof createSession>;
let mat: any;

beforeEach(() => {
  session = createSession();
  const bytes = new Uint8Array(readFileSync(join(import.meta.dirname, '..', 'test-integration', 'fixtures', 'mat', 'cases.mat')));
  mat = session.addMatSource(srcId, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { path: 'cases.mat' });
});
afterEach(() => session.removeDataSource(srcId));

const variable = (name: string): any => (mat.children as any[]).find((v) => v.name === name);

describe('refusals', () => {
  it("are titled by the gesture, in the extension's words", () => {
    expect(REFUSAL_TITLES).toEqual({ addChild: 'Cannot Add Child', delete: 'Cannot Delete', add: 'Cannot Add' });
    expect(refusedChange('delete', 'no', (t) => t)).toEqual({ kind: 'refused', title: 'Cannot Delete', reason: 'no' });
  });

  it("show core's reason with the source id spelled as the file's name", () => {
    const describe = describeSource(srcId, 'cases.mat');
    expect(refusedChange('add', `Cannot add to ${srcId}/s: it is full.`, describe)).toEqual({
      kind: 'refused',
      title: 'Cannot Add',
      reason: 'Cannot add to cases.mat/s: it is full.',
    });
  });

  it('ask the session they are given, which answers as core does', () => {
    const scalar = variable('scalarD');
    const struct = variable('structScalar');
    expect(addChildRefusal(session, scalar.id)).toBe(session.addChildRefusal(scalar.id));
    expect(addChildRefusal(session, scalar.id)).toEqual(expect.any(String));
    expect(addChildRefusal(session, struct.id)).toBe(session.addChildRefusal(struct.id));
    expect(addEntryRefusal(session, srcId, 'MatlabVariable')).toBe(session.addEntryRefusal(srcId, 'MatlabVariable'));
    expect(deleteRefusal(session, [scalar.id, struct.id])).toBe(session.deleteRefusal(scalar.id) ?? session.deleteRefusal(struct.id));
  });

  it("stop at the first row core will not delete, asked one row at a time", () => {
    const asked: string[] = [];
    const fake = {
      deleteRefusal: (id: string | readonly string[]) => (asked.push(String(id)), id === 'b' ? 'b stays' : null),
      addChildRefusal: () => null,
      addEntryRefusal: () => null,
    };
    expect(deleteRefusal(fake, ['a', 'b', 'c'])).toBe('b stays');
    expect(asked).toEqual(['a', 'b']);
    expect(deleteRefusal(fake, ['a', 'c'])).toBeNull();
  });
});
