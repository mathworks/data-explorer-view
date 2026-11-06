// Copyright 2026 The MathWorks, Inc.
//
// The open tabs and which one is active. DOM-free (TabList); ShellTab names the widgets a tab holds.
//
// Lifted from data-explorer-app src/renderer/ui/tabList.ts at 0983920. Two additions the shell's
// parts need: `move`, for a tab the row's drag put elsewhere (dex-tab-move), and `deactivate`, for
// the Explorer's Root, which shows no document while files are open.

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
  table?: DexTreeTable;
  doc?: Doc;
  handle?: TableHandle;
  page?: DexProjectPage;
  /** Its document holds edits its file does not. */
  dirty?: boolean;
  /** A preview tab, which the next file opened by a click in the folder, a search or a link replaces. */
  preview?: boolean;
}

/** The open tabs, in order, and which one is active. DOM-free. */
export class TabList<T> {
  private list: T[] = [];
  private current = -1;

  get items(): readonly T[] {
    return this.list;
  }

  get active(): T | undefined {
    return this.list[this.current];
  }

  get activeIndex(): number {
    return this.current;
  }

  find(pred: (item: T) => boolean): T | undefined {
    return this.list.find(pred);
  }

  /** Add at the end and make it active. */
  add(item: T): void {
    this.list.push(item);
    this.current = this.list.length - 1;
  }

  activate(item: T): boolean {
    const i = this.list.indexOf(item);
    if (i < 0 || i === this.current) return false;
    this.current = i;
    return true;
  }

  /** Make none active (the Explorer's Root), keeping every tab; whether one was. */
  deactivate(): boolean {
    if (this.current < 0) return false;
    this.current = -1;
    return true;
  }

  /** Remove; the tab to its right becomes active, or the new last one. */
  remove(item: T): boolean {
    const i = this.list.indexOf(item);
    if (i < 0) return false;
    this.list.splice(i, 1);
    if (this.list.length === 0) this.current = -1;
    else if (i < this.current || this.current >= this.list.length) this.current--;
    return true;
  }

  /**
   * Move `item` so that it is at `index` once moved: taken out, then put in at `index`, as
   * `dex-tab-move` means it (clamped to the row). The active tab stays the active tab. Whether
   * anything moved.
   */
  move(item: T, index: number): boolean {
    const from = this.list.indexOf(item);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.list.length - 1, Math.floor(index)));
    if (to === from) return false;
    const active = this.active;
    this.list.splice(from, 1);
    this.list.splice(to, 0, item);
    if (active !== undefined) this.current = this.list.indexOf(active);
    return true;
  }

  /** Move the active tab by `step`, wrapping around; from none active, forward to the first and back to the last. */
  cycle(step: number): void {
    const n = this.list.length;
    if (n === 0) return;
    if (this.current < 0) this.current = step > 0 ? 0 : n - 1;
    else this.current = (((this.current + step) % n) + n) % n;
  }
}
