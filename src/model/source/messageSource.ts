// Copyright 2026 The MathWorks, Inc.
//
// The table's end of the wire (wire.ts): a TableSource whose answers come from a host across a
// message channel, and an InspectorFeed of the pages a host sends an inspector.
//
// Every question is a message (`ready`, `requestChildren`, `requestMatrix`, `select`), and its
// answer is the next message of the matching kind: for children and cells, the next one naming
// the same node, first asked first answered. A host's message no question waits for is a change:
// a `setRows` is a `replaceAll`, an `error` an `error`. What is not a message of the wire, or is
// one in a shape a table cannot use, is ignored, except a repaint of an entry that cannot be
// applied: the table is then out of step with its host, and asks for the whole table again.
//
// DOM-free: a port is anything that posts and listens (wire.ts TablePort).
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';
import type { ChildRows, InspectorFeed, InspectorView, MatrixPage, TableChange, TableSource, TableView } from './tableSource.js';
import type { TablePort } from './wire.js';

type Pending<T> = { resolve: (value: T) => void; reject: (err: Error) => void };

function isRecord(x: unknown): x is Record<string, any> {
  return typeof x === 'object' && x !== null;
}

const COULD_NOT_READ = 'This value could not be read as a table.';

/** The answer a matrix request gets from a `matrixCells`: its cells, or why there are none. */
function matrixPage(nodeId: string, m: Record<string, any>): MatrixPage {
  return isRecord(m.matrix)
    ? { nodeId, matrix: m.matrix as any }
    : { nodeId, message: typeof m.message === 'string' ? m.message : COULD_NOT_READ };
}

/** First asked, first answered, per node id. */
class Waiting<T> {
  private readonly byId = new Map<string, Pending<T>[]>();
  add(id: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const list = this.byId.get(id) ?? [];
      list.push({ resolve, reject });
      this.byId.set(id, list);
    });
  }
  take(id: string): Pending<T> | undefined {
    const list = this.byId.get(id);
    const first = list?.shift();
    if (list && list.length === 0) this.byId.delete(id);
    return first;
  }
  rejectAll(err: Error): void {
    for (const list of this.byId.values()) for (const p of list) p.reject(err);
    this.byId.clear();
  }
}

/**
 * A TableSource answered by a host across `port`, in the wire format (wire.ts).
 *
 * `open()` says `ready` and resolves with the next `setRows` (or rejects with the next `error`);
 * `children()` and `matrix()` ask with `requestChildren` and `requestMatrix`; `inspect()` sends a
 * `select` and resolves with the `showProps` or `empty` that answers it. Every later `setRows`,
 * `updateEntryRows`, `insertEntryRows` and `error` reaches the subscribers as a TableChange.
 *
 * The returned `dispose()` stops listening, and rejects what is still waiting.
 */
