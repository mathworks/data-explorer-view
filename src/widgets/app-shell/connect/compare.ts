// Copyright 2026 The MathWorks, Inc.
//
// One compare tab: two open files' differences, entry by entry, line by line, in a
// <dex-compare-view> in the tab's panel, kept up to date as either file changes.
//
// Each side is read through its own tab (readDiffSide over the rows its table shows now, the
// entries' inspector pages too), the two compared (diffSides), and laid out as the view's two
// tables' lines (compareRows). The compare reads what the user sees: a file's tab holds the
// document, its edits and its children fetched, and the compare is drawn from that, never from the
// disk. A change to either (an edit, a paste, a reload, a save, which moves the caption's ●) draws
// it again, once the burst of changes is over; the tab's own view keeps its expansion and its
// selection across a redraw, where the lines are still there.
//
// The inspector, while the tab is active, shows the selected line's differences (comparePage).
// Next and Previous Change go from difference to difference by entry: a whole entry only one file
// has is one difference, however many rows are under it (a struct's fields, an array's elements),
// while the rows that differ inside an entry both files have are each one.
//
// A line's menu copies its entry to the other side (Copy to Right, Copy to Left): through that
// file's own tab, as a drag of the entries from the side that has them let go on the section they
// go in, so it is one edit of that file, undone there by one Undo, and drawn here from the file's
// own change. An entry that file has already is replaced (the handle's dropReplacing), keeping its
// name; one it lacks is copied in. A side that may not be edited takes no copy, and its menu offers
// none. Show in <file> goes to the line's row in that file's tab.

import { compareRows, type CompareLine, type CompareRows, type CompareSideRows } from '../../../model/compare/compareRows.js';
import { buildSectionRowId } from '../../../model/ids/sectionRowId.js';
import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import { shortcutOf } from './fileMenu.js';
import { comparePage } from '../../../model/compare/comparePage.js';
import { diffSides, diffSummary, type DocumentDiff } from '../../../model/compare/diff.js';
import { readDiffSide, type DiffSide } from '../../../model/compare/readSide.js';
import type { InspectorFeed, InspectorView } from '../../../model/source/tableSource.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { CompareSide, DexCompareView } from '../dex-compare-view.js';
import type { OpenTab } from './documents.js';

/** What a compare tab is connected with. */
export interface CompareWiring {
  /** The table style setting's, now. */
  tableStyle(): DexTreeTable['tableStyle'];
  /** Where the compare tables keep their column choices: `${shell key}:compare`. */
  storageKey: string;
  /** What a tooltip says of a path: ShellHost.pathTitle's, or the path. */
  titleOf(path: string): string;
  /** The selection changed: the history and everything that follows the active tab. */
  selected(lineIds: readonly string[]): void;
  /** Say something: a toast and its line in the Log. */
  say(level: 'info' | 'warning' | 'error', text: string, ms?: number): void;
  /** The shared context menu, for a line's menu. */
  menu: DexContextMenu;
  /** Show `tab` with `rowId` selected: the line's Show in <file>. */
  showIn(tab: OpenTab, rowId: string): void;
}

/** A compare tab's connection: its two files' tabs, its view, and what it answers. */
export interface CompareConnection {
  readonly left: OpenTab;
  readonly right: OpenTab;
  readonly view: DexCompareView;
  /** What the inspector shows while the tab is active: the selected line's page (comparePage). */
  readonly feed: InspectorFeed;
  /** Its two tables, which the table style setting rules too. */
  readonly tables: readonly DexTreeTable[];
  /** The lines as last drawn. */
  readonly rows: CompareRows | undefined;
  /** Whether there is a change to go to. */
  readonly hasChanges: boolean;
  /** Whether it compares `tab`. */
  involves(tab: OpenTab): boolean;
  /** Select the changed line after (1) or before (-1) the selection's first, wrapping round, in both tables. */
  step(by: 1 | -1): void;
  /** Select these lines (the history's place). */
  select(lineIds: readonly string[]): void;
  /** Read both sides again and draw them; one at a time, a change heard during one making one more after it. */
  refresh(): Promise<void>;
  /**
   * Copy the entries of these lines into `to`'s file from the other's (Copy to Right: `to` 'right'),
   * each line standing for its entry, lines the source lacks left out: per section, the source's
   * entries dragged (`doc.table.dragStart`), dropped on the target's section through its tab's handle
   * (`dropReplacing` with the target's rows of the entries it has, else `drop(…, 'copy')`), the drag
   * ended; one undo step per section in the target. Said as a toast. Nothing into a side that may not be edited.
   */
  copy(lineIds: readonly string[], to: 'left' | 'right'): Promise<void>;
  dispose(): void;
}

