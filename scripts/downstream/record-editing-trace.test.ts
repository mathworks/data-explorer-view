// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Records the VS Code extension's table webview (src/webview/table-main.ts, as it ships) playing
// view's editing gesture script (test/editing-trace/gestures.ts): the fixture view's
// connectTable({editing}) is held to (test/fixtures/editing-trace.json, editingTrace.test.ts).
//
// Run inside the extension's checkout, with the script beside this file:
//   cp <view>/scripts/downstream/record-editing-trace.test.ts <vscode>/test/
//   cp <view>/test/editing-trace/gestures.ts <vscode>/test/editing-trace-gestures.ts
//   cd <vscode> && TRACE_OUT=/path/editing-trace.json npx vitest run test/record-editing-trace.test.ts
// Not run here: it imports the extension's webview, which this repository does not have.
import { writeFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { runGestures, type TraceEnv } from './editing-trace-gestures.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const posted: unknown[] = [];
let env: TraceEnv;

beforeAll(async () => {
  (globalThis as any).acquireVsCodeApi = () => ({ postMessage: (m: unknown) => void posted.push(JSON.parse(JSON.stringify(m))) });
  document.body.innerHTML = '<dex-tree-table></dex-tree-table>';
  // @ts-expect-error -- the extension's own webview entry, from its checkout
  await import('../src/webview/table-main.js');
  env = {
    table: document.querySelector('dex-tree-table'),
    contextMenu: document.querySelector('dex-context-menu'),
    errorDialog: document.querySelector('dex-error-dialog'),
    send: (data) => void window.dispatchEvent(new MessageEvent('message', { data })),
    posted,
  };
}, 60_000);

it('records the extension webview playing the editing gestures', async () => {
  const trace = await runGestures(env);
  expect(trace.length).toBeGreaterThan(0);
  const out = process.env.TRACE_OUT;
  if (out) writeFileSync(out, JSON.stringify(trace, null, 2) + '\n');
}, 60_000);
