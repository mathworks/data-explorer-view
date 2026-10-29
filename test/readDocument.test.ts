// Copyright 2026 The MathWorks, Inc.
//
// What a MAT-file's table says that no golden fixture reaches: the notice of a file core holds
// read-only (no fixture is one), and its banners and failures in the file's name. The words are
// the VS Code extension's MAT-file editor's (MatEditorProvider readOnlyNotice, describeBanner).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createSession } from 'data-explorer-core';
import { readDocument } from '../src/model/source/readDocument.js';
import { DocumentRegistry } from '../src/model/workspace/SlddModel.js';

const URI = 'file:///w/nd_numeric.mat';
const SRC_ID = `binedit:${URI}`;

function readMat() {
  const registry = new DocumentRegistry(createSession());
  const b = readFileSync(fileURLToPath(new URL('./fixtures/nd_numeric.mat', import.meta.url)));
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const reading = readDocument(registry, 'mat', 'nd_numeric.mat', URI, bytes);
  return { registry, reading };
}

const readOnly = (node: object) => Object.defineProperty(node, 'readOnly', { get: () => true });

describe("a MAT-file's notice", () => {
  it('is none for a file a save can write back', () => {
    const { reading } = readMat();
    expect(reading.srcId).toBe(SRC_ID);
    expect(reading.node.readOnly).toBe(false);
    expect(reading.notice()).toBeUndefined();
  });

  it('says why a file core holds read-only opens for viewing only', () => {
    const { reading } = readMat();
    readOnly(reading.node);
    expect(reading.notice()).toBe(
      'Read-only: nd_numeric.mat is laid out in a way a save could not keep as it is, so it opens for viewing only.',
    );
  });

  it("gives a save's refusal in the file's name", () => {
    const { registry, reading } = readMat();
    readOnly(reading.node);
    vi.spyOn(registry.session, 'serializeSource').mockImplementation(() => {
      throw new Error(`Cannot save ${SRC_ID}: its subsystem is not where its header says.`);
    });
    expect(reading.notice()).toBe('Read-only: Cannot save nd_numeric.mat: its subsystem is not where its header says.');
  });

  it('says a file not held as a MAT-file cannot be saved as one', () => {
    const { registry, reading } = readMat();
    readOnly(reading.node);
    vi.spyOn(registry.session, 'serializeSource').mockReturnValue({ kind: 'text', text: '' } as never);
    expect(reading.notice()).toBe('Read-only: Cannot save "nd_numeric.mat": it is not held as a MAT-file. Nothing was written.');
  });
});

describe("a MAT-file's banner and failures", () => {
  it("spell the srcId as the file's name", () => {
    const { reading } = readMat();
    expect(reading.banner({ headline: `Part of ${SRC_ID} is lost.`, details: [`${SRC_ID}/x`] })).toEqual({
      headline: 'Part of nd_numeric.mat is lost.',
      details: ['nd_numeric.mat/x'],
    });
    expect(reading.banner(undefined)).toBeUndefined();
    expect(reading.paintFailed(new Error(`No rows for ${SRC_ID}`))).toBe('Failed to show nd_numeric.mat: No rows for nd_numeric.mat');
  });
});
