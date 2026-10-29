// Copyright 2026 The MathWorks, Inc.
//
// The host's end of a folder across a message channel (wire.ts): a folder's listing and the reads
// of its files, answered where the files are (Electron's main process, a worker) for a
// FolderHierarchy where they are not (a sandboxed page), over folderReader on the other end. The
// hierarchy across the channel draws what it draws beside its reader
// (test/goldens/hierarchy.test.ts holds the two to each other).
//
// It reads only what the folder lists: a question names its file by uri, and is answered from the
// host's own listing, never from a path the page sends.
//
// DOM-free, and with no import at run time, so a main process that bundles it bundles nothing else.
import type { SourceFile } from 'data-explorer-core';
import type { FolderHierarchyOptions } from '../hierarchy/folderHierarchy.js';
import type { GraphReader } from '../hierarchy/graphSources.js';
import type { FolderHostMessage, TablePort } from './wire.js';

/**
 * A folder and how to read it: the `files` and the `reader` a FolderHierarchy is given. Served
 * from where the files are (serveFolder), or given to a FolderHierarchy beside them.
 */
export type FolderReads = Pick<FolderHierarchyOptions, 'files' | 'reader'>;

/** How serveFolder answers. */
export interface ServeFolderOptions {
  /**
   * Hand a file's bytes over rather than copy them: `port.postMessage` is called with the bytes'
   * ArrayBuffer in a transfer list, its second argument, as a worker's or a `MessagePort`'s
   * postMessage takes one, and the reader's buffer is left detached. Only for such a port (not a
   * window's postMessage, whose second argument is an origin, nor Electron's `MessagePortMain`,
   * which transfers only ports), and a reader that keeps none of the buffers it answers. Default
   * false: the bytes are copied.
   */
  transfer?: boolean;
}

/** A folder being served: what serveFolder returns. */
export interface FolderServer {
  /**
   * Say the folder changed (a file created, deleted or saved): the page's folderReader tells its
   * `onChange` listeners, for its hierarchy to read the folder again.
   */
  changed(): void;
  /** Stop answering. Reads still going are not answered. */
  dispose(): void;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** A port whose postMessage takes a transfer list (ServeFolderOptions.transfer). */
interface TransferPort {
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
}

/**
 * Answer the page's end of `port` (folderReader) from `folder`, until `dispose()`:
 *
 * - `list` with the folder's files, `folder.files.list()`, which this keeps as the listing, with
 *   `folder.reader(files)` its reader;
 * - `version`, `bytes` and `projectStore` with what that reader answers for the file of the
 *   listing the question names, or null for one it does not hold;
 * - a throw or a rejection with its message, for the page's call to reject with.
 *
 * `changed()` says the folder changed. Any other message is left alone, for whatever else listens
 * on the port (a table's, for one).
 *
 * In Electron's main process, over a `MessageChannelMain` port given to the page:
 * ```ts
 * const served = serveFolder({ files, reader }, {
 *   postMessage: (message) => port.postMessage(message),
 *   onMessage: (listener) => {
 *     const hear = (e: Electron.MessageEvent) => listener(e.data);
 *     port.on('message', hear);
 *     port.start();
 *     return () => port.off('message', hear);
 *   },
 * });
 * watcher.on('change', () => served.changed());
 * ```
 */
export function serveFolder(folder: FolderReads, port: TablePort, options: ServeFolderOptions = {}): FolderServer {
  let stopped = false;
  // The last listing that answered, and its reader: what each question about a file is answered
  // from. A listing asked before another that has answered already is not kept.
  let listing: { files: ReadonlyMap<string, SourceFile>; reader: GraphReader } | null = null;
  let listsAsked = 0;
  let listKept = 0;

  const post = (message: FolderHostMessage, bytes?: ArrayBuffer): void => {
    if (stopped) return;
    if (bytes && options.transfer) (port as unknown as TransferPort).postMessage(message, [bytes]);
    else port.postMessage(message);
  };
  const answer = (id: number, question: () => Promise<unknown>): void => {
    Promise.resolve()
      .then(question)
      .then(
        (value) => {
          const message = { type: 'folderAnswer', id, value: value ?? null } as FolderHostMessage;
          post(message, value instanceof ArrayBuffer ? value : undefined);
        },
        (err) => post({ type: 'folderAnswer', id, error: messageOf(err) }),
      );
  };

  const list = async (): Promise<SourceFile[]> => {
    const asked = ++listsAsked;
    const files = [...(await folder.files.list())];
    const reader = folder.reader(files);
    if (asked > listKept) {
      listKept = asked;
      listing = { files: new Map(files.map((file) => [file.uriString, file])), reader };
    }
    // Just what the wire carries: a listing's own objects may hold more, and what cannot be cloned.
    return files.map(({ uriString, path }) => ({ uriString, path }));
  };

  const unlisten = port.onMessage((m) => {
    if (!isRecord(m) || m.type !== 'folderRequest' || typeof m.id !== 'number') return;
    const { id, ask } = m;
    switch (ask) {
      case 'list':
        return answer(id, list);
      case 'version':
      case 'bytes':
      case 'projectStore': {
        const now = listing;
        const file = typeof m.uri === 'string' ? now?.files.get(m.uri) : undefined;
        return answer(id, async () => (now && file ? now.reader[ask](file) : null));
      }
    }
  });

  return {
    changed() {
      post({ type: 'folderChanged' });
    },
    dispose() {
      stopped = true;
      unlisten();
    },
  };
}
