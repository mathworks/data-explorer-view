// Copyright 2026 The MathWorks, Inc.
//
// The open tabs, the panes they are in, and which one is active. DOM-free (TabList); ShellTab
// names the widgets a tab holds.
//
// Lifted from data-explorer-app src/renderer/ui/tabList.ts at 0983920. The additions the shell's
// parts need: `move`, for a tab the row's drag put elsewhere (dex-tab-move); `deactivate`, for the
// Explorer's Root, which shows no document while files are open; and the panes. The documents'
// area splits in two, side by side, as VS Code's editor groups do: each pane has its own row of
// tabs and shows one of them, and one pane is focused, the one the user is in, whose shown tab is
// the active tab that everything else follows (the toolbar, the location bar, the inspector, a
// save). A file is open in one tab only, in whichever pane; a new tab goes into the focused pane;
// and a pane whose last tab closes or moves out goes, the other taking the whole area.
//
// Two panes at most, as the prototype had: a third would leave each too narrow for a table.

import type { Doc } from '../../../model/source/workspace.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { TableHandle } from '../../tree-table/connectTable.js';
import type { DexProjectPage } from '../../project-page/dex-project-page.js';

/** One open file: its tab, its panel, and what the panel shows it with. */
export interface ShellTab {
  /** What the tab row, the Explorer and the history name the tab by. Unique for the session. */
  readonly id: string;
  /** The file's path, as it was opened. */
  path: string;
  /** The tab's label: the file's name, or a project's by its folder. */
  name: string;
  /** The panel in the documents' area the tab shows. */
  panel: HTMLElement;
  /** The table its file is shown in, once there is one: a project has none, and a file that could not be read one with the reason. */
  table?: DexTreeTable;
  /** Its document in the shell's workspace, once its file is read. */
  doc?: Doc;
  /** Its table, connected to the document's source. */
  handle?: TableHandle;
  /** A project's page, in place of a table. */
  page?: DexProjectPage;
  /** Its document holds edits its file does not. */
  dirty?: boolean;
  /** A preview tab, which the next file opened by a click in the folder, a search or a link replaces. */
  preview?: boolean;
}

/** One pane, as `TabList.panes` lists it: its tabs, in the order of its row, and the one it shows. */
export interface TabPane<T> {
  /** Its tabs, in the order of its row. */
  readonly items: readonly T[];
  /** The tab it shows: at Root too, the one it shows again once the documents are. None only in a pane with no tabs. */
  readonly shown: T | undefined;
}

/** The side of the pane there is that `split` puts a tab on, in a pane of its own. */
export type PaneSide = 'left' | 'right';

/** The most panes the documents' area is split into. */
export const MAX_PANES = 2;

/** A pane as the list keeps it: its tabs, and where the one it shows is in them (-1 for none). */
interface PaneState<T> {
  list: T[];
  current: number;
}

/**
 * Take `item` out of `pane`: the tab to its right is shown in its place, or the new last one.
 * Where it was in the pane, or -1 for a tab the pane does not hold.
 */
function takeOut<T>(pane: PaneState<T>, item: T): number {
  const i = pane.list.indexOf(item);
  if (i < 0) return -1;
  pane.list.splice(i, 1);
  if (pane.list.length === 0) pane.current = -1;
  else if (i < pane.current || pane.current >= pane.list.length) pane.current--;
  return i;
}

/**
 * The open tabs, the panes they are in, left to right, and which one is active: the tab the
 * focused pane shows, or none at the Explorer's Root. DOM-free.
 */
export class TabList<T> {
  // Left to right. There is always a first pane, which holds no tabs only while none is open.
  private panesNow: PaneState<T>[] = [{ list: [], current: -1 }];
  private focusedNow = 0;
  // The Explorer's Root: no document shown, each pane keeping the tab it shows for when one is.
  private root = false;
  // Every tab, pane by pane: what `items` hands out, made again at each change.
  private all: readonly T[] = [];

  /** Every tab, pane by pane, each pane's in the order of its row. */
  get items(): readonly T[] {
    return this.all;
  }

  /** The active tab: the one the focused pane shows; none with nothing open, or at the Explorer's Root. */
  get active(): T | undefined {
    if (this.root) return undefined;
    const pane = this.panesNow[this.focusedNow]!;
    return pane.list[pane.current];
  }

  /** Where the active tab is in `items`, or -1 for none. */
  get activeIndex(): number {
    const active = this.active;
    return active === undefined ? -1 : this.all.indexOf(active);
  }

  /** The panes, left to right: one, or two once a tab has been split out of the first. */
  get panes(): readonly TabPane<T>[] {
    return this.panesNow.map((p) => ({ items: p.list, shown: p.list[p.current] }));
  }

  /** Which pane is focused, by its index in `panes`. */
  get focused(): number {
    return this.focusedNow;
  }

  /** The first tab `pred` holds for. */
  find(pred: (item: T) => boolean): T | undefined {
    return this.all.find(pred);
  }

  /** The pane `item` is in, by its index in `panes`, or -1 for a tab not in the list. */
  paneOf(item: T): number {
    return this.panesNow.findIndex((p) => p.list.includes(item));
  }

  /** Add at the end of the focused pane and make it active. */
  add(item: T): void {
    const pane = this.panesNow[this.focusedNow]!;
    pane.list.push(item);
    pane.current = pane.list.length - 1;
    this.root = false;
    this.changed();
  }

