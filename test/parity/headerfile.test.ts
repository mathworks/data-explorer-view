// Copyright 2026 The MathWorks, Inc.
// Header File column parity: prove the schema `headerFile` column reads the REAL
// serialized CoderInfo.CustomAttributes.HeaderFile from a MATLAB-generated .sldd
// (not just a live MCOS property), for BOTH file formats.
//
//   hdrParam  (ExportToFile CSC, HeaderFile='params_hdr.h')  -> 'params_hdr.h'
//   hdrSignal (ExportToFile CSC, HeaderFile='signals_hdr.h') -> 'signals_hdr.h'
//   plainParam (Auto CSC, no CustomAttributes.HeaderFile)    -> '' (blank cell)
//
// Both fixtures are MATLAB's, and are data-explorer-core's test/parity/artifacts ones byte
// for byte. artifacts/text/headerfile.sldd was written by MATLAB R2027a with core's
// test/parity/matlab/gen_headerfile.m. artifacts/binary/headerfile.sldd was written by
// data-explorer-vscode's test/parity/gen_headerfile_fixture.m, whose text variant fell back
// to MATLAB's default format, so the text fixture it wrote was a compressed one too. Each
// variant is read by its own route here, and its first bytes are checked, so a fixture of the
// wrong format fails rather than testing the other format twice.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getModel, getModelFromBytes, invalidate } from '../../src/model/workspace/SlddModel.js';

const ART = (variant: string) =>
  fileURLToPath(new URL(`./artifacts/${variant}/headerfile.sldd`, import.meta.url));

function bytesOf(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// Read the Header File cell text from a node's row, unwrapping the editable-object
// cell shape when present (schema label columns render as plain strings).
function headerFileCell(node: any): string {
  const cell = node.toRow().headerFile;
  if (cell && typeof cell === 'object') return cell.text ?? '';
  return cell ?? '';
}

const VARIANTS = ['text', 'binary'] as const;

describe('Header File column', () => {
  // Apart from the reads below, so a fixture of the wrong format is named even where its read
  // throws first.
  it.each(VARIANTS)('the %s fixture is a dictionary of that format', (variant) => {
    const raw = readFileSync(ART(variant));
    const zip = raw[0] === 0x50 && raw[1] === 0x4b && raw[2] === 0x03 && raw[3] === 0x04;
    if (variant === 'text') {
      expect(zip, `artifacts/${variant}/headerfile.sldd is not a zip`).toBe(false);
      expect(String.fromCharCode(raw[0]), `artifacts/${variant}/headerfile.sldd is JSON text`).toBe('{');
    } else {
      expect(zip, `artifacts/${variant}/headerfile.sldd is a zip`).toBe(true);
    }
  });

  describe.each(VARIANTS)('[%s]', (variant) => {
    let byEntry: Map<string, any>;
    beforeAll(() => {
      const uri = `test://headerfile/${variant}`;
      const path = ART(variant);
      invalidate(uri);
      const node =
        variant === 'binary'
          ? getModelFromBytes(uri, 'headerfile.sldd', bytesOf(path))
          : getModel(uri, 'headerfile.sldd', readFileSync(path, 'utf8'));
      byEntry = new Map();
      for (const section of node.children ?? []) {
        for (const entry of section.children ?? []) byEntry.set(entry.name, entry);
      }
    });

    it('a Parameter with ExportToFile CSC surfaces its HeaderFile', () => {
      expect(headerFileCell(byEntry.get('hdrParam'))).toBe('params_hdr.h');
    });

    it('a Signal with ExportToFile CSC surfaces its HeaderFile', () => {
      expect(headerFileCell(byEntry.get('hdrSignal'))).toBe('signals_hdr.h');
    });

    it('an entry with a plain (Auto) CSC has no HeaderFile — the cell is blank', () => {
      expect(headerFileCell(byEntry.get('plainParam'))).toBe('');
    });
  });
});
