// Copyright 2026 The MathWorks, Inc.
//
// What the shell makes of a MATLAB its host reaches (ShellHost.matlab): what the status bar says
// of it; what a tab's row, or its file, is to MATLAB (a MatlabTarget: a model's block, an entry of
// a dictionary, a model's workspace or a MAT-file, a value to evaluate); which of MATLAB's commands
// it is offered, and under what label; what each command sends and what it says when it is done;
// and an evaluation's answer, kept for the row it was asked of and shown in Properties under
// "MATLAB". The host's link does the talking (the Electron app's, to the MATLAB package it ships);
// the shell asks only what the user chose, and never sends anything unasked. Pure: no DOM, no
// widget; connectShell wires what this answers into the menus, the palette and the inspector.
//
// MATLAB reads and writes the files as they are saved, not as a tab holds them: Send to Workspace
// and Get from Workspace wait, disabled with the reason, while the tab holds unsaved edits. After
// a Get, the host's watcher tells the shell the file changed, and its clean tab reloads.

import { modelNameOf } from 'data-explorer-core';
import { isSectionRowId, sectionNameFromRowId } from '../../../model/ids/sectionRowId.js';
import type { PropertyGroup } from '../../../model/inspector/piBuilder.js';
import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { InspectorFeed, InspectorView } from '../../../model/source/tableSource.js';
import type { ContextMenuItem } from '../../context-menu/dex-context-menu.js';
import type { PaletteCommand } from '../modules/dex-command-palette.js';
import type { MatlabEvaluation, MatlabStatus, ShellCommand, ShellMatlab } from './types.js';

/** The MATLAB commands a row or a file can take (every `matlab-*` ShellCommand but Connect). */
export type MatlabAction = 'matlab-open' | 'matlab-update-diagram' | 'matlab-evaluate' | 'matlab-to-workspace' | 'matlab-from-workspace' | 'matlab-data-explorer';

/** The six, in the order a menu offers them. */
export const MATLAB_ACTIONS: readonly MatlabAction[] = [
  'matlab-open',
  'matlab-update-diagram',
  'matlab-evaluate',
  'matlab-to-workspace',
  'matlab-from-workspace',
  'matlab-data-explorer',
];

/** Whether `id` is one of the six (a menu item's, or a command's). */
export function isMatlabAction(id: string): id is MatlabAction {
  return (MATLAB_ACTIONS as readonly string[]).includes(id);
}

/** Whether `id` is one of a MATLAB's commands, Connect to MATLAB… among them, which a palette row or a native menu may send. */
export function isMatlabCommand(id: string): id is ShellCommand {
  return id === 'matlab-connect' || isMatlabAction(id);
}

/**
 * What the status bar says of `status`, and its tooltip: nothing while off. A MATLAB busy running
 * something answers once it is done: the bar says so, rather than leave a command that waits for it
 * looking like a link that is gone.
 */
export function matlabLabel(status: MatlabStatus | undefined): { label: string; title: string } {
  if (status?.state !== 'connected') return { label: '', title: '' };
  const name = `MATLAB ${status.release}`;
  if (status.busy) return { label: `${name} (busy)`, title: `${name} is running something and answers once it is done` };
  return { label: name, title: `Connected to ${name} (process ${status.pid})` };
}

// --- What a row is to MATLAB --------------------------------------------------------------------

/** What a tab's row (or the tab's file, with no row) is to MATLAB. */
export interface MatlabTarget {
  /** The file, by the path its tab was opened with. */
  file: string;
  /** The file's name (`plant.sldd`), and a model's name (`plant`), for what the shell says. */
  fileName: string;
  modelName?: string;
  kind: 'model' | 'dictionary' | 'mat';
  /** The tab holds unsaved edits: MATLAB reads and writes the saved file, so Send and Get wait for a save. */
  dirty: boolean;
  /** The document's uri and the row's id, where the answer of an evaluation is kept. */
  docUri: string;
  rowId?: string;
  /** A block row's path below the model's root (its `_blockPath`). */
  block?: string;
  /** A top-level entry: a dictionary's or a model workspace's (its section's name), a MAT-file's variable (section ''). */
  entry?: { name: string; section: string };
  /** The row's value as its Value cell shows it, when MATLAB can evaluate it (not empty, not a summary such as `<10x10 double>`). */
  value?: string;
}

/**
 * A row's Value as text MATLAB can evaluate: none when it is empty, a summary MATLAB would not read
 * (`<10x10 double>`), or a link to another file or entry (a model's data source), which names it and
 * is no value.
 */
