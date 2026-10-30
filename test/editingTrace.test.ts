// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing}) against the VS Code extension's table webview: the same editing
// gestures (editing-trace/gestures.ts), played on a table wired the way the extension's webview
// will be once it moves onto connectTable (below), must send the host exactly what the
// extension's table-main.ts sends, and show exactly what it shows. The extension's side is a
// recording of its own webview at c73da3c (fixtures/editing-trace.json, made by
// scripts/downstream/record-editing-trace.test.ts in its checkout).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable } from '../src/widgets/tree-table/index.js';
import { defineContextMenu } from '../src/widgets/context-menu/index.js';
import { defineErrorDialog } from '../src/widgets/error-dialog/index.js';
import { defineVariableEditor } from '../src/widgets/variable-editor/index.js';
import { messageSource, type TablePort } from '../src/model/index.js';
import { runGestures, type TraceEnv, type TraceStep } from './editing-trace/gestures.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const RECORDED: TraceStep[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'editing-trace.json'), 'utf8'));

/**
 * The extension's table webview as it will be on connectTable({editing}): the port its messages
 * cross (vscodePort), its own reading of setRows' `hasTextView`, registered before the source as
 * its message listener is, its extras (selectByName, openAddGallery) through messageSource's
 * `extra`, Locate in Text as the text view, and the selection and links relayed to the host.
 */
function extensionShell(): TraceEnv {
  const posted: unknown[] = [];
  const listeners = new Set<(m: unknown) => void>();
  const port: TablePort = {
    postMessage: (m) => void posted.push(JSON.parse(JSON.stringify(m))),
    onMessage: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  };
  defineTreeTable();
  defineContextMenu();
  defineErrorDialog();
  defineVariableEditor();
  document.body.innerHTML = '<dex-tree-table></dex-tree-table>';
  const table = document.querySelector('dex-tree-table') as any;
  const overlay = (tag: string): any => document.body.appendChild(document.createElement(tag));
  const contextMenu = overlay('dex-context-menu');
  const errorDialog = overlay('dex-error-dialog');
  const variableEditor = overlay('dex-variable-editor');

  let hasTextView = false;
  port.onMessage((m: any) => {
    if (m?.type === 'setRows') hasTextView = !!m.hasTextView;
  });
  const source = messageSource(port, {
    extra: (m) => {
      if (m.type === 'selectByName' && typeof m.name === 'string') handle.selectByName(m.name);
      else if (m.type === 'openAddGallery') handle.toggleAddGallery();
    },
  });
  const handle = connectTable(table, source, {
    variableEditor,
    contextMenu,
    errorDialog,
    editing: true,
    textView: { available: () => hasTextView, locate: (rowId) => port.postMessage({ type: 'locateInText', rowId }) },
    banners: () => {},
  });
  handle.on('select', (rowIds) => port.postMessage({ type: 'select', rowIds }));
  handle.on('navigate', ({ target }) => port.postMessage({ type: 'navigate', target }));

  return {
    table,
    contextMenu,
    errorDialog,
    send: (message) => {
      for (const listener of [...listeners]) listener(message);
    },
    posted,
  };
}

describe('connectTable({editing}), played against the extension webview’s recording', () => {
  let played: TraceStep[];
  beforeAll(async () => {
    played = await runGestures(extensionShell());
  }, 60_000);

  it('plays every step the recording has', () => {
    expect(played.map((s) => s.step)).toEqual(RECORDED.map((s) => s.step));
  });

  for (const recorded of RECORDED) {
    it(`${recorded.step}: sends and shows what the extension's webview does`, () => {
      const step = played.find((s) => s.step === recorded.step);
      expect(step?.posted).toEqual(recorded.posted);
      expect(step?.seen).toEqual(recorded.seen);
    });
  }
});
