// Copyright 2026 The MathWorks, Inc.
//
// Where the user is, as the location bar draws it, and where Up goes from there. A place is a tab
// and a row in it (`rowId` null for the file itself), or Root (`tabId` null): the Explorer's top,
// where no document is shown. The path is Root, then the file, then the selected row's parents
// from the top down to the row ("Root › params.sldd › Design Data › Kp"), each segment the place
// a press on it goes to. Up is one step back along that path: the row's parent, then the file,
// then Root. A selection of several rows ends the path at the parents they all share, then says
// how many there are ("Root › params.sldd › Design Data › <3 selected>"): no one row is where the
// user is, and Up goes to that shared parent. At Root, a file selected in the relationship graph
// follows it, dimmed: a place only looked at, which the shell opens when it is pressed.
//
// Pure: the rows are looked up through a function (connectShell's reads the active tab's rows),
// and a row it cannot find ends the path where it is, so a row the table has not been sent yet
// is no broken bar.

import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { LocationSegment } from '../dex-location-bar.js';
import { FILE_ICONS, fileGroupOf } from './explorerFiles.js';

/** A place the user can be: a tab and a row in it, the tab's file (no row), or Root (no tab). */
export interface ShellPlace {
  tabId: string | null;
  rowId: string | null;
}

/** Whether two places are the same place: what the shell's NavHistory compares them by. */
export function samePlace(a: ShellPlace, b: ShellPlace): boolean {
  return a.tabId === b.tabId && a.rowId === b.rowId;
}

/** A segment of the bar, and the place it stands for. */
export interface LocationStep extends LocationSegment {
  place: ShellPlace;
  /**
   * The rows of a selection of several, on the one segment that counts them ("<3 selected>"): where
   * the user is, which a press on the segment leaves selected. Its `place` is the first of them, as
   * the shell's history knows the selection. Absent on every other segment.
   */
  selection?: readonly string[];
}

/** The active tab, as the bar names its file. */
export interface LocationTab {
  id: string;
  name: string;
  path: string;
  /** The file segment's tooltip: its path, as the host says it (ShellHost.pathTitle). Default the path. */
  title?: string;
}

const ROOT_ICON = 'simulink_folder';
const SEVERAL_ICON = 'wsMultiple';

/**
 * The bar's segments for `selection` in `tab` (a row, or the rows of a selection, the first the one
 * the shell's history knows; null or none for the file itself; no tab for Root), and the place Up
 * goes to (null at Root, which has nothing above it). `preview`, at Root: the file selected in the
 * graph, a dimmed segment after Root whose place is Root still (the shell opens its file when it is
 * pressed).
 */
export function locationOf(
  tab: LocationTab | null,
  selection: string | null | readonly string[],
  rowOf: (rowId: string) => TreeTableRow | undefined,
  rootLabel = 'Root',
  preview?: LocationSegment,
): { segments: LocationStep[]; up: ShellPlace | null } {
  const root: LocationStep = { label: rootLabel, icon: ROOT_ICON, place: { tabId: null, rowId: null } };
  if (!tab) return { segments: preview ? [root, { ...preview, preview: true, place: root.place }] : [root], up: null };
  const group = fileGroupOf(tab.path);
  const file: LocationStep = {
    label: tab.name,
    ...(group === 'other' ? {} : { icon: FILE_ICONS[group] }),
    title: tab.title ?? tab.path,
    place: { tabId: tab.id, rowId: null },
  };
  const rowIds = selection === null ? [] : typeof selection === 'string' ? [selection] : selection;
  // The rows on the way down to a row, from the top, as segments; the row itself last unless
  // `withRow` is off. A parent that is not there, or one already passed (rows that name each other),
  // ends the climb.
  const chainTo = (rowId: string, withRow: boolean): TreeTableRow[] => {
    const chain: TreeTableRow[] = [];
    const seen = new Set<string>();
    for (let row = rowOf(rowId); row && !seen.has(row.ID); row = row.parent === null ? undefined : rowOf(row.parent)) {
      seen.add(row.ID);
      chain.push(row);
    }
    if (!withRow) chain.splice(0, 1);
    return chain.reverse();
  };
  const step = (row: TreeTableRow): LocationStep => ({
    label: row.Name.label,
    ...(row.Name.iconId ? { icon: row.Name.iconId } : {}),
    place: { tabId: tab.id, rowId: row.ID },
  });
  // Up from the file itself is Root.
  const first = rowIds[0];
  if (first === undefined) return { segments: [root, file], up: root.place };
  if (rowIds.length > 1) {
    // The parents every row is under, from the top: the longest start their chains share. A row the
    // table has not got (one not yet sent) is under none that can be drawn, so they share none.
    let shared = chainTo(first, false);
    for (const rowId of rowIds.slice(1)) {
      const chain = rowOf(rowId) ? chainTo(rowId, false) : [];
      let n = 0;
      while (n < shared.length && n < chain.length && shared[n]!.ID === chain[n]!.ID) n++;
      shared = shared.slice(0, n);
    }
    const several: LocationStep = {
      label: `<${rowIds.length} selected>`,
      // Heard as words: the brackets read aloud as "less than" and "greater than".
      ariaLabel: `${rowIds.length} rows selected`,
      icon: SEVERAL_ICON,
      place: { tabId: tab.id, rowId: first },
      selection: [...rowIds],
    };
    return { segments: [root, file, ...shared.map(step), several], up: { tabId: tab.id, rowId: shared.at(-1)?.ID ?? null } };
  }
  // Up from a row is the place above it, which is the file for a top-level row, and the file too for
  // a row that cannot be found, as if none were selected: nothing is shown of it to be above.
  const chain = chainTo(first, true);
  return { segments: [root, file, ...chain.map(step)], up: { tabId: tab.id, rowId: chain.at(-1)?.parent ?? null } };
}
