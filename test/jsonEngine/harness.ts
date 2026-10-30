// Copyright 2026 The MathWorks, Inc.
//
// The JSON dictionary engine (src/model/edit/jsonEngine.ts) as the VS Code extension's integration
// suites drive its JSON table editor: a table of the document across a channel (serveTable), sent
// the messages its webview sends and recording every message it posts back, over the page's own
// TextStore (createTextStore), which stands in for the TextDocument. Another writer of the text (a
// text view, an outside reload) is the store's `apply` and `reset`; VS Code's Undo and Redo are the
// table's own messages. The suites' helpers are here under their names (entryNames, chunkOf, …), so
// that a case ported from test-integration/suite/*.test.ts reads as it does there; the ones every
// table's suites share are the MAT harness's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSession } from 'data-explorer-core';
import { createRegisters, type Notice, type Registers } from '../../src/model/index.js';
import { JsonEngine, type JsonDisk, type JsonUsageFill } from '../../src/model/edit/jsonEngine.js';
import { createTextStore, type PageTextStore } from '../../src/model/edit/textStore.js';
import type { DiskStamp } from '../../src/model/edit/slddBaseline.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { serveTable } from '../../src/serve/index.js';
import { waitFor } from '../matEngine/harness.js';

export { errorsIn, nameOf, shownCells, tableOf, waitFor } from '../matEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REPO = join(import.meta.dirname, '..', '..');

/** A file of this repository by its path from the root: `test/fixtures/params.sldd`. */
export const file = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(REPO, rel)));

/** The extension's integration workspace's JSON dictionaries. */
export const WORKSPACE_PARAMS = 'test-integration/fixtures/workspace/params.sldd';
export const WORKSPACE_DATA = 'test-integration/fixtures/workspace/data.sldd';

const CHUNK = '__MW_TEXT_PART__/data/chunk0';

/** A dictionary text's data part, parsed. */
export function chunkOf(text: string): any {
  const content = JSON.parse(text)?.__MW_TEXT_PARTS__?.[CHUNK]?.__MW_TEXT_content;
  if (!content) throw new Error('the document no longer spells a data/chunk0 part');
  return content;
}

/** The entry names a dictionary's text holds, in order. */
export const entryNames = (text: string): string[] => ((chunkOf(text).entries ?? []) as any[]).map((e) => e.name);

export const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
const label = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');

/** A dictionary's entry row by name, from its last whole paint. */
export function entryRow(posts: any[], name: string): any {
  const rows = posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];
  const row = rows.find((r: any) => isEntryRow(r) && label(r) === name);
  if (!row) throw new Error(`the dictionary has no entry row for "${name}"`);
  return row;
}

/** A turn, and every change the store and the table had queued: what an `await quiet()` stands for. */
export const settle = async (turns = 4): Promise<void> => {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** One table of a document: what it posted, and how to send it a message. */
export interface View {
  source: ReturnType<JsonEngine['view']>;
  posts: any[];
  send(message: Record<string, unknown>): void;
  close(): void;
}

/** A table of `engine` across a channel, the way the extension's fakePanel is one of its editor. */
export function viewOf(engine: JsonEngine): View {
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

/** The file behind a document: the bytes it holds, and a stamp moved by every write. */
export interface Disk extends JsonDisk {
  bytes: Uint8Array;
  stamp: DiskStamp;
  /** The file now holds `bytes` (a save, another program's write). */
  write(bytes: Uint8Array): void;
}

export function diskOf(bytes: Uint8Array): Disk {
  let generation = 0;
  const disk: Disk = {
    bytes,
    stamp: { mtime: generation, size: bytes.length },
    stat: async () => disk.stamp,
    read: async () => disk.bytes,
    write(next) {
      disk.bytes = next;
      disk.stamp = { mtime: ++generation, size: next.length };
    },
  };
  return disk;
}

/** An open JSON dictionary: the engine, its first table, its text, and what it said. */
export interface Opened {
  engine: JsonEngine;
  view: View;
  text: PageTextStore;
  disk: Disk;
  registry: DocumentRegistry;
  session: ReturnType<typeof createSession>;
  notices: Notice[];
  original: Uint8Array;
  /** The tree the session holds for the document. */
  model(): any;
  /** The entry names the text holds. */
  names(): string[];
  /** Undo or redo through the table, as its Undo and Redo send them; resolves once the text has moved. */
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Save as the extension's save does: the text as it stands, written; resolves with the bytes. */
  save(): Uint8Array;
  /** Another writer's edit of the text (a text view), as one replacement: resolves with whether it landed. */
  type(offset: number, length: number, text: string): Promise<boolean>;
}

/**
 * The dictionary at `rel` (or `bytes` under its name), opened in an engine of its own registry, its
 * first table painted. `registers` is the window's, shared by every document a case opens;
 * `registry` the session's, for documents a case wants in one session; `as` the name its uri ends in.
 */
export async function open(
  rel: string,
  bytes: Uint8Array = file(rel),
  opts: { as?: string; uri?: string; registers?: Registers; registry?: DocumentRegistry; usage?: JsonUsageFill } = {},
): Promise<Opened> {
  const registry = opts.registry ?? new DocumentRegistry(createSession());
  const as = opts.as ?? rel.slice(rel.lastIndexOf('/') + 1);
  const notices: Notice[] = [];
  const text = createTextStore(new TextDecoder().decode(bytes));
  const disk = diskOf(bytes);
  const engine = new JsonEngine({
    registry,
    ...(opts.uri ? { uri: opts.uri } : { uri: `file:///work/${as}`, name: as }),
    text,
    registers: opts.registers ?? createRegisters(),
    notify: (n) => void notices.push(n),
    disk,
    ...(opts.usage ? { usage: opts.usage } : {}),
  });
  const view = viewOf(engine);
  view.send({ type: 'ready' });
  await waitFor(`${as}'s first rows`, () => view.posts.some((p) => p.type === 'setRows' || p.type === 'error'));
  await settle();
  const moved = async (step: () => void): Promise<void> => {
    const version = text.version;
    step();
    await waitFor('the text to move', () => text.version !== version);
    await settle();
  };
  return {
    engine,
    view,
    text,
    disk,
    registry,
    session: registry.session as ReturnType<typeof createSession>,
    notices,
    original: bytes,
    model: () => registry.peekModel(engine.uri),
    names: () => entryNames(text.text),
    undo: () => moved(() => view.send({ type: 'undo' })),
    redo: () => moved(() => view.send({ type: 'redo' })),
    save() {
      const written = new TextEncoder().encode(text.text);
      disk.write(written);
      text.saved(text.version);
      return written;
    },
    type: (offset, length, replacement) => text.apply([{ offset, length, text: replacement }]),
  };
}
