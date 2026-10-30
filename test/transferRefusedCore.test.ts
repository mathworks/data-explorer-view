// Copyright 2026 The MathWorks, Inc.
//
// TransferRefused is core's, re-exported: a refusal core's paste rules throw (refuseDisallowedPaste)
// is one runTransfer tells as a refusal, said and repairing nothing, and not a failure. With a class
// of view's own beside core's, `instanceof` told them apart, and core's refusal took the failure path.
// cloneForPaste and recordCopy are core's too, which the MAT-file engine pastes with; view's entries
// carry neither.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSession, ingest, refuseDisallowedPaste, TransferRefused as CoreTransferRefused } from 'data-explorer-core';
import { describe, expect, it } from 'vitest';
import * as model from '../src/model/index.js';
import * as host from '../src/host/index.js';
import { TransferRefused, createRegisters, runTransfer, type ClipboardItem, type TransferAdapter, type TransferTarget } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ARCH = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'arch.sldd')));

describe("core's TransferRefused, re-exported", () => {
  it('is the very class core throws; cloneForPaste and recordCopy are on no entry of view', () => {
    expect(TransferRefused).toBe(CoreTransferRefused);
    for (const entry of [model, host]) {
      expect(Object.keys(entry)).not.toContain('cloneForPaste');
      expect(Object.keys(entry)).not.toContain('recordCopy');
    }
  });

  it("takes runTransfer's refusal path for what core's refuseDisallowedPaste refuses", async () => {
    const session = createSession();
    const dict: any = ingest(session, ARCH, { filename: 'arch.sldd' });
    const arch = dict.children.find((s: any) => s.name === 'arch');
    const param = { name: 'Kp', metadata: { uuid: 'u-Kp' }, value: { _array_class: 'Simulink.Parameter', Value: 1 } };
    const registers = createRegisters();
    const item: ClipboardItem = {
      payload: param,
      sourceSection: 'design',
      className: 'Simulink.Parameter',
      arrayClass: 'Simulink.Parameter',
      kind: 'Parameter',
      isMatlabVariable: false,
      isScalarNumeric: false,
    };
    registers.setClipboard([item], 'copy', 'file:///work/other.sldd');
    const reports: string[] = [];
    const failures: unknown[] = [];
    const commits: unknown[] = [];
    const adapter: TransferAdapter<TransferTarget> = {
      docUri: 'file:///work/arch.sldd',
      resolveTarget: () => ({ sectionName: 'arch' }),
      validate: (_target, payloads) => refuseDisallowedPaste(arch, payloads),
      commit: (plan) => void commits.push(plan),
      onFailure: (err) => void failures.push(err),
      report: (message) => void reports.push(message),
    };
    const out = await runTransfer({ rowId: 'section:arch' }, registers.clipboardRegister(() => {}), adapter, {
      deleteFromSource: async () => ({ removed: true }),
    });
    expect(out.kind).toBe('refused');
    expect(reports).toEqual([(out as { message: string }).message]);
    expect(reports[0]).toMatch(/^Failed to apply edit: A "Simulink\.Parameter" entry is not allowed in /);
    expect(failures).toEqual([]);
    expect(commits).toEqual([]);
    expect(registers.getClipboard(), 'a refused paste leaves the clipboard for another try').not.toBeNull();
  });
});
