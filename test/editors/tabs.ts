// Copyright 2026 The MathWorks, Inc.
//
// The three editing engines behind one shape, for a suite that does the same thing in each, as the
// VS Code extension's test-integration/suite/tools/editorTabs.ts puts its three table editors: open
// a file, find a row, see whether an edit reached the document, save, and read the saved bytes back
// with core. Each engine is opened by its own harness (test/{matEngine,jsonEngine,binaryEngine}),
// whose save is the extension's save of that editor.
import { createSession, parseBinarySldd } from 'data-explorer-core';
import { buffer, open as openMat, topRow } from '../matEngine/harness.js';
import { entryRow as jsonEntryRow, open as openJson } from '../jsonEngine/harness.js';
import { entryOf, entryRow as binaryEntryRow, open as openBinary } from '../binaryEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** One engine's table of one document, as these suites drive it. */
export interface EditorTab {
  view: { posts: any[]; send(message: any): void };
  /** The row of the entry or variable of that name, as the table holds it. */
  row(name: string): any;
  /** Whether any edit reached the document since it was opened. */
  edited(): boolean;
  dirty(): boolean;
  /** Save, and answer the bytes the file then holds. */
  save(): Uint8Array;
}

export interface EditorKind {
  name: string;
  /** `bytes` opened under the name `as` in this engine, its first table painted. */
  open(as: string, bytes: Uint8Array): Promise<EditorTab>;
  /** What `read` makes of the entry or variable `name` core reads from saved bytes, in the session it is read into. */
  readBack<T>(bytes: Uint8Array, name: string, read: (node: any, session: ReturnType<typeof createSession>) => T): T;
}

export const MAT_EDITOR: EditorKind = {
  name: 'a MAT-file',
  open: async (as, bytes) => {
    const m = await openMat(as, bytes, { as });
    return {
      view: m.view,
      row: (name) => topRow(m.view.posts, name),
      edited: () => m.events.length > 0,
      dirty: () => m.index.dirty,
      save: () => m.save(),
    };
  },
  readBack: (bytes, name, read) => {
    const session = createSession();
    const mat: any = session.addMatSource('readback', buffer(bytes), { path: 'readback.mat' });
    return read((mat.children as any[]).find((v) => v.name === name), session);
  },
};

/** A dictionary's entry of that name core reads from `bytes` (either format), in a session of its own. */
function readSldd<T>(bytes: Uint8Array, name: string, read: (node: any, session: ReturnType<typeof createSession>) => T): T {
  const session = createSession();
  const content = bytes[0] === 0x7b ? JSON.parse(new TextDecoder().decode(bytes)) : parseBinarySldd(buffer(bytes));
  return read(entryOf(session.addDataSource('readback.sldd', content, { path: 'readback.sldd' }), name), session);
}

export const TEXT_EDITOR: EditorKind = {
  name: 'a text dictionary',
  open: async (as, bytes) => {
    const j = await openJson(as, bytes, { as });
    const version = j.text.version;
    return {
      view: j.view,
      row: (name) => jsonEntryRow(j.view.posts, name),
      edited: () => j.text.version !== version,
      dirty: () => j.text.dirty,
      save: () => j.save(),
    };
  },
  readBack: readSldd,
};

export const BINARY_EDITOR: EditorKind = {
  name: 'a binary dictionary',
  open: async (as, bytes) => {
    const b = await openBinary(as, bytes, { as });
    return {
      view: b.view,
      row: (name) => binaryEntryRow(b.view.posts, name),
      edited: () => b.events.length > 0,
      dirty: () => b.index.dirty,
      save: () => b.save(),
    };
  },
  readBack: readSldd,
};

/** A turn and then some: long enough for a write the case says must not happen to have happened. */
export const quiet = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));
