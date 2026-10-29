// Copyright 2026 The MathWorks, Inc.
//
// The host's end of the wire (wire.ts): any TableSource, answering a table's end across a message
// channel. With messageSource on the other end, a table across the channel is fed exactly as one
// beside its source is (test/goldens/wire.test.ts holds the two to each other).
//
// DOM-free: an app with core in a worker, or in Electron's main process, serves its documents from
// there.
import type { TableChange, TableSource } from './tableSource.js';
import type { TableHostMessage, TablePort } from './wire.js';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A change as the message that carries it. */
function changeMessage(change: TableChange): TableHostMessage {
  switch (change.kind) {
    case 'replaceAll':
      return { type: 'setRows', ...change.view };
    case 'updateEntry':
      return { type: 'updateEntryRows', entryRowId: change.entryRowId, rows: change.rows };
    case 'insertEntry':
      return {
        type: 'insertEntryRows',
        sectionRowId: change.sectionRowId,
        ...(change.beforeRowId === undefined ? {} : { beforeRowId: change.beforeRowId }),
        rows: change.rows,
      };
    case 'error':
      return { type: 'error', message: change.message };
  }
}

/**
 * Answer the table's end of `port` from `source`, until the returned function is called:
 *
 * - `ready` with `setRows` (the source's `open()`), or `error` with why it cannot be shown;
 * - `requestChildren` with `childRows`, `requestMatrix` with `matrixCells`;
 * - `select` with `showProps` for the selection's first row, or `empty`;
 * - and every change the source makes, as it makes it: `setRows`, `updateEntryRows`,
 *   `insertEntryRows` or `error`.
 *
 * Any other message is left alone, for whatever else listens on the port.
 */
export function serveTable(source: TableSource, port: TablePort): () => void {
  let stopped = false;
  const post = (message: TableHostMessage): void => {
    if (!stopped) port.postMessage(message);
  };
  // A source's answers are total (TableSource); one that rejects anyway (a source relayed from
  // further away, closed meanwhile) has nothing left to say, and is not told to the port.
  const answer = <T>(question: Promise<T>, toMessage: (value: T) => TableHostMessage): void => {
    question.then((value) => post(toMessage(value)), () => {});
  };
  const unsubscribe = source.subscribe((change) => post(changeMessage(change)));
  const unlisten = port.onMessage((m) => {
    if (typeof m !== 'object' || m === null) return;
    const msg = m as { type?: unknown; nodeId?: unknown; rowIds?: unknown };
    switch (msg.type) {
      case 'ready':
        source.open().then(
          (view) => post({ type: 'setRows', ...view }),
          (err) => post({ type: 'error', message: messageOf(err) }),
        );
        return;
      case 'requestChildren':
        if (typeof msg.nodeId !== 'string') return;
        answer(source.children(msg.nodeId), (rows) => ({ type: 'childRows', ...rows }));
        return;
      case 'requestMatrix': {
        const nodeId = typeof msg.nodeId === 'string' ? msg.nodeId : '';
        answer(source.matrix(nodeId), (page) => ({ type: 'matrixCells', ...page }));
        return;
      }
      case 'select': {
        const rowIds = Array.isArray(msg.rowIds) ? msg.rowIds.filter((id): id is string => typeof id === 'string') : [];
        answer(source.inspect(rowIds), (page) =>
          page.rowId === undefined ? { type: 'empty' } : { type: 'showProps', groups: page.groups },
        );
        return;
      }
    }
  });
  return () => {
    stopped = true;
    unsubscribe();
    unlisten();
  };
}
