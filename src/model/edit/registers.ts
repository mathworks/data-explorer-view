// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/clipboard.ts at c73da3c.
// Copied from data-explorer-vscode src/host/dragState.ts at c73da3c.
// Copied from data-explorer-vscode src/host/transferRegisters.ts at c73da3c.
// Copied from data-explorer-vscode src/host/editorHub.ts at c73da3c (its source deleters and its
// two broadcasts; the webview registry and the Add gallery's stay the extension's).
// The extension's editors now share one of these per window, and it has deleted its own copies,
// so there is no second copy to keep alike.
//
// The registers every editable document of a window shares: the clipboard, the drag register,
// the deleters a cross-document move asks to take its originals out, and the broadcast that tells
// every table what the two registers hold. The extension keeps each as a module-level singleton;
// here they are one object, `createRegisters()`, so that a page has one per workspace and the
// extension, once its editors are view's sources, one per window.
//
// THE CLIPBOARD holds MANY items because a copy acts on every entry the selection resolves to
// (operands.ts). Each item records its OWN source section: those entries may span sections, and a
// cut is LAZY — the source deletion is deferred to paste time, so each item has to say where it
// must be deleted FROM. One shared section would delete the wrong entry, or none. Each item is a
// structural snapshot of a serialized node ({name, metadata, value}) captured at copy/cut time —
// independent of the live model, so later mutations don't alias it.
//
// THE DRAG REGISTER exists because a drag's dataTransfer does not reliably cross a frame (a
// webview's iframe): on drag start the host snapshots the dragged entries here, and on drop the
// target asks the host to complete the drop, which reads the payloads back from this register.
// Between the two, every table is told a lightweight DESCRIPTOR (source document + per-item
// section/class/kind, NOT the payloads) so each can predict the drop live (dropDecision).
//
// Both stay registers distinct from each other and from a text view's copy: independent stores,
// by design.
//
// vscode-free and DOM-free, so the registers are unit-testable as they are.
import type { DropFacts } from '../actions/dropFacts.js';
import type { ClipboardStatus } from '../source/tableSource.js';
import type { ClipboardMode, DragDescriptor } from '../source/wire.js';
import type { SourceDeleteResult, SourceSelector, TransferContents, TransferRegister } from './transfer.js';

/** One copied/cut entry: what to paste, where it came from, and what it looks like. */
export interface ClipboardItem extends DropFacts {
  payload: Record<string, unknown>;
  sourceSection: string;
  /** Its document's token for the entry as it was taken, for that document's deleter (transfer.ts). */
  origin?: object;
}

/** What the clipboard holds. */
export interface ClipboardEntry {
  items: ClipboardItem[];
  mode: ClipboardMode;
  // The document the entries were cut/copied from. A lazy cut defers the source
  // delete until paste, so it must remember WHICH document to delete from —
  // the paste may land in a different document (a cross-document move).
  sourceDocUri?: string;
}

// One dragged entry: its serialized payload (for the eventual paste), the section
// it was dragged FROM, and the display facts a table needs to render feedback
// without a model.
//
// The section is per item, as on a ClipboardItem, because a multi-row drag can span
// sections. It used to be one value for the whole drag, the last row's, so a drag of
// design and arch rows onto arch was refused as a same-section no-op while the same
// cut and paste worked.
export interface DragRegisterItem extends DropFacts {
  payload: Record<string, unknown>;
  sourceSection: string;
  /** Its document's token for the entry as it was taken, for that document's deleter (transfer.ts). */
  origin?: object;
}

/** What the drag register holds. */
export interface DragEntry {
  sourceDocUri: string;
  items: DragRegisterItem[];
}

/**
 * What a cross-document move asks the source document to remove: a name, or a selector with the
 * origin token its document handed out when the entry was taken, if it did (transfer.ts).
 */
export type DeleteTarget = string | SourceSelector;

/**
 * How one open document removes named entries from ITSELF, in its own format.
 *
 * It answers rather than reports. A deleter runs on behalf of ANOTHER document's paste or drop,
 * so the view it would post to is not the one the user is looking at — it may be a background
 * tab, or a panel already disposed, whose postMessage throws. The transfer that asked
 * (transfer.ts) reports the answer on its own view, which is the one where the gesture happened.
 */
export type SourceDeleter = (targets: DeleteTarget[]) => Promise<SourceDeleteResult> | SourceDeleteResult;

/**
 * A deleter's reason when nothing in its document answers to the names it was given any more:
 * renamed or deleted since the cut. One spelling for every format, because it is one fact.
 */
