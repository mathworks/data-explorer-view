// Copyright 2026 The MathWorks, Inc.
//
// params.sldd reads the same from either form MATLAB saves a dictionary in. The two files under
// test/parity/artifacts are one dictionary saved twice by MATLAB, once as text and once compressed,
// and each is read the way a host reads it: the text through getModel, the zip through
// getModelFromBytes. Every entry of one is in the other, in the same section, with the same class,
// the same value and the same fields.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getModel, getModelFromBytes, invalidate } from '../../src/model/workspace/SlddModel.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ART = (variant: string) => fileURLToPath(new URL(`./artifacts/${variant}/params.sldd`, import.meta.url));

/** What a table shows of each entry, by name. */
function entriesOf(variant: 'text' | 'binary'): Record<string, { section: string; className: string; value: string; fields: string[] }> {
  const uri = `parity://${variant}/params.sldd`;
  const raw = readFileSync(ART(variant));
  invalidate(uri);
  const node: any =
    variant === 'binary'
      ? getModelFromBytes(uri, 'params.sldd', raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
      : getModel(uri, 'params.sldd', raw.toString('utf8'));
  const out: Record<string, any> = {};
  for (const section of node.children ?? []) {
    for (const e of section.children ?? []) {
      out[e.name] = {
        section: section.name,
        className: String(e.className ?? ''),
        value: String(e.displayValue ?? ''),
        fields: (e.children ?? []).map((c: any) => c.name),
      };
    }
  }
  return out;
}

describe('params.sldd, read from its text form and its binary form', () => {
  it('every entry is in both, with the same class, value and fields', () => {
    const text = entriesOf('text');
    const binary = entriesOf('binary');
    // The comparison is over something: a read that came back empty in both forms would agree.
    expect(Object.keys(text).length).toBe(40);
    expect(Object.values(text).filter((e) => e.value !== '').length).toBeGreaterThan(0);
    expect(Object.values(text).filter((e) => e.fields.length > 0).length).toBeGreaterThan(0);
    expect(binary).toEqual(text);
  });
});
