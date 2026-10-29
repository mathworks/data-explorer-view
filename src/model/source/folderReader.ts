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
// says so (`truncated`).
//
// DOM-free: a port is anything that posts and listens (wire.ts TablePort).
import type { SourceFile } from 'data-explorer-core';
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
  /** Stop listening, and reject what is still waiting. */
  dispose(): void;
}

/** An answer, as a question's promise has it: its value, and whether a listing was cut short. */
type Answer = { value: unknown; truncated: boolean };
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
 * (wire.ts): its `list()` and its reads (`version`, `bytes`, `projectStore`) are questions to the
 * host, and a call rejects with the host's message when its listing or its reader threw. It reads
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
    else pending.resolve({ value: typeof m.refused === 'string' ? null : m.value, truncated: m.truncated === true });
  });

  const ask = (what: FolderAsk, file?: SourceFile): Promise<Answer> => {
    if (closed) return Promise.reject(new Error('This folder reader is closed.'));
    const id = ++lastId;
    const request: FolderRequestMessage = { type: 'folderRequest', id, ask: what, ...(file ? { uri: file.uriString } : {}) };
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
      const { value } = await ask('version', file);
      return typeof value === 'string' ? value : null;
    },
    bytes: async (file) => bytesOf((await ask('bytes', file)).value),
    projectStore: async (file) => storeOf((await ask('projectStore', file)).value),
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