export const NOT_FOUND_REASON = 'nothing in it answers to that name any more';

/** What the clipboard holds, as a broadcast tells it: a ClipboardStatus that always says where each entry came from. */
export interface ClipboardBroadcast extends ClipboardStatus {
  sourceDocUri: string | undefined;
  items: (DropFacts & { sectionName: string })[];
}

/**
 * Who hears a broadcast: a table's end, told what the clipboard holds (and, for a lazy cut, to
 * repaint the rows its mark moves between) and what drag is in flight.
 */
export interface RegisterListener {
  clipboard?(state: ClipboardBroadcast): void;
  drag?(descriptor: DragDescriptor | null): void;
}

/** The registers a window's editable documents share. Every member is a plain function, so it can be passed on its own. */
export interface Registers {
  /**
   * Replace the clipboard with `items`.
   *
   * An empty list clears it rather than storing an empty register: a copy that resolved
   * no entries would otherwise leave Paste enabled with nothing behind it.
   */
  setClipboard(items: ClipboardItem[], mode: ClipboardMode, sourceDocUri?: string): void;
  getClipboard(): ClipboardEntry | null;
  clearClipboard(): void;
  canPaste(): boolean;
  /**
   * Public state told to every table so it can build its menu synchronously.
   *
   * `items` is the payload-FREE strip, exactly as `dragDescriptor()` strips the drag
   * register: a table needs the drop facts to predict whether a paste may land here
   * (dropDecision), and must never be shipped the entry records.
   *
   * Where the cut came from travels too — the document, and each item's section, in the
   * shape the drag descriptor spells them (`docUri` there, `sectionName` per item) — so the
   * menu can say what the host decides (transfer.ts's isNoopMove): a cut pasted back into the
   * section every item came from, in the document it came from, does nothing, and a Paste
   * offered over it would be a menu item that does nothing when clicked.
   */
  clipboardState(): ClipboardBroadcast;

  setDrag(sourceDocUri: string, items: DragRegisterItem[]): void;
  getDrag(): DragEntry | null;
  clearDrag(): void;
  /** The payload-free descriptor told to every table for live drag feedback. */
  dragDescriptor(): DragDescriptor | null;

  /**
   * The clipboard as a paste reads it — at the moment the paste starts, not when the message
   * arrived, so a second Paste queued behind a cut's paste finds the clipboard that cut left.
   * Clears the clipboard only while it still holds what that read returned. `broadcast` defaults
   * to `broadcastClipboardState`.
   */
  clipboardRegister(broadcast?: () => void): TransferRegister;
  /**
   * The drag register as a drop reads it — captured NOW, when the drop message arrives.
   *
   * A drop is followed at once by its source's `dragEnd`, which clears the register. A source
   * that queues its structural edits (the JSON view does, so two of them cannot interleave around
   * one write) would otherwise run the drop after that and find nothing to drop. `broadcast`
   * defaults to `broadcastDragState`.
   */
  dragRegister(mode: 'copy' | 'move', broadcast?: () => void): TransferRegister;

  /** How the document `uriString` removes entries from itself, for a move out of it. */
  registerSourceDeleter(uriString: string, fn: SourceDeleter): void;
  unregisterSourceDeleter(uriString: string): void;
  /**
   * Complete the source-delete half of a cross-document move, and say whether it happened.
   *
   * During a drag the source view is open (closing it ends the drag), so its deleter is here. A
   * CUT is different: it is lazy, so its source may have been closed between the cut and the
   * paste, and then there is no deleter — and no format-appropriate way to edit the file — so the
   * original stays where it is: an answer the caller reports.
   *
   * A deleter that throws still throws: the caller (transfer.ts) turns that into the same report.
   */
  deleteFromSource(uriString: string, targets: DeleteTarget[]): Promise<SourceDeleteResult>;

  /** Hear every broadcast, until the returned function is called. */
  listen(listener: RegisterListener): () => void;
  /**
   * Tell every listener what the clipboard now holds. Each is reached on its own terms: one that
   * throws — a panel disposed under the loop, a model that will not read — costs that table its
   * update and nobody else theirs.
   */
  broadcastClipboardState(): void;
  /** Tell every listener the drag in flight (or null when it ends), each on its own terms. */
  broadcastDragState(): void;
}

/**
 * Run one listener's half of a broadcast, keeping whatever it throws — now or, for a post that
 * answers a promise, later as a rejection — from reaching the loop that serves every other one.
 * An engine's own listener runs each half of its answer through it too, as editorHub reaches a view.
 */
