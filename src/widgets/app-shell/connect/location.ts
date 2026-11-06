// Copyright 2026 The MathWorks, Inc.
//
// Where the user is, as the location bar draws it, and where Up goes from there. A place is a tab
// and a row in it (`rowId` null for the file itself), or Root (`tabId` null): the Explorer's top,
// where no document is shown. The path is Root, then the file, then the selected row's parents
// from the top down to the row ("Root › params.sldd › Design Data › Kp"), each segment the place
// a press on it goes to. Up is one step back along that path: the row's parent, then the file,
// then Root. At Root, a file selected in the relationship graph follows it, dimmed: a place only
// looked at, which the shell opens when it is pressed.
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
}

/** The active tab, as the bar names its file. */
export interface LocationTab {
  id: string;
  name: string;
  path: string;
}

const ROOT_ICON = 'simulink_folder';

/**
 * The bar's segments for `rowId` in `tab` (or the file, for null; or Root, for no tab), and the
 * place Up goes to (null at Root, which has nothing above it). `preview`, at Root: the file
 * selected in the graph, a dimmed segment after Root whose place is Root still (the shell opens
 * its file when it is pressed).
 */
export function locationOf(
  tab: LocationTab | null,
  rowId: string | null,
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
    title: tab.path,
    place: { tabId: tab.id, rowId: null },
  };
  // The row and its parents, from the row up; a parent that is not there, or one already passed
  // (rows that name each other), ends the climb.
  const chain: TreeTableRow[] = [];
  const seen = new Set<string>();
  for (let row = rowId === null ? undefined : rowOf(rowId); row && !seen.has(row.ID); row = row.parent === null ? undefined : rowOf(row.parent)) {
    seen.add(row.ID);
    chain.push(row);
  }
  const rows: LocationStep[] = chain.reverse().map((row) => ({
    label: row.Name.label,
    ...(row.Name.iconId ? { icon: row.Name.iconId } : {}),
    place: { tabId: tab.id, rowId: row.ID },
  }));
  // Up from the file itself is Root; from a row the place above it, which is the file for a
  // top-level row, and the file too for a row that cannot be found, as if none were selected:
  // nothing is shown of it to be above.
  const at = chain[chain.length - 1];
  if (rowId === null) return { segments: [root, file], up: root.place };
  return { segments: [root, file, ...rows], up: { tabId: tab.id, rowId: at?.parent ?? null } };
}
