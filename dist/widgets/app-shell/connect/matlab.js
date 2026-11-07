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
import { isSectionRowId } from '../../../model/ids/sectionRowId.js';
/** The six, in the order a menu offers them. */
export const MATLAB_ACTIONS = [
    'matlab-open',
    'matlab-update-diagram',
    'matlab-evaluate',
    'matlab-to-workspace',
    'matlab-from-workspace',
    'matlab-data-explorer',
];
/** Whether `id` is one of the six (a menu item's, or a command's). */
export function isMatlabAction(id) {
    return MATLAB_ACTIONS.includes(id);
}
/** Whether `id` is one of a MATLAB's commands, Connect to MATLAB… among them, which a palette row or a native menu may send. */
export function isMatlabCommand(id) {
    return id === 'matlab-connect' || isMatlabAction(id);
}
/**
 * What the status bar says of `status`, and its tooltip: nothing while off. A MATLAB busy running
 * something answers once it is done: the bar says so, rather than leave a command that waits for it
 * looking like a link that is gone.
 */
export function matlabLabel(status) {
    if (status?.state !== 'connected')
        return { label: '', title: '' };
    const name = `MATLAB ${status.release}`;
    if (status.busy)
        return { label: `${name} (busy)`, title: `${name} is running something and answers once it is done` };
    return { label: name, title: `Connected to ${name} (process ${status.pid})` };
}
/** Whether a row's Value cell is a link to another file or entry (a model's data source, a reference), which names it. */
const isLink = (row) => typeof row.Value === 'object' && !!row.Value?.linkTarget;
/**
 * A row's Value as text MATLAB can evaluate: none when it is empty, a summary MATLAB would not read
 * (`<10x10 double>`), or a link, which names another file and is no value.
 */
function valueOf(row) {
    if (isLink(row))
        return undefined;
    const cell = row.Value;
    const text = (typeof cell === 'string' ? cell : (cell?.text ?? '')).trim();
    return text === '' || /^<.*>$/.test(text) ? undefined : text;
}
/**
 * A name MATLAB takes an entry by (the package's `isvarname` check): a letter, then letters, digits
 * and underscores, 63 at most. A config set may be named with spaces, which no workspace variable is.
 */
const VARIABLE_NAME = /^[A-Za-z]\w{0,62}$/;
/**
 * The section a top-level entry is in, as MATLAB names it: the label of its section's row (`Design
 * Data`, `Model Workspace`), not the row id's short name (`section:design`); a MAT-file's variable
 * is in none (''). Undefined for a row that is no entry MATLAB can name: a field of one, a link, a
 * name no variable has, or a row under a section row the table does not hold.
 */
function sectionOfEntry(row, rows, kind) {
    if (isLink(row) || !VARIABLE_NAME.test(row.Name.label))
        return undefined;
    if (kind === 'mat')
        return row.parent === null ? '' : undefined;
    if (row.parent === null || !isSectionRowId(row.parent))
        return undefined;
    return rows.find((r) => r.ID === row.parent)?.Name.label;
}
/** `tab`'s row `rowId` (null: the file) as MATLAB takes it; undefined for a tab of no model, dictionary or MAT-file (a project), or none read yet. */
export function matlabTargetOf(tab, rows, rowId) {
    const kind = tab.doc?.kind;
    if (kind !== 'model' && kind !== 'dictionary' && kind !== 'mat')
        return undefined;
    const file = {
        file: tab.path,
        fileName: tab.name,
        ...(kind === 'model' ? { modelName: modelNameOf(tab.name) ?? tab.name } : {}),
        kind,
        dirty: !!tab.dirty,
        docUri: tab.doc.uri,
    };
    const row = rowId === null ? undefined : rows.find((r) => r.ID === rowId);
    // A row gone from the table since it was selected: the file, as with none.
    if (!row)
        return file;
    // A section's row is neither an entry nor a value; a block's is its block alone.
    if (isSectionRowId(row.ID))
        return { ...file, rowId: row.ID };
    if (typeof row._blockPath === 'string')
        return { ...file, rowId: row.ID, block: row._blockPath };
    const section = sectionOfEntry(row, rows, kind);
    const value = valueOf(row);
    return {
        ...file,
        rowId: row.ID,
        ...(section !== undefined ? { entry: { name: row.Name.label, section } } : {}),
        ...(value !== undefined ? { value } : {}),
    };
}
const LABELS = {
    'matlab-open': 'Open in Simulink',
    'matlab-update-diagram': 'Update Diagram',
    'matlab-evaluate': 'Evaluate in MATLAB',
    'matlab-to-workspace': 'Send to Workspace',
    'matlab-from-workspace': 'Get from Workspace',
    'matlab-data-explorer': "Open in MATLAB's Data Explorer",
};
const ICONS = {
    'matlab-open': 'simulink',
    'matlab-update-diagram': 'simulink',
    'matlab-to-workspace': 'matlabWorkspaceFile',
    'matlab-from-workspace': 'matlabWorkspaceFile',
};
// What waits for a save, and why: MATLAB moves the value between the saved file and its workspace.
const WAITS = {
    'matlab-to-workspace': 'Save the file first: MATLAB reads the saved file.',
    'matlab-from-workspace': 'Save the file first: MATLAB writes the saved file.',
};
/**
 * The sections the MATLAB package takes by name: a dictionary's it moves entries in and evaluates
 * in, and a model's workspace. An entry of another (Architectural Data) is not offered Send and Get,
 * and is evaluated in its dictionary rather than in its section.
 */
