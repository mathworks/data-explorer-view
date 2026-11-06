// Copyright 2026 The MathWorks, Inc.
//
// The documents' panes as connectShell draws them: each tab's panel in its pane's slot of the
// documents' area, shown while it is the tab its pane shows; a row of tabs for each pane (the first
// pane's made with the shell, the second's made as a second pane comes and taken away as it goes,
// so a page with one pane has one row); and the divider's place, kept with the layout. Which tabs
// are in which pane is TabList's (tabs.ts); what a request about them means is connectShell's.

import { initialSplit, keepSplitOver } from '../../../model/shell/shellLayout.js';
import type { KeyValueStore } from '../../../model/shell/settings.js';
import type { DexDocTabs, DocTab } from '../dex-doc-tabs.js';
import { SECOND_PANE, type DexShellDocs } from './dex-shell-docs.js';
import type { OpenTab } from './documents.js';
import type { TabList } from './tabs.js';

/** The group of the panes' rows: rows of one group take each other's tabs, so a tab moves to the other pane by a drop on its row. */
export const PANE_ROWS = 'panes';

/**
 * Put each tab's panel in its pane's slot of the documents' area, and show only the tab each pane
 * shows, while documents are shown (`shown`: not at Root, and some tab open); every other panel is
 * hidden, and so is every panel at Root, where the graph fills the area.
 */
export function slotPanels(tabs: TabList<OpenTab>, shown: boolean): void {
  tabs.panes.forEach((pane, i) => {
    for (const tab of pane.items) {
      tab.panel.hidden = !shown || tab !== pane.shown;
      if (i === 0) tab.panel.removeAttribute('slot');
      else if (tab.panel.slot !== SECOND_PANE.panels) tab.panel.slot = SECOND_PANE.panels;
    }
  });
}

/** The rows of tabs of the panes, left to right, in the documents' area. */
export class PaneRows {
  private readonly list: DexDocTabs[];

  /** Rows for `docs`, whose first pane's row is `first` (in its `tabs` slot already). */
  constructor(
    private readonly docs: DexShellDocs,
    first: DexDocTabs,
  ) {
    first.group = PANE_ROWS;
    this.list = [first];
  }

  /** The rows, left to right: the first pane's, and the second's while there is a second pane. */
  get rows(): readonly DexDocTabs[] {
    return this.list;
  }

  /** The pane of the row `target` (its index in `rows`), or -1 for anything else. */
  paneOf(target: EventTarget | null): number {
    return this.list.indexOf(target as DexDocTabs);
  }

  /**
   * Draw the panes' rows as `tabs` holds them, each tab as `drawn` says, a row made or taken away
   * for the panes there are. Hidden while no document is shown (`shown` false: Root, or nothing
   * open), when no tab is marked active either. The row of the pane not focused is dimmed. A row
   * taken away with the keyboard on it gives it to the focused pane's active tab.
   */
  paint(tabs: TabList<OpenTab>, shown: boolean, drawn: (tab: OpenTab) => DocTab): void {
    const panes = tabs.panes;
    while (this.list.length < panes.length) {
      const row = document.createElement('dex-doc-tabs');
      row.slot = SECOND_PANE.tabs;
      row.group = PANE_ROWS;
      this.docs.append(row);
      this.list.push(row);
    }
    let lostFocus = false;
    while (this.list.length > panes.length) {
      const row = this.list.pop()!;
      lostFocus ||= !!row.shadowRoot?.activeElement;
      row.remove();
    }
    this.list.forEach((row, i) => {
      const pane = panes[i]!;
      row.tabs = pane.items.map(drawn);
      row.active = shown ? (pane.shown?.id ?? '') : '';
      row.unfocused = panes.length > 1 && i !== tabs.focused;
      row.hidden = !shown;
    });
    if (lostFocus && shown) this.list[tabs.focused]?.focusActive();
  }

  /** Whether the keyboard is on a row: one about to be hidden, at Root, must give it somewhere. */
  holdsFocus(): boolean {
    return this.list.some((row) => !!row.shadowRoot?.activeElement);
  }

  /** Take the keyboard off the row that has it. */
  blur(): void {
    for (const row of this.list) (row.shadowRoot?.activeElement as HTMLElement | null)?.blur();
  }
}

/** The documents' split kept with the layout under `key` in `store` (none, or none readable: the half). */
export function keptSplit(store: KeyValueStore | null, key: string): number {
  try {
    return initialSplit(key ? (store?.getItem(key) ?? null) : null);
  } catch {
    return initialSplit(null);
  }
}

/**
 * Keep the documents' split `ratio` with the layout under `key` in `store`, the sides kept there
 * as they were. A page with no storage, or none left, keeps it for this page alone.
 */
export function keepSplit(store: KeyValueStore | null, key: string, ratio: number): void {
  if (!store || !key) return;
  try {
    store.setItem(key, keepSplitOver(ratio, store.getItem(key)));
  } catch {
    // No storage left: the divider holds where it is for this page.
  }
}