function valueOf(row: TreeTableRow): string | undefined {
  const cell = row.Value;
  if (typeof cell === 'object' && cell?.linkTarget) return undefined;
  const text = (typeof cell === 'string' ? cell : (cell?.text ?? '')).trim();
  return text === '' || /^<.*>$/.test(text) ? undefined : text;
}

/**
 * The section a top-level entry is in, as MATLAB names it: the label of its section's row (`Design
 * Data`, `Model Workspace`), not the row id's short name (`section:design`); a MAT-file's variable
 * is in none (''). Undefined for a row that is no top-level entry (a field of one).
 */
function sectionOfEntry(row: TreeTableRow, rows: readonly TreeTableRow[], kind: MatlabTarget['kind']): string | undefined {
  if (kind === 'mat') return row.parent === null ? '' : undefined;
  if (row.parent === null || !isSectionRowId(row.parent)) return undefined;
  return rows.find((r) => r.ID === row.parent)?.Name.label ?? sectionNameFromRowId(row.parent) ?? undefined;
}

/** `tab`'s row `rowId` (null: the file) as MATLAB takes it; undefined for a tab of no model, dictionary or MAT-file (a project), or none read yet. */
export function matlabTargetOf(
  tab: { path: string; name: string; dirty?: boolean; doc?: { kind: string; uri: string } },
  rows: readonly TreeTableRow[],
  rowId: string | null,
): MatlabTarget | undefined {
  const kind = tab.doc?.kind;
  if (kind !== 'model' && kind !== 'dictionary' && kind !== 'mat') return undefined;
  const file: MatlabTarget = {
    file: tab.path,
    fileName: tab.name,
    ...(kind === 'model' ? { modelName: modelNameOf(tab.name) ?? tab.name } : {}),
    kind,
    dirty: !!tab.dirty,
    docUri: tab.doc!.uri,
  };
  const row = rowId === null ? undefined : rows.find((r) => r.ID === rowId);
  // A row gone from the table since it was selected: the file, as with none.
  if (!row) return file;
  // A section's row is neither an entry nor a value; a block's is its block alone.
  if (isSectionRowId(row.ID)) return { ...file, rowId: row.ID };
  if (typeof row._blockPath === 'string') return { ...file, rowId: row.ID, block: row._blockPath };
  const section = sectionOfEntry(row, rows, kind);
  const value = valueOf(row);
  return {
    ...file,
    rowId: row.ID,
    ...(section !== undefined ? { entry: { name: row.Name.label, section } } : {}),
    ...(value !== undefined ? { value } : {}),
  };
}

// --- What MATLAB offers it ------------------------------------------------------------------------

/** One command offered: its label, and why it waits, when it does. */
export interface MatlabOffer {
  id: MatlabAction;
  label: string;
  icon?: string;
  disabled?: boolean;
  reason?: string;
}

const LABELS: Record<MatlabAction, string> = {
  'matlab-open': 'Open in Simulink',
  'matlab-update-diagram': 'Update Diagram',
  'matlab-evaluate': 'Evaluate in MATLAB',
  'matlab-to-workspace': 'Send to Workspace',
  'matlab-from-workspace': 'Get from Workspace',
  'matlab-data-explorer': "Open in MATLAB's Data Explorer",
};

const ICONS: Partial<Record<MatlabAction, string>> = {
  'matlab-open': 'simulink',
  'matlab-update-diagram': 'simulink',
  'matlab-to-workspace': 'matlabWorkspaceFile',
  'matlab-from-workspace': 'matlabWorkspaceFile',
};

// What waits for a save, and why: MATLAB moves the value between the saved file and its workspace.
const WAITS: Partial<Record<MatlabAction, string>> = {
  'matlab-to-workspace': 'Save the file first: MATLAB reads the saved file.',
  'matlab-from-workspace': 'Save the file first: MATLAB writes the saved file.',
};

/**
 * The dictionary sections MATLAB moves an entry between the file and its workspace in: the ones the
 * MATLAB package takes by name. An entry of another (Architectural Data) is not offered Send and Get.
 */
const DICTIONARY_SECTIONS: readonly string[] = ['Design Data', 'Other Data', 'Embedded Coder', 'Configurations'];

/** The label of `id` while `status` holds: a MATLAB with no Data Explorer opens a file in Model Explorer. */
function labelOf(id: MatlabAction, status: MatlabStatus | undefined): string {
  if (id === 'matlab-data-explorer' && status?.state === 'connected' && !status.dataExplorer) return 'Open in Model Explorer';
  return LABELS[id];
}