export function messageSource(port: TablePort): TableSource & { dispose(): void } {
  let docUri = '';
  const opens: Pending<TableView>[] = [];
  const children = new Waiting<ChildRows>();
  const matrices = new Waiting<MatrixPage>();
  const inspects: { first: string | undefined; pending: Pending<InspectorView> }[] = [];
  const listeners = new Set<(change: TableChange) => void>();

  const emit = (change: TableChange): void => {
    for (const listener of [...listeners]) listener(change);
  };
  /** The table and its host are out of step: ask for the whole table, which arrives as a change. */
  const resync = (): void => port.postMessage({ type: 'ready' });

  const viewOf = (m: Record<string, any>): TableView => {
    // A host that leaves the uri out keeps the one it gave before.
    if (typeof m.docUri === 'string') docUri = m.docUri;
    return {
      docUri,
      rows: Array.isArray(m.rows) ? m.rows : [],
      columns: Array.isArray(m.columns) ? m.columns : [],
      columnLabels: isRecord(m.columnLabels) ? m.columnLabels : {},
      columnGroups: isRecord(m.columnGroups) ? m.columnGroups : {},
      editable: !!m.editable,
      ...(typeof m.notice === 'string' ? { notice: m.notice } : {}),
      ...(isRecord(m.warnings) ? { warnings: m.warnings as WarningBanner } : {}),
    };
  };

  const stop = port.onMessage((m) => {
    if (!isRecord(m)) return;
    switch (m.type) {
      case 'setRows': {
        const view = viewOf(m);
        const open = opens.shift();
        if (open) open.resolve(view);
        else emit({ kind: 'replaceAll', view });
        return;
      }
      case 'error': {
        const message = typeof m.message === 'string' ? m.message : String(m.message);
        const open = opens.shift();
        if (open) open.reject(new Error(message));
        else emit({ kind: 'error', message });
        return;
      }
      case 'updateEntryRows':
        // Rows that are not a list are not "no rows", which would remove the entry.
        if (typeof m.entryRowId !== 'string' || !Array.isArray(m.rows)) return resync();
        return emit({ kind: 'updateEntry', entryRowId: m.entryRowId, rows: m.rows });
      case 'insertEntryRows':
        if (typeof m.sectionRowId !== 'string' || !Array.isArray(m.rows)) return resync();
        return emit({
          kind: 'insertEntry',
          sectionRowId: m.sectionRowId,
          ...(typeof m.beforeRowId === 'string' ? { beforeRowId: m.beforeRowId } : {}),
          rows: m.rows,
        });
      case 'childRows': {
        // Rows that are not a list are no answer at all, not "no children".
        if (typeof m.nodeId !== 'string' || !Array.isArray(m.rows)) return;
        const truncated = typeof m.truncated === 'number' ? m.truncated : 0;
        children.take(m.nodeId)?.resolve({ nodeId: m.nodeId, rows: m.rows, truncated });
        return;
      }
      case 'matrixCells':
        if (typeof m.nodeId !== 'string') return;
        matrices.take(m.nodeId)?.resolve(matrixPage(m.nodeId, m));
        return;
      case 'showProps':
      case 'empty': {
        const asked = inspects.shift();
        if (!asked) return;
        const groups: PropertyGroup[] = m.type === 'showProps' && Array.isArray(m.groups) ? m.groups : [];
        asked.pending.resolve(m.type === 'showProps' && asked.first !== undefined ? { rowId: asked.first, groups } : { groups });
        return;
      }
    }
  });

  return {
    open() {
      return new Promise<TableView>((resolve, reject) => {
        opens.push({ resolve, reject });
        port.postMessage({ type: 'ready' });
      });
    },
    children(rowId) {
      const answer = children.add(rowId);
      port.postMessage({ type: 'requestChildren', nodeId: rowId });
      return answer;
    },
    matrix(nodeId) {
      const answer = matrices.add(nodeId);
      port.postMessage({ type: 'requestMatrix', nodeId });
      return answer;
    },
    inspect(selection) {
      const rowIds = typeof selection === 'string' ? [selection] : [...selection];
      return new Promise<InspectorView>((resolve, reject) => {
        inspects.push({ first: rowIds[0], pending: { resolve, reject } });
        port.postMessage({ type: 'select', rowIds });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose() {
      stop();
      const closed = new Error('This source is closed.');
      for (const open of opens.splice(0)) open.reject(closed);
      for (const asked of inspects.splice(0)) asked.pending.reject(closed);
      children.rejectAll(closed);
      matrices.rejectAll(closed);
      listeners.clear();
    },
  };
}

/**
 * The pages a host sends a property inspector across `port`, in the wire format: each `showProps`
 * and `empty` is a page, and a matrix is asked for with `requestMatrix`. Its first listener says
 * `ready`, which asks the host for what the inspector shows now.
 *
 * For an inspector whose host follows a table elsewhere (another page, another webview); an
 * inspector beside its table follows the table's handle instead.
 */
export function inspectorFeed(port: TablePort): InspectorFeed & { dispose(): void } {
  const listeners = new Set<(view: InspectorView) => void>();
  const matrices = new Waiting<MatrixPage>();
  let ready = false;
  const stop = port.onMessage((m) => {
    if (!isRecord(m)) return;
    if (m.type === 'showProps' || m.type === 'empty') {
      const view: InspectorView = { groups: m.type === 'showProps' && Array.isArray(m.groups) ? m.groups : [] };
      for (const listener of [...listeners]) listener(view);
    } else if (m.type === 'matrixCells' && typeof m.nodeId === 'string') {
      matrices.take(m.nodeId)?.resolve(matrixPage(m.nodeId, m));
    }
  });
  return {
    onPage(listener) {
      listeners.add(listener);
      if (!ready) {
        ready = true;
        port.postMessage({ type: 'ready' });
      }
      return () => void listeners.delete(listener);
    },
    matrix(nodeId) {
      const answer = matrices.add(nodeId);
      port.postMessage({ type: 'requestMatrix', nodeId });
      return answer;
    },
    dispose() {
      stop();
      matrices.rejectAll(new Error('This feed is closed.'));
      listeners.clear();
    },
  };
}