export function reach(run: () => unknown): void {
  try {
    const result = run() as { then?: unknown } | undefined;
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).catch(() => {});
    }
  } catch {
    /* this listener misses this broadcast; the next one it gets is complete */
  }
}

/** A window's registers, all empty. */
export function createRegisters(): Registers {
  let clipboard: ClipboardEntry | null = null;
  let drag: DragEntry | null = null;
  const sourceDeleters = new Map<string, SourceDeleter>();
  const listeners = new Set<RegisterListener>();

  const getClipboard = (): ClipboardEntry | null => clipboard;
  const clearClipboard = (): void => {
    clipboard = null;
  };
  const getDrag = (): DragEntry | null => drag;
  const clearDrag = (): void => {
    drag = null;
  };

  const clipboardState: Registers['clipboardState'] = () => ({
    canPaste: clipboard !== null,
    mode: clipboard ? clipboard.mode : null,
    sourceDocUri: clipboard?.sourceDocUri,
    items: (clipboard?.items ?? []).map(
      ({ sourceSection, className, arrayClass, kind, isMatlabVariable, isScalarNumeric, sharedName }) => ({
        sectionName: sourceSection,
        className,
        arrayClass,
        kind,
        isMatlabVariable,
        isScalarNumeric,
        ...(sharedName ? { sharedName } : {}),
      }),
    ),
  });

  const dragDescriptor = (): DragDescriptor | null => {
    if (!drag) return null;
    return {
      docUri: drag.sourceDocUri,
      items: drag.items.map((it) => ({
        sectionName: it.sourceSection,
        className: it.className,
        arrayClass: it.arrayClass,
        kind: it.kind,
        isMatlabVariable: it.isMatlabVariable,
        isScalarNumeric: it.isScalarNumeric,
        ...(it.sharedName ? { sharedName: true } : {}),
      })),
    };
  };

  const broadcastClipboardState = (): void => {
    const state = clipboardState();
    for (const listener of [...listeners]) if (listener.clipboard) reach(() => listener.clipboard!(state));
  };
  const broadcastDragState = (): void => {
    const descriptor = dragDescriptor();
    for (const listener of [...listeners]) if (listener.drag) reach(() => listener.drag!(descriptor));
  };

  return {
    setClipboard(items, mode, sourceDocUri) {
      clipboard = items.length ? { items, mode, sourceDocUri } : null;
    },
    getClipboard,
    clearClipboard,
    canPaste: () => clipboard !== null,
    clipboardState,

    setDrag(sourceDocUri, items) {
      drag = { sourceDocUri, items };
    },
    getDrag,
    clearDrag,
    dragDescriptor,

    // Each register remembers the exact object it read and clears only while the register still
    // holds that object. setClipboard and setDrag replace the record rather than mutate it, so
    // identity is the test of "nothing newer was written": a copy made while a paste was awaiting
    // its write, or a drag started while a drop was finishing, is not wiped by the transfer that
    // was already under way.
    clipboardRegister(broadcast = broadcastClipboardState) {
      let held: ClipboardEntry | null = null;
      return {
        kind: 'clipboard',
        read(): TransferContents | null {
          held = getClipboard();
          return held && { items: held.items, sourceDocUri: held.sourceDocUri, move: held.mode === 'cut' };
        },
        clear(): void {
          if (held && getClipboard() === held) clearClipboard();
        },
        broadcast,
      };
    },
    dragRegister(mode, broadcast = broadcastDragState) {
      const held = getDrag();
      return {
        kind: 'drag',
        read(): TransferContents | null {
          return held && { items: held.items, sourceDocUri: held.sourceDocUri, move: mode === 'move' };
        },
        clear(): void {
          if (held && getDrag() === held) clearDrag();
        },
        broadcast,
      };
    },

    registerSourceDeleter(uriString, fn) {
      sourceDeleters.set(uriString, fn);
    },
    unregisterSourceDeleter(uriString) {
      sourceDeleters.delete(uriString);
    },
    async deleteFromSource(uriString, targets) {
      const fn = sourceDeleters.get(uriString);
      if (!fn) return { removed: false, reason: 'its table is no longer open' };
      const result = await fn(targets);
      // Typed as an answer, so nothing should return none — but a deleter that says nothing has
      // not said it removed anything, and the user is the one who would pay for assuming it did.
      return result && typeof result.removed === 'boolean' ? result : { removed: false, reason: 'its editor did not say' };
    },

    listen(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    broadcastClipboardState,
    broadcastDragState,
  };
}