/** Whether `target` takes `id` from a MATLAB with what `status` says it has. */
function takes(id: MatlabAction, target: MatlabTarget, status: Extract<MatlabStatus, { state: 'connected' }>): boolean {
  const { kind, entry } = target;
  const { simulink, dataExplorer } = status;
  const dictionaryEntry = kind === 'dictionary' && simulink && !!entry && DICTIONARY_SECTIONS.includes(entry.section);
  switch (id) {
    case 'matlab-open':
    case 'matlab-update-diagram':
      return kind === 'model' && simulink;
    case 'matlab-evaluate':
      return target.value !== undefined;
    case 'matlab-to-workspace':
      return !!entry && (kind === 'mat' || dictionaryEntry || (kind === 'model' && simulink && entry.section === 'Model Workspace'));
    case 'matlab-from-workspace':
      return !!entry && (kind === 'mat' || dictionaryEntry);
    case 'matlab-data-explorer':
      return kind === 'mat' ? dataExplorer : simulink;
  }
}

/** What MATLAB offers `target` while `status` holds: nothing unless connected. */
export function matlabOffers(status: MatlabStatus | undefined, target: MatlabTarget | undefined): MatlabOffer[] {
  if (status?.state !== 'connected' || !target) return [];
  return MATLAB_ACTIONS.filter((id) => takes(id, target, status)).map((id) => {
    const icon = ICONS[id];
    const reason = target.dirty ? WAITS[id] : undefined;
    return { id, label: labelOf(id, status), ...(icon ? { icon } : {}), ...(reason ? { disabled: true, reason } : {}) };
  });
}

/** The offers as a menu's items after a separator; none for no offer. */
export function matlabMenuItems(offers: readonly MatlabOffer[]): ContextMenuItem[] {
  if (offers.length === 0) return [];
  return [{ id: '', label: '', separator: true }, ...offers.map((offer): ContextMenuItem => ({ ...offer }))];
}

/** The palette's MATLAB group: Connect to MATLAB… (where the host has a MATLAB), then the offers. */
export function matlabPaletteCommands(hasMatlab: boolean, offers: readonly MatlabOffer[]): PaletteCommand[] {
  return [
    ...(hasMatlab ? [{ id: 'matlab-connect', label: 'Connect to MATLAB…', category: 'MATLAB' }] : []),
    ...offers.map(({ id, label, disabled }) => ({ id, label, category: 'MATLAB', ...(disabled ? { disabled } : {}) })),
  ];
}

// --- What each command sends, and says -------------------------------------------------------------

/** What a MATLAB command is carried out with. */
export interface MatlabRunContext {
  matlab: ShellMatlab;
  /** A toast and its Log line (connectShell's `say`). */
  say(level: 'info' | 'warning' | 'error', text: string, ms?: number): void;
  /** A Log line only. */
  log(level: 'info' | 'warning' | 'error', text: string): void;
  /** Keep Evaluate's answer for the target's row, for Properties. */
  evaluated(target: MatlabTarget, answer: MatlabEvaluation): void;
  /** Bring Properties forward (the `show-properties` command). */
  showProperties(): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `n` of `what`, in words: `1 warning`, `2 warnings`. */
const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;

/** Where an evaluation of `target`'s value runs: the entry's dictionary section, the dictionary, the model's workspace, or (a MAT-file's) the base workspace. */
function contextOf(target: MatlabTarget): { model?: string; dictionary?: string; section?: string } | undefined {
  if (target.kind === 'model') return { model: target.file };
  if (target.kind === 'dictionary') return target.entry ? { dictionary: target.file, section: target.entry.section } : { dictionary: target.file };
  return undefined;
}

/** Carry out `id` on `target`; never rejects (a failure is said). */
export async function runMatlab(id: MatlabAction, target: MatlabTarget, on: MatlabRunContext): Promise<void> {
  const label = labelOf(id, on.matlab.status());
  const model = target.modelName ?? target.fileName;
  // A short note of what was done; the toast goes by itself.
  const done = (text: string): void => on.say('info', text, 2000);
  const notHere = (): void => on.say('info', `${label} is not available here`);
  try {
    switch (id) {
      case 'matlab-open': {
        await on.matlab.open({ model: target.file, ...(target.block ? { block: target.block } : {}) });
        return done(`Opened ${model} in Simulink${target.block ? ` at ${target.block}` : ''}`);
      }
      case 'matlab-update-diagram': {
        const update = await on.matlab.updateDiagram(target.file);
        // Each diagnostic in the Log, which keeps what the toast lets go by.
        for (const error of update.errors) on.log('error', `${model}: ${error.message}`);
        for (const warning of update.warnings) on.log('warning', `${model}: ${warning.message}`);
        if (!update.ok) return on.say('error', `${model} could not be updated: ${count(update.errors.length, 'error')}`);
        if (update.warnings.length > 0) return on.say('warning', `Updated ${model}: ${count(update.warnings.length, 'warning')}`);
        return on.say('info', `Updated ${model}: no errors or warnings`);
      }
      case 'matlab-evaluate': {
        if (target.value === undefined) return notHere();
        const context = contextOf(target);
        const answer = await on.matlab.evaluate({ expression: target.value, ...(context ? { context } : {}) });
        // The answer is Properties' to show, an expression's own error with it: nothing is said.
        on.evaluated(target, answer);
        return on.showProperties();
      }
      case 'matlab-to-workspace':
      case 'matlab-from-workspace': {
        const entry = target.entry;
        if (!entry) return notHere();
        const ref = { file: target.file, ...(entry.section ? { section: entry.section } : {}), entry: entry.name, name: entry.name };
        if (id === 'matlab-to-workspace') {
          await on.matlab.toWorkspace(ref);
          return done(`Sent ${entry.name} to the MATLAB workspace`);
        }
        await on.matlab.fromWorkspace(ref);
        return done(`Wrote ${entry.name} from the MATLAB workspace into ${target.fileName}`);
      }
      case 'matlab-data-explorer': {
        const entry = target.entry?.name;
        const opened = await on.matlab.openInDataExplorer({ path: target.file, ...(entry ? { entry } : {}) });
        const where = opened.app === 'dataExplorer' ? "MATLAB's Data Explorer" : 'Model Explorer';
        const missed = entry && !opened.selected ? `; ${entry} could not be selected there` : '';
        return done(`Opened ${target.fileName} in ${where}${missed}`);
      }
    }
  } catch (err) {
    on.say('error', `${label} failed: ${message(err)}`);
  }
}

// --- The answer in Properties -------------------------------------------------------------------

/** Evaluate's answers, by document, row and the expression asked. */
export class MatlabResults {
  private readonly answers = new Map<string, { expression: string; answer: MatlabEvaluation }>();
  private readonly listeners = new Set<() => void>();

