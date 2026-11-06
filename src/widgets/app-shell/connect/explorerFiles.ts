// Copyright 2026 The MathWorks, Inc.
//
// The open files as the Explorer lists them, and the kind of file each is: the heading it goes
// under, the icon its row and its tab draw, and the words the status bar says it in. Pure:
// connectShell hands the Explorer these again whenever a tab opens, closes, moves, takes an edit
// or is painted.
//
// A file's sections are the top-level rows of its table's last paint that are sections (a
// dictionary's Design Data and Configurations, a model's Model Workspace): opening one in the
// Explorer selects its row in the table. A MAT-file has none, since its top-level rows are its
// variables; a project, opened on its page, has no table at all.

import { isMatFile, isModelFile, isProjectFile, isSlddFile } from 'data-explorer-core';
import { sectionNameFromRowId } from '../../../model/ids/sectionRowId.js';
import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { ExplorerFile, ExplorerGroup, ExplorerSection } from '../dex-explorer.js';

/** The kinds of file the shell opens: every heading of the Explorer's but Other. */
export type FileKind = Exclude<ExplorerGroup, 'other'>;

/** The icon of each kind of file, on its Explorer row, its tab and its location segment. */
export const FILE_ICONS: Readonly<Record<FileKind, string>> = {
  model: 'simulinkModel_FT',
  sldd: 'simulinkDataDictionary_FT',
  mat: 'matlabWorkspaceFile',
  project: 'simulink_project',
};

/** What the status bar calls each kind of file. */
export const FILE_FORMATS: Readonly<Record<FileKind, string>> = {
  model: 'Simulink model',
  sldd: 'Data dictionary',
  mat: 'MAT-file',
  project: 'Project',
};

/** The heading the file at `path` goes under, by its name: core's kind tests, which a tab's label agrees with. */
export function fileGroupOf(path: string): ExplorerGroup {
  if (isModelFile(path)) return 'model';
  if (isSlddFile(path)) return 'sldd';
  if (isMatFile(path)) return 'mat';
  if (isProjectFile(path)) return 'project';
  return 'other';
}

/** An open tab, as the Explorer lists it. */
export interface ExplorerTab {
  id: string;
  path: string;
  name: string;
  dirty?: boolean;
  /** Its table's last whole paint (TableHandle.view's rows), for its sections; none before the first. */
  rows?: readonly TreeTableRow[];
}

/** The Explorer's files: one per tab, in the order of the tabs (the Explorer sorts them under their headings). */
export function explorerFiles(tabs: readonly ExplorerTab[]): ExplorerFile[] {
  return tabs.map((tab) => {
    const group = fileGroupOf(tab.path);
    const icon = group === 'other' ? undefined : FILE_ICONS[group];
    return {
      id: tab.id,
      label: tab.name,
      title: tab.path,
      group,
      ...(icon ? { icon } : {}),
      dirty: !!tab.dirty,
      sections: group === 'mat' ? [] : sectionsOf(tab.rows ?? []),
    };
  });
}

function sectionsOf(rows: readonly TreeTableRow[]): ExplorerSection[] {
  return rows
    .filter((row) => row.parent === null && sectionNameFromRowId(row.ID) !== null)
    .map((row) => ({ id: row.ID, label: row.Name.label, ...(row.Name.iconId ? { icon: row.Name.iconId } : {}) }));
}
