// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/clipboardAction.ts at c73da3c.
// Copied from data-explorer-vscode src/host/structuralEdit.ts at c73da3c (its register snapshots:
// owningEntriesOf, CopyRefused, sourceSectionOf, refuseUncopyable, entriesSharingAName,
// entryNameCounts, registerItemsOf, buildDragSnapshot and buildClipboardSnapshot). Its
// cloneForPaste, with entryOps.ts's recordCopy, is core's (v1.53.0), which the MAT-file engine's
// paste clones with. With core's session and the registers passed in rather than read from the
// extension's module-level ones. The extension keeps its own copies until its editors move onto
// view's sources; keep them alike (view's CI reports a vscode commit to any of those files).
//
// The copy/cut half of the clipboard, and the start of a drag, shared by every table source.
// Everything format-specific is injected: `refresh` (bring the model up to date with the live
// content) and `findNode` (resolve a row id against it) are the ONLY real difference between the
// formats here, never what copying a row means.
import { entrySelectorOf, owningEntryOf, type Session } from 'data-explorer-core';
import { dropFactsOf } from '../actions/dropFacts.js';
import { WHOLE_FILE_SECTION } from '../ids/sectionRowId.js';
import type { ClipboardMode } from '../source/wire.js';
import type { ClipboardItem, DragRegisterItem, Registers } from './registers.js';
import { sharedNameRefusal } from './transfer.js';

/** The part of core's session a snapshot asks. */
export type SnapshotSession = Pick<Session, 'copyRefusal' | 'findNodeById' | 'getDataSource'>;

export interface CopyDeps {
  /** Core's session, which the entries are asked of (copyRefusal) and resolved in. */
  session: SnapshotSession;
  /** The registers the copy or the drag lands in. */
  registers: Pick<Registers, 'setClipboard' | 'setDrag' | 'clearDrag'>;
  /**
   * Bring this format's model up to date with its live content. Called ONCE per
   * copy, however many rows it covers: a JSON dictionary re-parses its text here,
   * which is ~190 ms on a real customer dictionary — per row it would be per row.
   */
  refresh: () => void;
  /** Resolve a row id against the refreshed model. */
  findNode: (rowId: string) => any;
  /** Say a failure in the owning table. Only ever used for failures. */
  post: (message: { type: 'error'; message: string }) => void;
  /** Fan the register's new state out to every live table (the registers' broadcast). */
  broadcast: () => void;
  /**
   * The token this document's deleter will tell an entry by when a move takes it out later, for
   * a document whose selectors cannot (a MAT-file's: a name and no uuid). Absent for a
   * dictionary, whose uuid already does.
   */
  originOf?: (entry: any) => object | undefined;
}

/**
 * Each row id's owning ENTRY, deduped, in selection order.
 *
 * Rows are deduped BY OWNING ENTRY because a gesture carries whole entries while a selection is a
 * set of ROWS, and several rows can share one entry: shift-selecting a bus and two elements
 * nested under it is three rows and one entry. Identity, not name: two same-named entries in
 * different sections are genuinely two entries, and both may legitimately be carried at once. A
 * row id that resolves to nothing, or to a node with no owning entry (a section header, a
 * detached node), contributes nothing rather than aborting the gesture.
 */
function owningEntriesOf(rowIds: unknown, findNode: (rowId: string) => any): any[] {
  const entries: any[] = [];
  const seen = new Set<any>();
  for (const rowId of Array.isArray(rowIds) ? rowIds : []) {
    const node = findNode(rowId);
    if (!node) continue;
    const entry = owningEntryOf(node) as any;
    if (!entry || !entry.isEntry || seen.has(entry)) continue;
    seen.add(entry);
    entries.push(entry);
  }
  return entries;
}

/**
 * A copy, a cut or a drag refused before anything reached its register: an entry that cannot
 * travel (core's copyRefusal). The message names the entry and is shown as it is, never behind
 * a "Failed to" prefix: it is a reason, not a failure.
 */
export class CopyRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopyRefused';
  }
}

/**
 * The section an entry is carried from, as its register item spells `sourceSection`: its
 * section's name in a dictionary, and WHOLE_FILE_SECTION for an entry with no section between
 * it and its document — a MAT-file's variable, whose parent is the file's own source node. That
 * node's name is the srcId it was registered under, which no section rule spells, so a copied
 * variable recorded under it would make no same-file move a no-op and dim no row.
 *
 * Told by the session, not by the node's class: a parent the session holds as a source IS the
 * document. A detached entry, or one whose section has no name, is '' as it always was.
 */