/** How long after a change to either file the compare is drawn again: the rest of a burst is in by then. */
const REDRAW_MS = 50;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The lines Next and Previous Change go to, in line order: each line that differs, but those under
 * a row that only one file has (an added or removed entry's fields and elements), which are that
 * row's difference and not one each.
 */
function stopsOf(rows: CompareRows): CompareLine[] {
  const insideOneSided = (line: CompareLine): boolean => {
    for (let id = line.parent; id !== null; ) {
      const up = rows.byId.get(id);
      if (!up) return false;
      if (up.row && (up.row.status === 'added' || up.row.status === 'removed')) return true;
      id = up.parent;
    }
    return false;
  };
  return rows.lines.filter((line) => line.differs && !insideOneSided(line));
}

/** Draw `left` against `right` in `tab`'s panel (a `<dex-compare-view>` put in it), and keep it drawn as either changes. */
export function connectCompare(tab: OpenTab, left: OpenTab, right: OpenTab, wiring: CompareWiring): CompareConnection {
  const view = document.createElement('dex-compare-view');
  view.storageKey = wiring.storageKey;
  view.tableStyle = wiring.tableStyle();
  tab.panel.append(view);

  let disposed = false;
  const stops: (() => void)[] = [];
  let diff: DocumentDiff | undefined;
  // A side read without its entries' pages (past the page limit): said in the header.
  let pagesSkipped = false;
  let rows: CompareRows | undefined;
  // The first drawing opens what holds a difference; later ones keep what the user opened.
  let opened = false;

  // The inspector's feed: the selected line's page, sent to each listener now and as it changes.
  const names = { left: left.name, right: right.name };
  let page: InspectorView = { groups: [] };
  const listeners = new Set<(view: InspectorView) => void>();
  const feed: InspectorFeed = {
    onPage(listener) {
      listeners.add(listener);
      listener(page);
      return () => void listeners.delete(listener);
    },
    // A compare's page shows texts only: no value of it is drawn as a grid.
    matrix: async (nodeId) => ({ nodeId, message: 'A comparison shows no value as a grid.' }),
  };
  const sendPage = (): void => {
    const line = rows?.byId.get(view.selectedIds[0] ?? '');
    page = comparePage(line, names, diff?.columnLabels ?? {});
    for (const listener of [...listeners]) listener(page);
  };

  /** One side as the view draws it: its file's caption, its lines, its table's columns of those compared. */
  const sideOf = (t: OpenTab, lines: CompareSideRows, compared: readonly string[]): CompareSide => {
    const shown = t.handle?.view;
    return {
      name: t.name,
      title: wiring.titleOf(t.path),
      editable: !!t.doc?.editable && !!shown?.editable,
      dirty: !!t.dirty,
      rows: lines.rows,
      marks: lines.marks,
      columns: ['Name', ...compared.filter((c) => shown?.columns.includes(c))],
      columnLabels: shown?.columnLabels ?? {},
      columnGroups: shown?.columnGroups ?? {},
    };
  };

  // The lines of the last diff laid out again: after a read, and when "Show only differences" is
  // toggled (which reads nothing).
  function layOut(): void {
    if (!diff || disposed) return;
    rows = compareRows(diff, { onlyDifferences: view.onlyDifferences });
    view.left = sideOf(left, rows.left, diff.columns);
    view.right = sideOf(right, rows.right, diff.columns);
    view.summary = diffSummary(diff.counts) + (pagesSkipped ? '; entry properties not compared: over 5,000 entries' : '');
    view.hasChanges = rows.changes.length > 0;
    view.empty = rows.lines.length === 0 ? 'No differences' : '';
    if (!opened) {
      view.expandedIds = rows.opened;
      opened = true;
    }
    // The selection, where its lines are still drawn.
    const selected = view.selectedIds;
    const kept = selected.filter((id) => rows!.byId.has(id));
    if (kept.length !== selected.length) {
      view.select(kept);
      wiring.selected(kept);
    }
    sendPage();
  }

  /** A side read as its tab shows it now: the table's rows, its entries' pages. */
  const read = (t: OpenTab): Promise<DiffSide> => {
    const source = t.doc?.table;
    const shown = t.handle?.view;
    if (!source || !shown || !t.table) return Promise.reject(new Error(`${t.name} is no longer open`));
    return readDiffSide(source, { shown: { view: shown, rows: t.table.rows }, properties: true });
  };

  async function readBoth(): Promise<void> {
    try {
      const [a, b] = await Promise.all([read(left), read(right)]);
      if (disposed) return;
      diff = diffSides(a, b, { properties: true });
      pagesSkipped = !!a.pagesSkipped || !!b.pagesSkipped;
      layOut();
    } catch (err) {
      if (disposed) return;
      // What could not be read is said in place of the tables, and as a toast.
      diff = undefined;
      rows = undefined;
      view.left = null;
      view.right = null;
      view.summary = '';
      view.hasChanges = false;
      view.empty = message(err);
      sendPage();
      wiring.say('error', `Could not compare ${left.name} with ${right.name}: ${message(err)}`);
    }
  }

  // One read at a time: a change heard while one runs makes one more after it, which the callers
  // of the first wait for too.
  let running: Promise<void> | null = null;
  let again = false;
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await readBoth();
      } while (again && !disposed);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  // A change to either file's rows (an edit, a paste, a reload) or its saved state: drawn again
  // once, a moment after the first of a burst.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (): void => {
    if (disposed || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, REDRAW_MS);
  };
  for (const t of [left, right]) {
    const doc = t.doc;
    if (!doc) continue;
    stops.push(
      doc.table.subscribe((change) => {
        if (change.kind === 'replaceAll' || change.kind === 'updateEntry' || change.kind === 'insertEntry') soon();
      }),
      doc.onDirty(() => soon()),
    );
  }

  function select(lineIds: readonly string[]): void {
    view.select(lineIds);
    sendPage();
    wiring.selected(lineIds);
  }

  function step(by: 1 | -1): void {
    if (!rows) return;
    const targets = stopsOf(rows);
    if (targets.length === 0) return;
    const place = new Map(rows.lines.map((line, i) => [line.id, i]));
    const first = view.selectedIds[0];
    const at = first === undefined ? -1 : (place.get(first) ?? -1);
    const next =
      by === 1
        ? (targets.find((line) => place.get(line.id)! > at) ?? targets[0]!)
        : ((at < 0 ? undefined : [...targets].reverse().find((line) => place.get(line.id)! < at)) ?? targets[targets.length - 1]!);
    select([next.id]);
  }

  /** Whether `t` may take a copy: its document is edited in the page, and its table may edit it. */
  const editable = (t: OpenTab): boolean => !!t.doc?.editable && !!t.handle?.view?.editable;

  async function copy(lineIds: readonly string[], to: 'left' | 'right'): Promise<void> {
    if (!rows || disposed) return;
    const into = to === 'right' ? right : left;
    const from = to === 'right' ? left : right;
    if (!editable(into) || !into.handle) return;
    const sourceOf = (line: CompareLine) => (to === 'right' ? line.row?.a : line.row?.b);
    const targetOf = (line: CompareLine) => (to === 'right' ? line.row?.b : line.row?.a);
    // Each line stands for its entry (an engine copies whole entries), each once, in line order,
    // those the source has; grouped by section, each section one drop.
    const wanted = new Set(lineIds.map((id) => rows!.byId.get(id)?.entry).filter((id): id is string => !!id));
    const bySection = new Map<string, CompareLine[]>();
    for (const line of rows.lines) {
      if (!wanted.has(line.id) || !sourceOf(line)) continue;
      const list = bySection.get(line.section);
      if (list) list.push(line);
      else bySection.set(line.section, [line]);
    }
    const lends = from.doc?.table;
    if (bySection.size > 0 && !lends?.dragStart) return wiring.say('error', `Could not copy from ${from.name}: it lends no entries.`);
    for (const [section, lines] of bySection) {
      const target = section === '' ? '' : buildSectionRowId(section);
      const replacing = lines.flatMap((line) => {
        const row = targetOf(line);
        return row ? [row.ID] : [];
      });
      let dropped: { dropped: boolean; reason?: string };
      // The drag register tells the target's table of the drag as it is taken (synchronously), so
      // its handle judges the drop as it would one of its own rows.
      lends!.dragStart!(lines.map((line) => sourceOf(line)!.ID));
      try {
        dropped = replacing.length > 0 ? await into.handle.dropReplacing(target, replacing) : await into.handle.drop(target, 'copy');
      } finally {
        lends!.dragEnd?.();
      }
      const n = lines.length;
      if (dropped.dropped) wiring.say('info', `Copied ${n} ${n === 1 ? 'entry' : 'entries'} to ${into.name}`, 2000);
      else wiring.say('warning', `Could not copy to ${into.name}: ${dropped.reason ?? 'it refused the entries.'}`);
    }
  }

  // A line's menu: Copy to Right and Copy to Left where that side takes a copy, enabled for a
  // selected line the other side has and that differs, in it or under it; Next and Previous Change;
  // Show in each file that has the first selected line's row. Acted on by its next choice only, as
  // every user of the shared menu is.
  let menuFor: readonly string[] | null = null;
  function lineMenu(lineIds: readonly string[], x: number, y: number, keyboard: boolean): void {
    if (!rows) return;
    const lines = lineIds.map((id) => rows!.byId.get(id)).filter((line): line is CompareLine => !!line?.row);
    const copyable = (has: 'a' | 'b') => lines.some((line) => !!line.row![has] && (line.differs || line.differsBelow));
    const copies: ContextMenuItem[] = [
      ...(editable(right) ? [{ id: 'copy-right', label: 'Copy to Right', icon: 'arrowNavigationEastUI', disabled: !copyable('a') }] : []),
      ...(editable(left) ? [{ id: 'copy-left', label: 'Copy to Left', icon: 'arrowNavigationWestUI', disabled: !copyable('b') }] : []),
    ];
    const first = lines[0]?.row;
    const shows: ContextMenuItem[] = [
      ...(first?.a ? [{ id: 'show-left', label: `Show in ${left.name}` }] : []),
      ...(first?.b ? [{ id: 'show-right', label: `Show in ${right.name}` }] : []),
    ];
    const hasChanges = rows.changes.length > 0;
    const items: ContextMenuItem[] = [
      ...copies,
      ...(copies.length > 0 ? [{ id: '', label: '', separator: true }] : []),
      { id: 'next-change', label: 'Next Change', icon: 'arrowNavigationSouthUI', disabled: !hasChanges, ...shortcutOf('next-change') },
      { id: 'previous-change', label: 'Previous Change', icon: 'arrowNavigationNorthUI', disabled: !hasChanges, ...shortcutOf('previous-change') },
      ...(shows.length > 0 ? [{ id: '', label: '', separator: true }, ...shows] : []),
    ];
    wiring.menu.show(x, y, items, { focusFirst: keyboard });
    // After show(): a menu it replaced said it closed, which ends the menu before this one.
    menuFor = [...lineIds];
  }
  const onMenuAction = (e: CustomEvent<{ actionId: string }>): void => {
    const lineIds = menuFor;
    menuFor = null;
    if (!lineIds || disposed) return;
    const first = rows?.byId.get(lineIds[0] ?? '')?.row;
    switch (e.detail.actionId) {
      case 'copy-right':
      case 'copy-left':
        return void copy(lineIds, e.detail.actionId === 'copy-right' ? 'right' : 'left');
      case 'next-change':
      case 'previous-change':
        return step(e.detail.actionId === 'next-change' ? 1 : -1);
      case 'show-left':
        if (first?.a) wiring.showIn(left, first.a.ID);
        return;
      case 'show-right':
        if (first?.b) wiring.showIn(right, first.b.ID);
        return;
    }
  };
  const onMenuClosed = (): void => {
    menuFor = null;
  };
  wiring.menu.addEventListener('dex-action', onMenuAction);
  wiring.menu.addEventListener('dex-menu-closed', onMenuClosed);
  stops.push(() => {
    wiring.menu.removeEventListener('dex-action', onMenuAction);
    wiring.menu.removeEventListener('dex-menu-closed', onMenuClosed);
  });

  const listen = <K extends keyof HTMLElementEventMap>(type: K, listener: (e: HTMLElementEventMap[K]) => void): void => {
    view.addEventListener(type, listener);
    stops.push(() => view.removeEventListener(type, listener));
  };
  listen('dex-compare-filter-changed', () => layOut());
  listen('dex-compare-selected', (e) => {
    sendPage();
    wiring.selected(e.detail.lineIds);
  });
  listen('dex-compare-step', (e) => step(e.detail.by));
  listen('dex-compare-menu', (e) => lineMenu(e.detail.lineIds, e.detail.x, e.detail.y, !!e.detail.keyboard));

  return {
    left,
    right,
    view,
    feed,
    get tables() {
      return [...(view.shadowRoot?.querySelectorAll<DexTreeTable>('dex-tree-table') ?? [])];
    },
    get rows() {
      return rows;
    },
    get hasChanges() {
      return !!rows && rows.changes.length > 0;
    },
    involves: (t) => t === left || t === right,
    step,
    select,
    refresh,
    copy,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const stop of stops.splice(0)) stop();
      listeners.clear();
      view.remove();
    },
  };
}
