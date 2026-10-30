// Copyright 2026 The MathWorks, Inc.
//
// The binary dictionary engine (src/model/edit/binaryEngine.ts) as the VS Code extension's
// integration suites drive its binary dictionary editor: a table of the document across a channel
// (serveTable), sent the messages its webview sends and recording every message it posts back, and
// the document's edit stack as a real EditStack (`stack`, moved by the table's Undo and Redo)
// beside the list of edits it was handed (`events`). The suites' helpers are here under their names
// (entryRow, names, readSldd, entryOf, …), so that a case ported from
// test-integration/suite/binarySldd*.test.ts reads as it does there; the ones a MAT-file's suites
// share are the MAT harness's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSession, parseBinarySldd } from 'data-explorer-core';
import { unzipSync } from 'fflate';
import { createRegisters, type Notice, type Registers } from '../../src/model/index.js';
import { BinaryEngine, EditStack, EditStackIndex, type Edit } from '../../src/host/index.js';
import { serveTable } from '../../src/serve/index.js';
import { waitFor } from '../matEngine/harness.js';

export { errorsIn, nameOf, shownCells, tableOf, waitFor } from '../matEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REPO = join(import.meta.dirname, '..', '..');

/** A file of this repository by its path from the root: `test/fixtures/arch_binary.sldd`. */
export const file = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(REPO, rel)));

/** The extension's MATLAB-written binary params.sldd (its test/parity/artifacts/binary one). */
export const PARAMS = 'test-integration/fixtures/sldd/params_binary.sldd';
/** The extension's integration workspace's binary.sldd. */
export const WORKSPACE_BINARY = 'test-integration/fixtures/workspace/binary.sldd';

export const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
const label = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');

/** A dictionary's entry row by name, from its last whole paint. */
export function entryRow(posts: any[], name: string): any {
  const rows = posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];
  const row = rows.find((r: any) => isEntryRow(r) && label(r) === name);
  if (!row) throw new Error(`the dictionary has no entry row for "${name}"`);
  return row;
}

/** The entry names a chunk holds, in order. */
export const chunkNames = (chunkXml: string): string[] =>
  [...chunkXml.matchAll(/<Object Class="DD\.ENTRY">\s*<P Name="Name"(?: Class="char")?>([^<]*)<\/P>/g)].map((m) => m[1]);

/** A dictionary's members, by name: the zip a save writes. */
export const membersOf = (bytes: Uint8Array): Record<string, Uint8Array> => unzipSync(bytes);

/** The data part of a saved dictionary, decoded. */
export const chunkOf = (bytes: Uint8Array): string => new TextDecoder().decode(membersOf(bytes)['data/chunk0.xml']);

/** The tree core reads from a dictionary's bytes (either format), in a session of its own, for as long as `read` runs. */
export function readSldd<T>(bytes: Uint8Array, read: (dict: any) => T): T {
  const session = createSession();
  const content =
    bytes[0] === 0x7b
      ? JSON.parse(new TextDecoder().decode(bytes))
      : parseBinarySldd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return read(session.addDataSource('readback.sldd', content, { path: 'readback.sldd' }));
}

/** A dictionary's entry of that name, in any section. */
export const entryOf = (dict: any, name: string): any =>
  ((dict?.children ?? []) as any[]).flatMap((s: any) => s.children ?? []).find((e: any) => e.name === name);

/** One table of a document: what it posted, and how to send it a message. */
export interface View {
  /** The table's source, which the channel serves. */
  source: ReturnType<BinaryEngine['view']>;
  posts: any[];
  send(message: Record<string, unknown>): void;
  close(): void;
}

/** A table of `engine` across a channel, the way the extension's fakePanel is one of its editor. */
export function viewOf(engine: BinaryEngine): View {
  const posts: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const source = engine.view();
  const stop = serveTable(source, {
    postMessage: (m) => void posts.push(JSON.parse(JSON.stringify(m))),
    onMessage: (listener) => ((hear = listener), () => (hear = () => {})),
  });
  return {
    source,
    posts,
    send: (m) => hear(m),
    close: () => {
      stop();
      source.dispose();
    },
  };
}

/** An open dictionary: the engine, its first table, the edits VS Code would hold, and what it said. */
export interface Opened {
  engine: BinaryEngine;
  view: View;
  /** Every edit the stack was handed, in order (what VS Code's edit events would be). */
  events: Edit[];
  /** The document's stack, a real EditStack, which the table's Undo and Redo move. */
  stack: EditStack;
  index: EditStackIndex;
  /** Undo or redo through the table, as its Undo and Redo send them. */
  undo(): void;
  redo(): void;
  notices: Notice[];
  original: Uint8Array;
  session: ReturnType<typeof createSession>;
  /** The tree the session holds for the document. */
  model(): any;
  /** The entry names the document's chunk holds. */
  names(): string[];
  /** Save as the extension's save does: the bytes, the save point moved. */
  save(): Uint8Array;
  /** The bytes the last save wrote: the file on disk. */
  disk(): Uint8Array;
}

/**
 * The dictionary at `rel` (or `bytes` under its name), opened in an engine of its own session, its
 * first table painted. `registers` is the window's, shared by every document a case opens;
 * `fromBackup` opens the bytes as a restored backup (dirty until saved); `as` the name it is opened
 * under, which its uri ends in.
 */
export async function open(
  rel: string,
  bytes: Uint8Array = file(rel),
  opts: { as?: string; registers?: Registers; session?: ReturnType<typeof createSession>; fromBackup?: boolean; uri?: string } = {},
): Promise<Opened> {
  const session = opts.session ?? createSession();
  const as = opts.as ?? rel.slice(rel.lastIndexOf('/') + 1);
  const events: Edit[] = [];
  const stack = new EditStack();
  const notices: Notice[] = [];
  const index = new EditStackIndex(!!opts.fromBackup);
  let onDisk = bytes;
  const engine = new BinaryEngine({
    session,
    ...(opts.uri ? { uri: opts.uri } : { uri: `file:///work/${as}`, name: as }),
    bytes,
    // A real stack, every edit it is handed recorded as VS Code's edit events would be.
    sink: {
      push: (edit) => {
        events.push(edit);
        stack.push(edit);
      },
      undo: () => stack.undo(),
      redo: () => stack.redo(),
    },
    index,
    registers: opts.registers ?? createRegisters(),
    notify: (n) => void notices.push(n),
  });
  const view = viewOf(engine);
  view.send({ type: 'ready' });
  await waitFor(`${as}'s first rows`, () => view.posts.some((p) => p.type === 'setRows' || p.type === 'error'));
  return {
    engine,
    view,
    events,
    stack,
    index,
    undo: () => view.send({ type: 'undo' }),
    redo: () => view.send({ type: 'redo' }),
    notices,
    original: bytes,
    session,
    model: () => session.getDataSource(engine.srcId),
    names: () => chunkNames(engine.chunkXml),
    save() {
      const save = engine.beginSave();
      engine.saved(save);
      index.saved(save.at);
      onDisk = save.bytes;
      return save.bytes;
    },
    disk: () => onDisk,
  };
}
