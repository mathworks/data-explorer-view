// Copyright 2026 The MathWorks, Inc.
//
// The MAT-file engine (src/model/edit/matEngine.ts) as the VS Code extension's integration suites
// drive its MAT-file editor: a table of the document across a channel (serveTable), sent the
// messages its webview sends and recording every message it posts back, and the document's edit
// stack as a real EditStack (`stack`, moved by the table's Undo and Redo) beside the list of edits
// it was handed (`events`). The suites' helpers are here under their names (tableOf, topRow,
// keptUntouched, …), so that a case ported from test-integration/suite/mat*.test.ts reads as it
// does there.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSession, ingest, parseMat } from 'data-explorer-core';
import { createRegisters, type ClipboardMode, type Notice, type Registers } from '../../src/model/index.js';
import {
  EditStack,
  EditStackIndex,
  MatEngine,
  copyEntriesToClipboard,
  dragEntries,
  type CopyDeps,
  type Edit,
  type UsageFill,
} from '../../src/host/index.js';
import { serveTable } from '../../src/serve/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '..', '..', 'test-integration', 'fixtures', 'mat', name)));

/**
 * A dictionary of the extension's suites: `params.sldd` is its test-integration/fixtures/workspace
 * one, and `params_binary.sldd` its test/parity/artifacts/binary one, as of c73da3c.
 */
export const sldd = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(import.meta.dirname, '..', '..', 'test-integration', 'fixtures', 'sldd', name)));

export const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export const nameOf = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');

/** The file's records by variable name (the subsystem, which has none, as `''`). */
export function recordsOf(bytes: Uint8Array): Map<string, { bytes: Uint8Array; compressed: boolean }> {
  const parsed: any = parseMat(buffer(bytes));
  const out = new Map<string, { bytes: Uint8Array; compressed: boolean }>();
  for (const r of parsed.records) out.set(r.name ?? '', { bytes: r.bytes, compressed: !!r.compressed });
  return out;
}

export const same = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);

/**
 * Every record of `before` that is not one of `changed`, the subsystem included, is in `after`
 * as the bytes it was: the save kept what nobody edited.
 */
export function keptUntouched(before: Uint8Array, after: Uint8Array, changed: string[]): void {
  const was = recordsOf(before);
  const now = recordsOf(after);
  for (const [name, rec] of was) {
    if (changed.includes(name)) continue;
    const kept = now.get(name);
    if (!kept) throw new Error(`"${name || '(objects)'}" is not in the saved file`);
    if (!same(kept.bytes, rec.bytes)) throw new Error(`"${name || '(objects)'}" is not the bytes it was read from`);
  }
}

/** The value text core shows for each top-level variable of `bytes`, by name. */
export function valuesOf(bytes: Uint8Array): Map<string, any> {
  const session = createSession();
  const mat: any = session.addMatSource('readback', buffer(bytes), { path: 'readback.mat' });
  return new Map(mat.children.map((c: any) => [c.name, c.toRow()]));
}

/**
 * The rows the table holds now: the last setRows with every updateEntryRows after it spliced in,
 * as the table splices them (rowUpdates.spliceEntryRows).
 */
export function tableOf(posts: any[]): any[] {
  let rows: any[] = [];
  for (const p of posts) {
    if (p.type === 'setRows') rows = p.rows;
    else if (p.type === 'updateEntryRows') {
      const start = rows.findIndex((r) => r.ID === p.entryRowId);
      if (start < 0) continue;
      const subtree = new Set([p.entryRowId]);
      let end = start + 1;
      while (end < rows.length && subtree.has(rows[end].parent)) subtree.add(rows[end++].ID);
      rows = [...rows.slice(0, start), ...p.rows, ...rows.slice(end)];
    }
  }
  return rows;
}

export const topRow = (posts: any[], name: string): any => {
  const row = tableOf(posts).find((r) => r.parent == null && nameOf(r) === name);
  if (!row) throw new Error(`the table has no row for "${name}"`);
  return row;
};

/**
 * Whether `posts` paint the table and then say an error after the last of the paints, which clear
 * the banner it is shown in, so that it is seen.
 */
