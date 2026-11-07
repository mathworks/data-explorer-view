// Copyright 2026 The MathWorks, Inc.
//
// The page's end of a folder across a message channel (wire.ts): a FolderHierarchy's listing and
// reads, asked of serveFolder wherever the files are. For a page with no file system (a sandboxed
// Electron window, a webview); a page beside its files gives the hierarchy their reader itself.
//
// Every question is a `folderRequest` with an id of its own, and its answer the `folderAnswer`
// with that id, whenever it comes. What is not a message of the wire is ignored; an answer in a
// shape a reader cannot use is a file that cannot be read (null), or for a listing a failure; and
// a question the host refused (a file it did not list) is answered null, as a reader answers for
// a file it was not given. A listing the host says was cut short answers a FolderFileList that
// says so (`truncated`). A folder's entries come sorted, whatever order the host sent them in, and
// a host that lists none answers them null: one with no `entries` refuses them, and one older than
// them answers its listing of files, with no `entries` field, which is dropped.
//
// DOM-free: a port is anything that posts and listens (wire.ts TablePort).
import type { SourceFile } from 'data-explorer-core';
import { sortEntries, type FolderEntry, type FolderEntryKind } from '../hierarchy/folderEntries.js';
import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import { folderFileList } from '../hierarchy/folderList.js';
import type { GraphReader, ProjectStore } from '../hierarchy/graphSources.js';
import type { FolderAsk, FolderRequestMessage, TablePort } from './wire.js';

/** A folder read across a channel: what folderReader returns. */
export interface FolderReader extends FolderFiles, GraphReader {
  /**
   * Hear the host say the folder changed (its FolderServer's `changed()`), until the returned
   * function is called. `uris`, when the host sent them, are the files the change touched, by
   * their uriString as the listing has them: a hint, which does not say whether each was created,
   * deleted or saved (list the folder again for that). Absent: something changed.
   */
  onChange(listener: (uris?: readonly string[]) => void): () => void;
  /** One level of `dir`, sorted (sortEntries); null when the host lists no entries (an older host). A host's error rejects. */
  entries(dir: string): Promise<readonly FolderEntry[] | null>;
  /** Stop listening, and reject what is still waiting. */
  dispose(): void;
}

/**
 * An answer, as a question's promise has it: its value, whether a listing was cut short, whether
 * the host refused, and a folder's entries, when the answer has the field.
 */
type Answer = { value: unknown; truncated: boolean; refused: boolean; entries?: { of: unknown } };
type Pending = { resolve: (answer: Answer) => void; reject: (err: Error) => void };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function filesOf(value: unknown): SourceFile[] {
  if (!Array.isArray(value)) throw new Error("The folder's host sent no list of its files.");
  return value
    .filter((f): f is SourceFile => isRecord(f) && typeof f.uriString === 'string' && typeof f.path === 'string')
    .map(({ uriString, path }) => ({ uriString, path }));
}

const ENTRY_KINDS: ReadonlySet<unknown> = new Set<FolderEntryKind>(['folder', 'data', 'other']);

// An entry of another shape is left out, as a listing's file is: a row needs its name, its path
// and what it is. Copied, so what a row keeps is the three fields alone.
function entriesOf(value: unknown): FolderEntry[] {
  if (!Array.isArray(value)) throw new Error("The folder's host sent no entries of the folder.");
  return sortEntries(
    value
      .filter((e): e is FolderEntry => isRecord(e) && typeof e.name === 'string' && typeof e.path === 'string' && ENTRY_KINDS.has(e.kind))
      .map(({ name, path, kind }) => ({ name, path, kind })),
  );
}

function bytesOf(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value;
  // A channel that sends a typed array for bytes (Electron's IPC sends a Buffer as a Uint8Array).
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return null;
}

function storeOf(value: unknown): ProjectStore | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string')) as ProjectStore;
}

/**
 * A folder whose files are read by a host across `port` (serveFolder), in the wire format
 * (wire.ts): its `list()`, its reads (`version`, `bytes`, `projectStore`) and a folder's
 * `entries(dir)` are questions to the host, and a call rejects with the host's message when its
 * listing, its reader or its listing of a folder threw. It reads
 * the files of the host's last listing, whichever `files` it is given, so one reader serves every
 * build of a hierarchy:
 *
 * ```ts
 * const folder = folderReader(portFromMessagePort(port));
 * const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
 * folder.onChange(() => hierarchy.rebuild());
 * ```
 *
 * `dispose()` stops listening, and rejects what is still waiting.
 */
export function folderReader(port: TablePort): FolderReader {
  let lastId = 0;
  let closed = false;
  const waiting = new Map<number, Pending>();
  const listeners = new Set<(uris?: readonly string[]) => void>();

  const stop = port.onMessage((m) => {
    if (!isRecord(m)) return;
    if (m.type === 'folderChanged') {
      // Uris that are not a list are no hint at all: read it all again.
      const uris = Array.isArray(m.uris) ? m.uris.filter((u): u is string => typeof u === 'string') : undefined;
      for (const listener of [...listeners]) {
        if (uris) listener(uris);
        else listener();
      }
      return;
    }
    if (m.type !== 'folderAnswer' || typeof m.id !== 'number') return;
    const pending = waiting.get(m.id);
    if (!pending) return;
    waiting.delete(m.id);
    if (typeof m.error === 'string') pending.reject(new Error(m.error));
    else {
      const refused = typeof m.refused === 'string';
      pending.resolve({
        value: refused ? null : m.value,
        truncated: m.truncated === true,
        refused,
        ...(!refused && 'entries' in m ? { entries: { of: m.entries } } : {}),
      });
    }
  });

  // A question names a file (`uri`), or for `entries` a folder (`dir`), or nothing (`list`).
  const ask = (what: FolderAsk, about: { file?: SourceFile; dir?: string } = {}): Promise<Answer> => {
    if (closed) return Promise.reject(new Error('This folder reader is closed.'));
    const id = ++lastId;
    const request: FolderRequestMessage = {
      type: 'folderRequest',
      id,
      ask: what,
      ...(about.file ? { uri: about.file.uriString } : {}),
      ...(about.dir !== undefined ? { dir: about.dir } : {}),
    };
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      port.postMessage(request);
    });
  };

  return {
    list: async () => {
      const { value, truncated } = await ask('list');
      return folderFileList(filesOf(value), truncated);
    },
    version: async (file) => {
      const { value } = await ask('version', { file });
      return typeof value === 'string' ? value : null;
    },
    bytes: async (file) => bytesOf((await ask('bytes', { file })).value),
    projectStore: async (file) => storeOf((await ask('projectStore', { file })).value),
    entries: async (dir) => {
      // No `entries` (a host older than the field answered its listing of files), or refused (a
      // host with no `entries`): the host lists none, which is no failure, but a tree of the
      // index's files alone.
      const { entries } = await ask('list', { dir });
      return entries ? entriesOf(entries.of) : null;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose() {
      if (closed) return;
      closed = true;
      stop();
      const err = new Error('This folder reader is closed.');
      for (const pending of waiting.values()) pending.reject(err);
      waiting.clear();
      listeners.clear();
    },
  };
}