const MATLAB_SECTIONS = ['Design Data', 'Other Data', 'Embedded Coder', 'Configurations', 'Model Workspace'];
/** The label of `id` while `status` holds: a MATLAB with no Data Explorer opens a file in Model Explorer. */
export function matlabActionLabel(id, status) {
    if (id === 'matlab-data-explorer' && status?.state === 'connected' && !status.dataExplorer)
        return 'Open in Model Explorer';
    return LABELS[id];
}
/** Whether `target` takes `id` from a MATLAB with what `status` says it has. */
function takes(id, target, status) {
    const { kind, entry } = target;
    const { simulink, dataExplorer } = status;
    const dictionaryEntry = kind === 'dictionary' && simulink && !!entry && MATLAB_SECTIONS.includes(entry.section);
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
export function matlabOffers(status, target) {
    if (status?.state !== 'connected' || !target)
        return [];
    return MATLAB_ACTIONS.filter((id) => takes(id, target, status)).map((id) => {
        const icon = ICONS[id];
        const reason = target.dirty ? WAITS[id] : undefined;
        return { id, label: matlabActionLabel(id, status), ...(icon ? { icon } : {}), ...(reason ? { disabled: true, reason } : {}) };
    });
}
/** The offers as a menu's items after a separator; none for no offer. */
export function matlabMenuItems(offers) {
    if (offers.length === 0)
        return [];
    return [{ id: '', label: '', separator: true }, ...offers.map((offer) => ({ ...offer }))];
}
/** The palette's MATLAB group: Connect to MATLAB… (where the host has a MATLAB), then the offers. */
export function matlabPaletteCommands(hasMatlab, offers) {
    return [
        ...(hasMatlab ? [{ id: 'matlab-connect', label: 'Connect to MATLAB…', category: 'MATLAB' }] : []),
        ...offers.map(({ id, label, disabled }) => ({ id, label, category: 'MATLAB', ...(disabled ? { disabled } : {}) })),
    ];
}
const message = (err) => (err instanceof Error ? err.message : String(err));
/** `n` of `what`, in words: `1 warning`, `2 warnings`. */
const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
/**
 * Where an evaluation of `target`'s value runs: the entry's dictionary section (one the package
 * takes), else the dictionary; the model's workspace; or (a MAT-file's) the base workspace.
 */
function contextOf(target) {
    if (target.kind === 'model')
        return { model: target.file };
    if (target.kind !== 'dictionary')
        return undefined;
    const section = target.entry?.section;
    return section && MATLAB_SECTIONS.includes(section) ? { dictionary: target.file, section } : { dictionary: target.file };
}
/** Carry out `id` on `target`; never rejects (a failure is said). */
export async function runMatlab(id, target, on) {
    const label = matlabActionLabel(id, on.matlab.status());
    const model = target.modelName ?? target.fileName;
    // A short note of what was done; the toast goes by itself.
    const done = (text) => on.say('info', text, 2000);
    const notHere = () => on.say('info', `${label} is not available here`);
    try {
        switch (id) {
            case 'matlab-open': {
                await on.matlab.open({ model: target.file, ...(target.block ? { block: target.block } : {}) });
                return done(`Opened ${model} in Simulink${target.block ? ` at ${target.block}` : ''}`);
            }
            case 'matlab-update-diagram': {
                const update = await on.matlab.updateDiagram(target.file);
                // Each diagnostic in the Log, which keeps what the toast lets go by.
                for (const error of update.errors)
                    on.log('error', `${model}: ${error.message}`);
                for (const warning of update.warnings)
                    on.log('warning', `${model}: ${warning.message}`);
                if (!update.ok)
                    return on.say('error', `${model} could not be updated: ${count(update.errors.length, 'error')}`);
                if (update.warnings.length > 0)
                    return on.say('warning', `Updated ${model}: ${count(update.warnings.length, 'warning')}`);
                return on.say('info', `Updated ${model}: no errors or warnings`);
            }
            case 'matlab-evaluate': {
                if (target.value === undefined)
                    return notHere();
                const context = contextOf(target);
                const answer = await on.matlab.evaluate({ expression: target.value, ...(context ? { context } : {}) });
                // The answer is Properties' to show, an expression's own error with it: nothing is said.
                on.evaluated(target, answer);
                return on.showProperties();
            }
            case 'matlab-to-workspace':
            case 'matlab-from-workspace': {
                const entry = target.entry;
                if (!entry)
                    return notHere();
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
    }
    catch (err) {
        on.say('error', `${label} failed: ${message(err)}`);
    }
}
// --- The answer in Properties -------------------------------------------------------------------
/** Evaluate's answers, by document, row and the expression asked. */
export class MatlabResults {
    constructor() {
        this.answers = new Map();
        this.listeners = new Set();
    }
    set(docUri, rowId, expression, answer) {
        this.answers.set(MatlabResults.key(docUri, rowId), { expression, answer });
        this.tell();
    }
    /** The answer for the row while its value is still `expression`. */
    get(docUri, rowId, expression) {
        const kept = this.answers.get(MatlabResults.key(docUri, rowId));
        return kept?.expression === expression ? kept.answer : undefined;
    }
    clear() {
        this.answers.clear();
        this.tell();
    }
    /** Hear each set and clear; returns the unsubscribe. */
    on(listener) {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    }
    tell() {
        for (const listener of [...this.listeners])
            listener();
    }
    // A row's id is unique in its document; a newline is in neither a uri nor an id.
    static key(docUri, rowId) {
        return `${docUri}\n${rowId}`;
    }
}
/** The most of a display Properties shows: a matrix's display runs to MATLAB's own cut, 20000 characters. */
const SHOWN = 2000;
/**
 * Properties' "MATLAB" group for an answer. Its text is MATLAB's display, lines of columns laid out
 * in spaces (a matrix's), and an error's message may run to lines too: both are drawn as written
 * (`multiline`).
 */
export function matlabGroup(answer) {
    if ('error' in answer)
        return { title: 'MATLAB', properties: [{ name: 'In MATLAB', value: `Error: ${answer.error.message}`, multiline: true }] };
    const { text, truncated, size } = answer.value;
    const long = text.length > SHOWN;
    const shown = `${long ? text.slice(0, SHOWN) : text}${long || truncated ? '…' : ''}`;
    return {
        title: 'MATLAB',
        properties: [
            { name: 'In MATLAB', value: shown, multiline: true },
            { name: 'Class', value: answer.value.class },
            { name: 'Size', value: size.join('×') },
        ],
    };
}
/**
 * `feed` with the MATLAB group after the page's own, for a row `answerFor` has an answer for. The
 * last page is sent again when `changed` tells that an answer came or went. matrix and edit pass through.
 */
export function withMatlabResults(feed, answerFor, changed) {
    const withAnswer = (view) => {
        const answer = view.rowId === undefined ? undefined : answerFor(view.rowId);
        return answer ? { ...view, groups: [...view.groups, matlabGroup(answer)] } : view;
    };
    const edit = feed.edit;
    return {
        onPage(listener) {
            let last;
            const offPage = feed.onPage((view) => {
                last = view;
                listener(withAnswer(view));
            });
            const offChanged = changed(() => {
                if (last)
                    listener(withAnswer(last));
            });
            return () => {
                offPage();
                offChanged();
            };
        },
        matrix: (nodeId) => feed.matrix(nodeId),
        ...(edit ? { edit: (change) => edit.call(feed, change) } : {}),
    };
}