export const saidAfterPaint = (posts: any[]): boolean => {
  const last = (type: string) => posts.map((p) => p.type).lastIndexOf(type);
  const error = last('error');
  const paint = Math.max(last('setRows'), last('updateEntryRows'));
  return paint >= 0 && error > paint;
};

/** Wait until `ready()` holds, a task at a time. */
export async function waitFor(what: string, ready: () => boolean, tasks = 200): Promise<void> {
  for (let i = 0; i < tasks; i++) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** One table of a document: what it posted, and how to send it a message. */
export interface View {
  /** The table's source, which the channel serves. */
  source: ReturnType<MatEngine['view']>;
  posts: any[];
  send(message: Record<string, unknown>): void;
  close(): void;
}

/** A table of `engine` across a channel, the way the extension's fakePanel is one of its editor. */
export function viewOf(engine: MatEngine): View {
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

/** An open document: the engine, its first table, the edits VS Code would hold, and what it said. */
export interface Opened {
  engine: MatEngine;
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
  /** Save as the extension's save does: the bytes, the Status column moved, the save point moved. */
  save(): Uint8Array;
  /** The bytes the last save wrote: the file on disk. */
  disk(): Uint8Array;
}

/**
 * `name` (or `bytes` under it), opened in an engine of its own session, its first table painted.
 * `registers` is the window's, shared by every document a case opens; `fromBackup` opens the
 * bytes as a restored backup (dirty until saved); `uri`, with no name given, is the document's
 * address, which the engine names it from; `changed` is told whenever the document's tree changed
 * (the extension's provider's `onChanged`).
 */
export async function open(
  name: string,
  bytes: Uint8Array = fixture(name),
  opts: {
    as?: string;
    registers?: Registers;
    session?: ReturnType<typeof createSession>;
    fromBackup?: boolean;
    usage?: UsageFill;
    uri?: string;
    changed?: () => void;
  } = {},
): Promise<Opened> {
  const session = opts.session ?? createSession();
  const as = opts.as ?? name;
  const events: Edit[] = [];
  const stack = new EditStack();
  const notices: Notice[] = [];
  const index = new EditStackIndex(!!opts.fromBackup);
  let onDisk = bytes;
  const engine = new MatEngine({
    session,
    ...(opts.uri ? { uri: opts.uri } : { uri: `file:///work/${as}`, name: as }),
    bytes: buffer(bytes),
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
    appName: 'VS Code',
    ...(opts.usage ? { usage: opts.usage } : {}),
    ...(opts.changed ? { changed: opts.changed } : {}),
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

/** Send a value edit or a rename of the top-level variable `name`, as the table sends one. */
export function edit(o: { view: View }, name: string, columnId: string, newValue: string): void {
  const row = topRow(o.view.posts, name);
  o.view.send({ type: 'edit', rowId: row.ID, columnId, oldValue: '', newValue });
}

/** The records of `bytes` by name, as core's reader frames them. */
function recordBytes(bytes: Uint8Array, name: string): Uint8Array {
  const parsed: any = parseMat(buffer(bytes));
  const record = parsed.records.find((r: any) => r.name === name);
  if (!record) throw new Error(`the fixture has no record "${name}"`);
  return record.bytes as Uint8Array;
}

/** pv_basic.mat's 128-byte header, saying it has no subsystem: the head of a file of plain variables. */
function plainHeader(): Uint8Array {
  const header = fixture('pv_basic.mat').slice(0, 128);
  for (let i = 116; i < 124; i++) header[i] = 0x20;
  return header;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

/** A MAT-file with no variable at all: the header alone, which core reads as an editable, empty file. */
export const emptyMat = (): Uint8Array => plainHeader();

/**
 * A MAT-file holding `x` twice (pv_basic's own record of it, written twice) with `str` between:
 * the malformed file MATLAB never writes and core keeps both of, as read.
 */
export function twiceNamedMat(): Uint8Array {
  const pv = fixture('pv_basic.mat');
  return concat(plainHeader(), recordBytes(pv, 'x'), recordBytes(pv, 'str'), recordBytes(pv, 'x'));
}

export const errorsIn = (posts: any[]): string[] => posts.filter((m) => m.type === 'error').map((m) => String(m.message));

/** The cells every row of `node`'s subtree shows, by its id under `node` ('.' for its own). */
export function shownCells(node: any): Record<string, Record<string, string>> {
  const skip = new Set(['ID', 'parent', 'Status', 'lastModified', 'lastModifiedBy', 'storageClass']);
  const out: Record<string, Record<string, string>> = {};
  for (const n of node.flatten()) {
    const row = n.toRow();
    const cells: Record<string, string> = {};
    for (const [key, cell] of Object.entries(row)) {
      if (skip.has(key) || key.startsWith('_')) continue;
      cells[key] = cell && typeof cell === 'object' ? String((cell as any).text ?? (cell as any).label ?? '') : String(cell ?? '');
    }
    out[String(n.id).slice(String(node.id).length) || '.'] = cells;
  }
  return out;
}

/** The tree core reads from `bytes`, a MAT-file, for as long as `read` runs. */
export function readMat<T>(bytes: Uint8Array, read: (mat: any) => T): T {
  const session = createSession();
  const mat: any = session.addMatSource('readback', buffer(bytes), { path: 'readback.mat' });
  return read(mat);
}

/** The names of the variables `o`'s tree holds, in order, and its variable of a name. */
export const namesOf = (o: Opened): string[] => (o.session.getDataSource(o.engine.srcId) as any).children.map((v: any) => v.name);
export const variableOf = (o: Opened, name: string): any =>
  (o.session.getDataSource(o.engine.srcId) as any).children.find((v: any) => v.name === name);

/** A dictionary beside a case's MAT-files: what its table puts on the registers, and what it gave up. */
export interface Dictionary {
  uri: string;
  /** Its entries' names, as its tree holds them now. */
  names(): string[];
  /** Its entry `name`, as core read it. */
  entry(name: string): any;
  /** Copy or cut these entries, as its table does: false, and `said` says why, where nothing was. */
  copy(names: string[], mode?: ClipboardMode): boolean;
  /** Start a drag of these entries, as its table does. */
  drag(names: string[]): void;
  /** What it said of a copy or a drag that did not happen. */
  said: string[];
  /** The names a move out of it asked it to take out, in order. */
  deleted: string[];
}

/**
 * The dictionary `file` (sldd), open under `as` on `registers` the way the extension's dictionary
 * editors are: its entries copied, cut and dragged with view's copy over core's read of the file
 * (what a dictionary table runs), and a move out of it taking the entry out of its tree. A session
 * of its own, as the dictionary engines are still the extension's.
 */
export function openDictionary(registers: Registers, file: string, as = 'source.sldd'): Dictionary {
  const session = createSession();
  const tree: any = ingest(session, sldd(file), { filename: as });
  const uri = `file:///work/${as}`;
  const entries = (): any[] => (tree.children ?? []).flatMap((section: any) => section.children ?? []);
  const entry = (name: string): any => {
    const found = entries().find((e) => e.name === name);
    if (!found) throw new Error(`${as} has no entry "${name}"`);
    return found;
  };
  const said: string[] = [];
  const deleted: string[] = [];
  const deps = (broadcast: () => void): CopyDeps => ({
    session,
    registers,
    refresh: () => {},
    findNode: (id) => session.findNodeById(id),
    post: (m) => void said.push(m.message),
    broadcast,
  });
  registers.registerSourceDeleter(uri, (targets) => {
    for (const t of targets) {
      const found = entries().find((e) => e.name === t.name);
      if (found && session.deleteNodesById([found.id])) deleted.push(t.name);
    }
    return { removed: true };
  });
  return {
    uri,
    names: () => entries().map((e) => e.name),
    entry,
    copy: (names, mode = 'copy') =>
      copyEntriesToClipboard(
        names.map((n) => entry(n).id),
        mode,
        uri,
        deps(() => registers.broadcastClipboardState()),
      ),
    drag: (names) =>
      void dragEntries(
        names.map((n) => entry(n).id),
        uri,
        deps(() => registers.broadcastDragState()),
      ),
    said,
    deleted,
  };
}