export function sourceSectionOf(session: Pick<Session, 'getDataSource'>, entry: any): string {
  const parent = entry?.parent;
  if (!parent) return WHOLE_FILE_SECTION;
  if (typeof parent.name === 'string' && (session as any).getDataSource?.(parent.name) === parent) return WHOLE_FILE_SECTION;
  return parent.name ?? '';
}

/**
 * Refuse, in core's words, the first of `entries` that cannot travel on the clipboard or in a
 * drag (copyRefusal): one with no value to write, one past the writer's budget, a MAT-file
 * variable a copy would read back as another value. Asked by id, so only of an entry the session
 * resolves that id to: a node it does not hold, or one whose id it resolves to another node (two
 * same-named MAT-file variables share one), would be judged as something else. Such an entry is
 * left to its serialize(), which the snapshot makes next and which refuses what cannot be written.
 */
function refuseUncopyable(session: SnapshotSession, entries: readonly any[]): void {
  for (const entry of entries) {
    if (typeof entry?.id !== 'string' || (session as any).findNodeById?.(entry.id) !== entry) continue;
    const why = session.copyRefusal(entry.id);
    if (why) throw new CopyRefused(why);
  }
}

/**
 * Of `entries`, the ones a move could not take out of their document alone.
 *
 * A move deletes its originals by selector (core's entrySelector.ts): the name, with the uuid
 * consulted only to tell same-named entries apart. A selector with no uuid — every MAT-file
 * variable's, whose payload has no metadata, and a dictionary entry added by hand — names
 * whichever entry of that name the delete finds first, and a document can hold two: a
 * dictionary's in two namespaces, a MAT-file's two records of one name. Such an entry can be
 * copied, never moved. Counted once per document, over every entry in it, because that is the
 * delete's scope.
 */
function entriesSharingAName(entries: readonly any[]): Set<any> {
  const shared = new Set<any>();
  const counts = new Map<any, Map<string, number>>();
  for (const entry of entries) {
    if (entrySelectorOf(entry).uuid) continue;
    let root = entry;
    while (root.parent) root = root.parent;
    let names = counts.get(root);
    if (!names) counts.set(root, (names = entryNameCounts(root)));
    if ((names.get(entry.name) ?? 0) > 1) shared.add(entry);
  }
  return shared;
}

// How many entries of the document under `root` answer to each name: its entries are the
// first nodes down each branch that are one (a MAT-file's children, a dictionary's sections'
// children). Nothing below an entry is one.
function entryNameCounts(root: any): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: any) => {
    for (const child of (node?.children ?? []) as any[]) {
      if (child?.isEntry) counts.set(child.name, (counts.get(child.name) ?? 0) + 1);
      else visit(child);
    }
  };
  visit(root);
  return counts;
}

/**
 * Each row's owning entry as a register item: what to paste, the section it came from, the
 * facts a drop target judges it by, whether a move could take its original out alone, and,
 * where its document hands one out (`originOf`), the token its deleter later tells the entry
 * by. The one build behind both registers, after the one refusal they share.
 */
function registerItemsOf(
  session: SnapshotSession,
  rowIds: unknown,
  findNode: (rowId: string) => any,
  originOf?: (entry: any) => object | undefined,
): ClipboardItem[] {
  const entries = owningEntriesOf(rowIds, findNode);
  refuseUncopyable(session, entries);
  const shared = entriesSharingAName(entries);
  return entries.map((entry): ClipboardItem => {
    const payload = entry.serialize() as Record<string, unknown>;
    const item: ClipboardItem = { payload, sourceSection: sourceSectionOf(session, entry), ...dropFactsOf(entry, payload) };
    const origin = originOf?.(entry);
    if (origin) item.origin = origin;
    if (shared.has(entry)) item.sharedName = true;
    return item;
  });
}

/**
 * Snapshot the rows a drag started on into the drag-register shape: the same walk, dedupe and
 * refusal as a copy, so "if you can cut/copy you can drag". Each item keeps its OWN source
 * section: a multi-row drag can span sections, and whether a move is a no-op depends on every
 * item's section.
 */