  set(docUri: string, rowId: string, expression: string, answer: MatlabEvaluation): void {
    this.answers.set(MatlabResults.key(docUri, rowId), { expression, answer });
    this.tell();
  }

  /** The answer for the row while its value is still `expression`. */
  get(docUri: string, rowId: string, expression: string): MatlabEvaluation | undefined {
    const kept = this.answers.get(MatlabResults.key(docUri, rowId));
    return kept?.expression === expression ? kept.answer : undefined;
  }

  clear(): void {
    this.answers.clear();
    this.tell();
  }

  /** Hear each set and clear; returns the unsubscribe. */
  on(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener();
  }

  // A row's id is unique in its document; a newline is in neither a uri nor an id.
  private static key(docUri: string, rowId: string): string {
    return `${docUri}\n${rowId}`;
  }
}

/** The most of a display Properties shows: a matrix's display runs to MATLAB's own cut, 20000 characters. */
const SHOWN = 2000;

/** Properties' "MATLAB" group for an answer. */
export function matlabGroup(answer: MatlabEvaluation): PropertyGroup {
  if ('error' in answer) return { title: 'MATLAB', properties: [{ name: 'In MATLAB', value: `Error: ${answer.error.message}` }] };
  const { text, truncated, size } = answer.value;
  const long = text.length > SHOWN;
  const shown = `${long ? text.slice(0, SHOWN) : text}${long || truncated ? '…' : ''}`;
  return {
    title: 'MATLAB',
    properties: [
      { name: 'In MATLAB', value: shown },
      { name: 'Class', value: answer.value.class },
      { name: 'Size', value: size.join('×') },
    ],
  };
}

/**
 * `feed` with the MATLAB group after the page's own, for a row `answerFor` has an answer for. The
 * last page is sent again when `changed` tells that an answer came or went. matrix and edit pass through.
 */
export function withMatlabResults(
  feed: InspectorFeed,
  answerFor: (rowId: string) => MatlabEvaluation | undefined,
  changed: (listener: () => void) => () => void,
): InspectorFeed {
  const withAnswer = (view: InspectorView): InspectorView => {
    const answer = view.rowId === undefined ? undefined : answerFor(view.rowId);
    return answer ? { ...view, groups: [...view.groups, matlabGroup(answer)] } : view;
  };
  const edit = feed.edit;
  return {
    onPage(listener) {
      let last: InspectorView | undefined;
      const offPage = feed.onPage((view) => {
        last = view;
        listener(withAnswer(view));
      });
      const offChanged = changed(() => {
        if (last) listener(withAnswer(last));
      });
      return () => {
        offPage();
        offChanged();
      };
    },
    matrix: (nodeId) => feed.matrix(nodeId),
    ...(edit ? { edit: (change: Parameters<typeof edit>[0]) => edit.call(feed, change) } : {}),
  };
}