  /** Make `item` the active tab, its pane focused; whether it was not already (false too for a tab not in the list). */
  activate(item: T): boolean {
    const at = this.paneOf(item);
    if (at < 0) return false;
    const was = this.active;
    this.focusedNow = at;
    this.panesNow[at]!.current = this.panesNow[at]!.list.indexOf(item);
    this.root = false;
    return this.active !== was;
  }

  /** Make none active (the Explorer's Root), keeping every tab, and the one each pane shows; whether one was. */
  deactivate(): boolean {
    if (this.active === undefined) return false;
    this.root = true;
    return true;
  }

  /**
   * Focus the pane at `index`, which then shows the tab it showed (at Root, the documents are
   * shown again). Whether the active tab changed: false for a pane there is not, or one with no tabs.
   */
  focus(index: number): boolean {
    if ((this.panesNow[index]?.list.length ?? 0) === 0) return false;
    const was = this.active;
    this.focusedNow = index;
    this.root = false;
    return this.active !== was;
  }

  /**
   * Remove; the tab to its right is shown in its pane in its place, or the new last one. A pane
   * left with no tabs goes, unless it is the only one, and the other is focused.
   */
  remove(item: T): boolean {
    const at = this.paneOf(item);
    if (at < 0) return false;
    takeOut(this.panesNow[at]!, item);
    this.dropEmpty(at);
    if (this.all.length === 0) this.root = false;
    return true;
  }

  /**
   * Move `item` so that it is at `index` of its pane once moved: taken out, then put in at
   * `index`, as `dex-tab-move` means it (clamped to the row). The active tab stays the active tab.
   * Whether anything moved.
   */
  move(item: T, index: number): boolean {
    const pane = this.panesNow[this.paneOf(item)];
    if (!pane) return false;
    const from = pane.list.indexOf(item);
    const to = Math.max(0, Math.min(pane.list.length - 1, Math.floor(index)));
    if (to === from) return false;
    const shown = pane.list[pane.current];
    pane.list.splice(from, 1);
    pane.list.splice(to, 0, item);
    if (shown !== undefined) pane.current = pane.list.indexOf(shown);
    this.changed();
    return true;
  }

  /**
   * Move `item` into the pane at `pane`, at `index` there (clamped; its end with none), where it is
   * then shown, that pane focused: a tab dropped on the other pane's row or its documents. The
   * pane it left shows the tab to its right in its place, and goes if it is left with none. Into
   * its own pane: moved along the row to `index`, or with none, only shown. Whether anything
   * changed.
   */
  moveTo(item: T, pane: number, index?: number): boolean {
    const from = this.paneOf(item);
    const target = this.panesNow[pane];
    if (from < 0 || !target) return false;
    if (from === pane) return index === undefined ? this.activate(item) : this.move(item, index);
    takeOut(this.panesNow[from]!, item);
    const to = index === undefined ? target.list.length : Math.max(0, Math.min(target.list.length, Math.floor(index)));
    target.list.splice(to, 0, item);
    target.current = to;
    this.dropEmpty(from);
    this.focusedNow = this.panesNow.indexOf(target);
    this.root = false;
    return true;
  }

  /** Whether `split(item, side)` would move it: there is another tab beside it to leave behind, or another pane on that side. */
  splits(item: T, side: PaneSide): boolean {
    const from = this.paneOf(item);
    if (from < 0) return false;
    if (this.panesNow.length >= MAX_PANES) return from !== (side === 'left' ? 0 : this.panesNow.length - 1);
    return this.panesNow[from]!.list.length > 1;
  }

  /**
   * Put `item` in a pane of its own on `side` of the pane there is, where it is shown, that pane
   * focused: a tab dropped on a side of the documents, or Split Right. With two panes already, it
   * goes into the one on that side instead (moveTo). Nothing moves for a tab with no other beside
   * it, which would leave an empty pane behind, nor for one already in the pane on that side.
   * Whether it moved.
   */
  split(item: T, side: PaneSide): boolean {
    if (!this.splits(item, side)) return false;
    if (this.panesNow.length >= MAX_PANES) return this.moveTo(item, side === 'left' ? 0 : this.panesNow.length - 1);
    takeOut(this.panesNow[this.paneOf(item)]!, item);
    const pane: PaneState<T> = { list: [item], current: 0 };
    if (side === 'left') this.panesNow.unshift(pane);
    else this.panesNow.push(pane);
    this.focusedNow = this.panesNow.indexOf(pane);
    this.root = false;
    this.changed();
    return true;
  }

  /**
   * Move the active tab by `step` along the focused pane's row, wrapping around; from none active,
   * forward to the first and back to the last. Whether the active tab changed: with one tab,
   * active, there is nowhere to go.
   */
  cycle(step: number): boolean {
    const pane = this.panesNow[this.focusedNow]!;
    const n = pane.list.length;
    if (n === 0) return false;
    const was = this.active;
    if (was === undefined) pane.current = step > 0 ? 0 : n - 1;
    else pane.current = (((pane.current + step) % n) + n) % n;
    this.root = false;
    return this.active !== was;
  }

  // The pane at `at` goes once it holds no tabs, unless it is the only one; the focus stays on the
  // pane it was on, which is the other one when that pane went.
  private dropEmpty(at: number): void {
    if (this.panesNow[at]!.list.length === 0 && this.panesNow.length > 1) {
      this.panesNow.splice(at, 1);
      if (at < this.focusedNow || this.focusedNow >= this.panesNow.length) this.focusedNow--;
    }
    this.changed();
  }

  private changed(): void {
    this.all = this.panesNow.flatMap((p) => p.list);
  }
}
