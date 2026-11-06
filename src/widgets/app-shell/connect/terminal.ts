// Copyright 2026 The MathWorks, Inc.
//
// The Terminal view's wiring: a line run at <dex-command-window>'s prompt is the model's
// interpreter's (runCommand) over the active document, and its answer is shown under it.
//
// The interpreter acts through a CommandTarget, which this builds over the active tab: its table's
// rows, and its source's own commands, so an assignment is the cell edit a double-click and Enter
// send, and what the document accepts, refuses and undoes is the same either way. A source's add
// and delete are queued (they paint, say the selection they leave, and write the file's text after,
// in one task), and an edit sent before that write is done would be lost, so each resolves a task
// after the first change it brings.
//
// Lines run one after another, on one promise chain: the answers come in the order the lines were
// typed, and a line's edit never lands inside the line before's add. An edit the window makes goes
// to the source, not through a cell editor, so commitEdit() has nothing to wait for: the shell's
// Save waits for idle() first.

import { addChoicesOf, runCommand, type CommandTarget } from '../../../model/shell/commands.js';
import { isEditable, type TableSource } from '../../../model/source/tableSource.js';
import type { DexCommandWindow } from '../modules/dex-command-window.js';
import type { OpenTab } from './documents.js';

/** What the window runs its lines over. */
export interface TerminalContext {
  /** The active tab: the document the lines act on. */
  active(): OpenTab | undefined;
  /** Every open tab, for `sources`. */
  tabs(): readonly OpenTab[];
  /** Save `tab`, for `save`: what to say, or a rejection saying why it was not saved. */
  save(tab: OpenTab): Promise<string>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Run `act`, a queued command of `source`'s, and settle a task after the first change it brings
 * (its repaint, its selection, its refusal), by when the write that follows it in the same task is
 * done; or after `wait` ms, for a command that brings none.
 */
export function settleAfter(source: TableSource, act: () => void, wait = 2000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let stop = (): void => {};
    const finish = (): void => {
      if (done) return;
      done = true;
      stop();
      clearTimeout(timer);
      setTimeout(resolve, 0);
    };
    const timer = setTimeout(finish, wait);
    stop = source.subscribe(finish);
    act();
  });
}

/**
 * The CommandTarget of `tab` among `tabs`: the commands a document the page edits takes (edit,
 * add, delete, save) only where it does, as the table offers them only there.
 */
export function commandTarget(tab: OpenTab | undefined, tabs: readonly OpenTab[], save: (tab: OpenTab) => Promise<string>): CommandTarget {
  const doc = tab?.doc;
  const source = doc?.table;
  const view = tab?.handle?.view;
  const target: CommandTarget = {
    docs: () => tabs.filter((t) => t.doc).map((t) => ({ name: t.name, kind: t.doc!.kind, active: t === tab, dirty: !!t.dirty })),
    rows: () => tab?.table?.rows ?? [],
    inspect: (rowId) => (source ? source.inspect(rowId) : Promise.resolve({ groups: [] })),
    classes: () => (view ? addChoicesOf(view) : []),
  };
  if (source?.raw) target.raw = (rowId) => source.raw!(rowId);
  if (tab && doc?.editable && view?.editable && source && isEditable(source)) {
    target.edit = (edit) => source.edit(edit);
    target.addEntry = (entry) => settleAfter(source, () => source.addEntry(entry));
    target.remove = (rowIds) => settleAfter(source, () => source.delete(rowIds));
    target.save = () => save(tab);
  }
  return target;
}

/** Run `window`'s lines over the active tab; idle() settles once every line run so far has. */
export function connectTerminal(window: DexCommandWindow, context: TerminalContext): { idle(): Promise<void>; dispose(): void } {
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;
  const onRun = (e: CustomEvent<{ line: string }>): void => {
    const line = e.detail.line;
    chain = chain
      .then(async () => {
        if (disposed) return;
        // The tab active when the line's turn comes: a line typed after a click on another tab is
        // that tab's.
        const output = await runCommand(line, commandTarget(context.active(), context.tabs(), context.save));
        if (!disposed) window.appendOutput(output);
      })
      .catch((err) => {
        if (!disposed) window.appendOutput({ lines: [{ text: message(err), kind: 'error' }] });
      });
  };
  window.addEventListener('dex-command-run', onRun);
  return {
    idle: () => chain,
    dispose() {
      disposed = true;
      window.removeEventListener('dex-command-run', onRun);
    },
  };
}