export function buildDragSnapshot(
  session: SnapshotSession,
  rowIds: unknown,
  findNode: (rowId: string) => any,
  originOf?: (entry: any) => object | undefined,
): { items: DragRegisterItem[] } {
  return { items: registerItemsOf(session, rowIds, findNode, originOf) };
}

/**
 * Snapshot the rows a copy/cut acts on into the clipboard shape: the same walk and the same
 * dedupe as buildDragSnapshot. Each item keeps its OWN source section: a cut is lazy, so the
 * source deletion at paste time must find each entry where it actually lives.
 */
export function buildClipboardSnapshot(
  session: SnapshotSession,
  rowIds: unknown,
  findNode: (rowId: string) => any,
  originOf?: (entry: any) => object | undefined,
): ClipboardItem[] {
  return registerItemsOf(session, rowIds, findNode, originOf);
}

/**
 * Snapshot every entry the rows resolve to onto the clipboard in `mode`.
 *
 * Rows are deduped by owning entry, so selecting a bus and two of its elements copies ONE bus.
 * `uriString` is recorded with the payloads because a cut is LAZY — the source delete is deferred
 * to paste time, and the paste may land in a different document, so the clipboard must remember
 * which document to delete from.
 *
 * Returns whether anything reached the clipboard. Callers do not need the result (every failure
 * has already been said in the table); it exists so the outcome is assertable.
 */
export function copyEntriesToClipboard(
  rowIds: readonly string[],
  mode: ClipboardMode,
  uriString: string,
  deps: CopyDeps,
): boolean {
  try {
    deps.refresh();
    // Two passes over the same refreshed model (both are index lookups). Separating
    // "no row resolved" from "rows resolved but no entry behind them" is what keeps
    // the two failures distinguishable to the user: the first is a stale table, the
    // second is a row that has no entry to copy, like a section header.
    if (!rowIds.some((id) => !!deps.findNode(id))) {
      deps.post({
        type: 'error',
        message: `Could not ${mode} the selected item${rowIds.length === 1 ? '' : 's'}.`,
      });
      return false;
    }
    const items = buildClipboardSnapshot(deps.session, rowIds, deps.findNode, deps.originOf);
    if (!items.length) {
      deps.post({ type: 'error', message: 'Could not locate the owning entry in the model.' });
      return false;
    }
    // A cut is a move whose delete comes later, by name: refused now, before it marks anything,
    // for an entry that name does not tell apart in its document (transfer.ts refuses a
    // move-mode drop of one the same way). A copy of it is a copy.
    const shared = mode === 'cut' ? items.find((it) => it.sharedName) : undefined;
    if (shared) {
      deps.post({ type: 'error', message: sharedNameRefusal('cut', String(shared.payload.name ?? ''), uriString) });
      return false;
    }
    deps.registers.setClipboard(items, mode, uriString);
    // Broadcast so every open table (not just this one) enables Paste and
    // repaints — the cut/copied source rows show their affordance.
    deps.broadcast();
    return true;
  } catch (err) {
    // Reached when the model refresh itself fails (a JSON dictionary whose text no longer parses).
    // A refusal (an entry that cannot travel) is a reason, and is said as core says it.
    deps.post({ type: 'error', message: err instanceof CopyRefused ? err.message : `Failed to ${mode}: ${(err as Error).message}` });
    return false;
  }
}

/**
 * Snapshot every entry the dragged rows resolve to into the drag register, and tell every open
 * table, so each can predict the drop on dragover. A refused or failed start leaves no drag behind
 * and says why. Returns whether anything is being dragged, for the tests.
 */
export function dragEntries(rowIds: readonly string[], uriString: string, deps: CopyDeps): boolean {
  try {
    deps.refresh();
    const snap = buildDragSnapshot(deps.session, rowIds, deps.findNode, deps.originOf);
    if (snap.items.length === 0) deps.registers.clearDrag();
    else deps.registers.setDrag(uriString, snap.items);
    deps.broadcast();
    return snap.items.length > 0;
  } catch (err) {
    deps.registers.clearDrag();
    deps.broadcast();
    deps.post({ type: 'error', message: err instanceof CopyRefused ? err.message : `Failed to drag: ${(err as Error).message}` });
    return false;
  }
}
