// Copyright 2026 The MathWorks, Inc.
//
// The command window's interpreter: a line typed at the `>>` prompt of <dex-command-window>, run
// against the active document, and answered as lines of output. DOM-free, over an interface small
// enough for an app to give from what it already holds (CommandTarget): the documents it has open,
// the rows of the active one's table, and that table source's own commands.
//
// It is the prototype's CommandController (src/core/CommandController.ts) without two things.
// It runs no JavaScript: the older app evaluated any line it did not know as a JS expression, which
// a page under a strict content security policy (no 'unsafe-eval') cannot do, and `help` says so
// rather than leaving a person to find out. And it changes a document only as the table would: an
// assignment is a cell edit of one of the table's columns, carrying the cell's old text, sent
// through the same source command a double-click and Enter send, so what the document accepts,
// refuses and undoes is the same either way. A property that is no column of the table (a
// parameter's CoderInfo) is not reachable here, as it is not in the table.
//
// Names resolve as connectTable's selectByName does: an entry first, since a nested row that
// shares the name is not what a bare name means; then any row; then a block by its key. A dotted
// name (`Bus.Element`) that no row has walks down instead, each part a row under the one before;
// and a dotted name whose last part is a column of the row before it (`Speed.Description`) names
// that cell.
//
// Every answer is lines. Nothing throws: a check that ends a command early throws an Early answer,
// which runCommand turns back into its lines, and any other failure (the target's) becomes an
// error line with its message, as the window has no one to catch it.
import { ADD_CATALOG, matCatalog, sectionTile } from '../ids/addCatalog.js';
import { isSectionRowId } from '../ids/sectionRowId.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { CellEdit, InspectorView, NewEntry, TableView } from '../source/tableSource.js';

/** One open document, as `sources` lists it. */
export interface CommandDoc {
  /** Its file name (`dd.sldd`). */
  name: string;
  /** What kind of file it is: a workspace Doc's `kind` ('dictionary', 'mat', 'model', …). */
  kind: string;
  /** Whether the commands act on it: the document of the active tab. One at most is. */
  active: boolean;
  /** Whether it holds edits its file does not. */
  dirty: boolean;
}

/**
 * A row's raw data, as `json` shows it: text in a format, the bytes of a binary record, or why
 * there is none.
 *
 * Read structurally, standing in for the raw viewer's RawView (src/model/raw/rawView.ts, built
 * beside this module) until the two are merged; then `CommandTarget.raw` returns a RawView, whose
 * every arm this shape reads: `{format, text}`, `{format: 'hex', bytes}`, `{format: 'none', reason}`.
 */
export interface CommandRaw {
  /** 'json', 'xml', 'text', 'hex' or 'none'. */
  format: string;
  /** The text of a textual format. */
  text?: string;
  /** The bytes of a binary record ('hex'). */
  bytes?: Uint8Array;
  /** Why there is no raw data ('none'). */
  reason?: string;
}

/** One kind of entry `add` can create: an Add gallery tile, as its `dex-add-tile` names it. */
export interface AddChoice {
  /** The class core is asked to create (`Simulink.Parameter`). */
  className: string;
  /**
   * The section the entry goes in, by core's key ('design', 'arch', 'config'), or '' for a file
   * whose variables are in none (a MAT-file's, a model's workspace).
   */
  section: string;
  /** What the tile says (`Simulink Parameter`). */
  label: string;
}

/**
 * What the commands act on: the app's open documents, and the active one's table.
 *
 * The commands that change the document are its table source's (EditableTableSource), one call per
 * command as one gesture is one call. Each returns, or resolves, once the document has done it and
 * `rows()` shows it: the interpreter reads the rows again to say what an edit left (a refused edit
 * leaves the value the cell had), to find the entry `add` created, and to see that `rm` removed
 * one, and `add <class> <name>` edits the new entry's Name next. A source in the page edits a cell
 * as the call is made. Its add and delete are queued: each paints, says the selection it leaves
 * (a `select` change, or `refused`), and writes the file's text after that, in the same task; an
 * edit sent before that write is done is lost, so a target over one resolves a task past the
 * `select`. A method that is absent is a command this document does not take: no `edit`, and the
 * document is read-only.
 */
export interface CommandTarget {
  /** The documents open, in the order `sources` lists them; the active one marked. */
  docs(): CommandDoc[];
  /** The rows the active document's table holds now, parents before children (a TableView's `rows`, as repainted since). */
  rows(): TreeTableRow[];
  /** The property inspector's page for a row (`TableSource.inspect`). */
  inspect(rowId: string): Promise<InspectorView>;
  /** A row's raw data. Absent: `json` says there is none for this document. */
  raw?(rowId: string): Promise<CommandRaw>;
  /** Write a cell edit back (`EditableTableSource.edit`). Absent: the document is read-only. */
  edit?(edit: CellEdit): void | Promise<void>;
  /** Create a new default entry (`EditableTableSource.addEntry`). */
  addEntry?(entry: NewEntry): void | Promise<void>;
  /** Delete these rows (`EditableTableSource.delete`). */
  remove?(rowIds: string[]): void | Promise<void>;
  /** Save the active document; resolves to what to say (`Saved dd.sldd.`), rejects with why not. */
  save?(): Promise<string>;
  /** What `add` can create, in the Add gallery's order: `addChoicesOf(view)` for the table's view. */
  classes?(): readonly AddChoice[];
}

/** One line of a command's answer: what it says, and whether it is output, an error or a note. */
export interface OutputLine {
  text: string;
  kind: 'out' | 'error' | 'info';
}

/** A command's answer: the lines to show, after clearing the window first where `clear` says. */
export interface CommandOutput {
  lines: OutputLine[];
  /** The window is to be cleared (`clear`). */
  clear?: boolean;
}

/**
 * What the Add gallery offers for a table's view, as `add` chooses among it: every tile of a
 * dictionary, each naming its section; for a view that lists its classes (a MAT-file, a model),
 * those classes' tiles in no section, and the tiles of its `addSections` in theirs. The same
 * tiles, in the same order, that `<dex-add-gallery>` draws for it, and the same section each
 * tile's `dex-add-tile` would send.
 */
export function addChoicesOf(view: Pick<TableView, 'add' | 'addSections'>): AddChoice[] {
  const classes = view.add?.classes;
  if (!classes) return ADD_CATALOG.flatMap((c) => c.tiles).map((t) => ({ className: t.className, section: t.section, label: t.label }));
  const sections = view.addSections ?? [];
  return matCatalog(classes, sections)
    .flatMap((c) => c.tiles)
    .map((t) => ({ className: t.className, section: sectionTile(t, sections) ? t.section : '', label: t.label }));
}

/**
 * Run one line typed at the prompt against `target`, and answer it. Resolves always, never
 * rejects: what went wrong is a line of the answer. A blank line answers nothing.
 */
export async function runCommand(line: string, target: CommandTarget): Promise<CommandOutput> {
  const text = line.trim();
  if (!text) return { lines: [] };
  try {
    return await dispatch(text, target);
  } catch (err) {
    if (err instanceof Early) return { lines: err.lines };
    return { lines: [error(messageOf(err))] };
  }
}

// --- Lines -----------------------------------------------------------------------------------------

const out = (text: string): OutputLine => ({ text, kind: 'out' });
const error = (text: string): OutputLine => ({ text, kind: 'error' });
const info = (text: string): OutputLine => ({ text, kind: 'info' });

/** An answer given early, by a check inside a command: thrown, and caught by runCommand alone. */
class Early {
  constructor(readonly lines: OutputLine[]) {}
}
const stop = (...lines: OutputLine[]): never => {
  throw new Early(lines);
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// What help says. JavaScript is named in the last line because the older app ran it, and a person
// who used that one will try.
const HELP: readonly OutputLine[] = [
  info('Commands:'),
  out('  help, ?                        this list'),
  out('  clear, clc                     clear the window'),
  out('  sources                        the open documents'),
  out('  ls [name]                      the entries, or the rows under one'),
  out("  info <name>                    an entry's properties"),
  out("  json <name>                    an entry's raw data"),
  out('  set <name>[.<Column>] <value>  set a cell of the table'),
  out('  add <class> [<name>]           add an entry of a class, by that name'),
  out('  rm <name>                      delete an entry'),
  out('  save                           save the document'),
  info('MATLAB syntax:'),
  out('  <name>                         show its value'),
  out('  <name> = <value>               set its Value'),
  out('  <name>.<Column> = <value>      set its Name, Description, DataType or another column'),
  out('  A name finds an entry before a row inside one; Bus.Element finds a row inside Bus.'),
  info("JavaScript is not run here: the page's security policy forbids evaluating typed code."),
];

// The longest a column of `ls` and `info` is padded to: a longer name or class runs on, rather
// than every line of the listing being padded out to it.
const NAME_WIDTH = 32;
// The most of a value `ls` shows on its line; `<name>` alone shows it whole.
const VALUE_WIDTH = 60;
// The most lines of raw text `json` answers: the window keeps its newest lines, and a long record
// would push its own first lines out.
const RAW_LINES = 1000;

// --- Dispatch --------------------------------------------------------------------------------------

// `<name> = <value>`, `<name>.<Column> = <value>`: MATLAB's identifiers, dotted. Not `==`.
const ASSIGNMENT = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*=(?!=)\s*(.*)$/;
// A line that is a name or a dotted name, and nothing else.
const PATH = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;

async function dispatch(text: string, target: CommandTarget): Promise<CommandOutput> {
  // An assignment before a command: `ls = 2` sets an entry named ls, as MATLAB reads it.
  const assignment = ASSIGNMENT.exec(text);
  if (assignment) {
    const path = assignment[1]!;
    const value = assignment[2]!;
    if (value === '') return { lines: [error(`Give a value: ${path} = <value>`)] };
    return { lines: await setCell(target, path, value) };
  }
  const space = text.search(/\s/);
  const word = space < 0 ? text : text.slice(0, space);
  const args = space < 0 ? '' : text.slice(space + 1).trim();
  switch (word) {
    case 'help':
    case '?':
      return { lines: [...HELP] };
    case 'clear':
    case 'clc':
      return { lines: [], clear: true };
    case 'sources':
      return { lines: sources(target) };
    case 'ls':
      return { lines: list(target, unquote(args)) };
    case 'info':
      return { lines: await properties(target, unquote(args)) };
    case 'json':
      return { lines: await rawOf(target, unquote(args)) };
    case 'set':
      return { lines: await set(target, args) };
    case 'add':
      return { lines: await add(target, args) };
    case 'rm':
      return { lines: await remove(target, unquote(args)) };
    case 'save':
      return { lines: await save(target) };
    default:
      return { lines: show(target, text, word) };
  }
}

// --- Documents and rows ----------------------------------------------------------------------------

/** The document the commands act on; without one, the command ends with a note that says why. */
function activeDoc(target: CommandTarget): CommandDoc {
  const docs = target.docs();
  return docs.find((d) => d.active) ?? stop(info(docs.length === 0 ? 'No document is open.' : 'No document is active.'));
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** A cell's text, as the table shows it: a string, or an object's `text`. */
function cellText(cell: unknown): string {
  if (typeof cell === 'string') return cell;
  return isRecord(cell) && typeof cell.text === 'string' ? cell.text : '';
}

const labelOf = (row: TreeTableRow): string => (typeof row.Name?.label === 'string' ? row.Name.label : '');
// What a row is, for `ls` and a value-less row: its Class, or else its Data Type (a block's type).
const classOf = (row: TreeTableRow): string => cellText(row.Class) || cellText(row.DataType);
// A row's value as `<name>` shows it: the Value cell, or, where it has none, its class as core
// writes an object's summary (`<Simulink.Bus>`).
function valueOf(row: TreeTableRow): string {
  const value = cellText(row.Value);
  if (value) return value;
  const cls = classOf(row);
  return cls ? `<${cls}>` : '';
}

/**
 * A top-level entry, as selectByName decides one: its parent is a section heading or, in a table
 * with no section rows (a MAT-file's), it has no parent and is no heading itself.
 */
const isEntry = (r: TreeTableRow): boolean => (typeof r.parent === 'string' ? isSectionRowId(r.parent) : !isSectionRowId(r.ID));

/** The row a whole name names, in selectByName's order: an entry, any row, a block's key. */
function named(rows: readonly TreeTableRow[], name: string): TreeTableRow | undefined {
  return (
    rows.find((r) => labelOf(r) === name && isEntry(r)) ?? rows.find((r) => labelOf(r) === name) ?? rows.find((r) => r._blockKey === name)
  );
}

/**
 * The row `path` names: the row of that whole name, else its dotted parts walked down from the
 * first, each a row under the one before. With no such row, `lazy` is the row the walk stopped at
 * when that row's own rows were held back (`_lazy`): the name may be there, not yet loaded.
 */
function lookup(rows: readonly TreeTableRow[], path: string): { row?: TreeTableRow; lazy?: TreeTableRow } {
  const whole = named(rows, path);
  if (whole) return { row: whole };
  const [first, ...rest] = path.split('.');
  if (rest.length === 0) return {};
  let at = named(rows, first!);
  for (const part of rest) {
    if (!at) return {};
    const parent: TreeTableRow = at;
    at = rows.find((r) => r.parent === parent.ID && labelOf(r) === part);
    if (!at) return parent._lazy ? { lazy: parent } : {};
  }
  return { row: at };
}

const notLoaded = (row: TreeTableRow): string =>
  `The rows under "${labelOf(row)}" are not loaded yet: expand it in the table, then ask again.`;

/** The row `path` names; without one, the command ends saying so, and what a wrong case meant. */
function findRow(rows: readonly TreeTableRow[], path: string, doc: CommandDoc): TreeTableRow {
  const { row, lazy } = lookup(rows, path);
  if (row) return row;
  if (lazy) stop(info(notLoaded(lazy)));
  return stop(error(`Nothing is named "${path}" in ${doc.name}.${suggestion(rows, path)}`));
}

// " Did you mean "Speed"?" for `speed`: the name in another case, an entry first, as a name finds.
function suggestion(rows: readonly TreeTableRow[], path: string): string {
  const lower = path.toLowerCase();
  const same = (r: TreeTableRow) => labelOf(r).toLowerCase() === lower;
  const near = rows.find((r) => same(r) && isEntry(r)) ?? rows.find(same);
  return near ? ` Did you mean "${labelOf(near)}"?` : '';
}

// The four columns every table has, settable where the row's cell is editable.
const TABLE_COLUMNS = ['Value', 'Name', 'Description', 'DataType'];

/**
 * Whether `key` is one of the table's columns on `row`: one of the four every table has, or a cell
 * the row carries by that key (Min, Unit, a Code Generation column). Not a row's own bookkeeping
 * (`ID`, `parent`, `_lazy`), and not what every object has (`constructor`): neither is a cell.
 */
function isColumn(row: TreeTableRow, key: string): boolean {
  if (TABLE_COLUMNS.includes(key)) return true;
  if (key.startsWith('_') || key === 'ID' || key === 'parent' || !Object.hasOwn(row, key)) return false;
  const cell = row[key];
  return typeof cell === 'string' || (isRecord(cell) && typeof cell.text === 'string');
}

/** A cell a name names: the row, the column, the name as typed, and the part of it that names the row. */
interface Cell {
  row: TreeTableRow;
  column: string;
  path: string;
  name: string;
}

/**
 * The cell `path` names: `<row>.<Column>` where the last part is a column of the row before it,
 * else the Value of the row the whole path names. `notAColumn` is what to say of a row that has
 * neither: a last part that is no column of it, and no row under it.
 */
function cellAt(rows: readonly TreeTableRow[], path: string, doc: CommandDoc, notAColumn: (head: string, key: string) => string): Cell {
  const dot = path.lastIndexOf('.');
  if (dot > 0) {
    const head = path.slice(0, dot);
    const key = path.slice(dot + 1);
    const { row } = lookup(rows, head);
    if (row && isColumn(row, key)) return { row, column: key, path, name: head };
    const whole = lookup(rows, path);
    if (whole.row) return { row: whole.row, column: 'Value', path, name: path };
    if (whole.lazy) stop(info(notLoaded(whole.lazy)));
    if (row) stop(error(notAColumn(head, key)));
  }
  return { row: findRow(rows, path, doc), column: 'Value', path, name: path };
}

/** A cell's text: its Name's label, its Value's text, any other cell's. */
const textAt = (row: TreeTableRow, column: string): string => (column === 'Name' ? labelOf(row) : cellText(row[column]));

/** `Kp = 1`, `Speed.Description = Top speed`, `Bus = <Simulink.Bus>`: a cell, as typed and as it reads. */
const display = (row: TreeTableRow, column: string, path: string): string =>
  `${path} = ${column === 'Value' ? valueOf(row) : textAt(row, column)}`.trimEnd();

// --- Showing ---------------------------------------------------------------------------------------

/** A line that is no command: a name, shown; else nothing this window knows. */
function show(target: CommandTarget, text: string, word: string): OutputLine[] {
  const unknown = error(`Unrecognized command "${word}". Type "help" for the commands.`);
  const doc = target.docs().find((d) => d.active);
  if (!doc) return [unknown];
  const rows = target.rows();
  // A name with a space or a bracket in it (`Design Data`, `Mat(1,1)`) is a name only if a row has it.
  if (!PATH.test(text) && !named(rows, text)) return [unknown];
  const cell = cellAt(rows, text, doc, (head, key) => `"${head}" has no column ${key}.`);
  return [out(display(cell.row, cell.column, cell.path))];
}

/** `sources`: each open document, its kind, the active one and the unsaved ones marked. */
function sources(target: CommandTarget): OutputLine[] {
  const docs = target.docs();
  if (docs.length === 0) return [info('No documents are open.')];
  const names = docs.map((d) => d.name + (d.dirty ? ' *' : ''));
  const width = Math.max(...names.map((n) => n.length));
  const lines = docs.map((d, i) => out(`  ${names[i]!.padEnd(width)}  ${d.kind}${d.active ? '  (active)' : ''}`));
  return docs.some((d) => d.dirty) ? [...lines, info('* has unsaved changes')] : lines;
}

/** `ls`: the entries under their sections' headings; `ls <name>`: the rows under that one. */
function list(target: CommandTarget, name: string): OutputLine[] {
  const doc = activeDoc(target);
  const rows = target.rows();
  if (name) {
    const row = findRow(rows, name, doc);
    const under = rows.filter((r) => r.parent === row.ID);
    if (under.length === 0) return [info(row._lazy ? notLoaded(row) : `"${name}" has no rows under it.`)];
    return listing(under).map(out);
  }
  const entries = rows.filter(isEntry);
  if (entries.length === 0) return [info(`${doc.name} has no entries.`)];
  // The table's order keeps each section's entries together, so a heading goes before the first
  // entry of each; a section with none has no heading, and a document with none (a MAT-file) none.
  const lines: OutputLine[] = [];
  const text = listing(entries);
  let section: string | null | undefined;
  entries.forEach((r, i) => {
    if (r.parent !== section) {
      section = r.parent;
      const heading = section === null ? undefined : rows.find((h) => h.ID === section);
      if (heading) lines.push(info(labelOf(heading)));
    }
    lines.push(out(text[i]!));
  });
  return lines;
}

/** Each row as `  name  class  value`, the first two columns lined up across the rows. */
function listing(rows: readonly TreeTableRow[]): string[] {
  const nameWidth = Math.min(NAME_WIDTH, Math.max(...rows.map((r) => labelOf(r).length)));
  const classWidth = Math.min(NAME_WIDTH, Math.max(...rows.map((r) => classOf(r).length)));
  return rows.map((r) => `  ${labelOf(r).padEnd(nameWidth)}  ${classOf(r).padEnd(classWidth)}  ${cut(cellText(r.Value))}`.trimEnd());
}

const cut = (text: string): string => (text.length > VALUE_WIDTH ? `${text.slice(0, VALUE_WIDTH - 1)}…` : text);

/** `info <name>`: the inspector's groups for the row, each property lined up under its title. */
async function properties(target: CommandTarget, name: string): Promise<OutputLine[]> {
  if (!name) return [error('Usage: info <name>')];
  const doc = activeDoc(target);
  const row = findRow(target.rows(), name, doc);
  const view = await target.inspect(row.ID);
  const groups = view.groups.filter((g) => g.properties.length > 0);
  if (groups.length === 0) return [info(`No properties to show for "${name}".`)];
  const width = Math.min(NAME_WIDTH, Math.max(...groups.flatMap((g) => g.properties.map((p) => p.name.length))));
  return groups.flatMap((g) => [info(g.title), ...g.properties.map((p) => out(`  ${p.name.padEnd(width)}  ${p.value}`.trimEnd()))]);
}

/** `json <name>`: the row's raw text, line by line, or why there is none to show. */
async function rawOf(target: CommandTarget, name: string): Promise<OutputLine[]> {
  if (!name) return [error('Usage: json <name>')];
  const doc = activeDoc(target);
  const row = findRow(target.rows(), name, doc);
  if (!target.raw) return [error(`Raw data is not available for ${doc.name}.`)];
  const raw = await target.raw(row.ID);
  if (typeof raw.text === 'string' && raw.text !== '') {
    const lines = raw.text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const shown = lines.slice(0, RAW_LINES).map(out);
    return lines.length > RAW_LINES ? [...shown, info(`… ${lines.length - RAW_LINES} more lines.`)] : shown;
  }
  if (raw.bytes instanceof Uint8Array) return [info(`"${name}" holds ${raw.bytes.length} bytes of binary data.`)];
  return [info(raw.reason || 'No raw data for this row.')];
}

// --- Editing ---------------------------------------------------------------------------------------

/**
 * A quoted text without its quotes, as MATLAB reads a char vector or a string: `'it''s'` is
 * `it's`. Anything else as it is.
 */
function unquote(text: string): string {
  if (text.length < 2) return text;
  const q = text[0];
  if ((q !== "'" && q !== '"') || text.at(-1) !== q) return text;
  return text.slice(1, -1).replaceAll(q + q, q);
}

/**
 * What a cell's editor would open on, or null where the table offers none: the same rules as the
 * tree table's _cellEditTarget, so the window edits exactly the cells a double-click would. A
 * Name by its own flag; a Value by its cell's (with the choices a select offers) or the row's
 * `_valueEditable`; a Description wherever the object has one it can keep; any other column where
 * its cell says it is editable.
 */
function editorOf(row: TreeTableRow, column: string): { text: string; options?: string[] } | null {
  const cell = row[column];
  const optionsOf = (c: Record<string, unknown>) =>
    Array.isArray(c.options) ? { options: c.options.filter((o): o is string => typeof o === 'string') } : {};
  switch (column) {
    case 'Name':
      return row.Name?.editable ? { text: labelOf(row) } : null;
    case 'Value':
      if (isRecord(cell)) return cell.editable === true ? { text: cellText(cell), ...optionsOf(cell) } : null;
      return row._valueEditable ? { text: cellText(cell) } : null;
    case 'Description':
      return row._descriptionApplies === false || row._descriptionEditable === false ? null : { text: cellText(cell) };
    default:
      return isRecord(cell) && cell.editable === true ? { text: cellText(cell), ...optionsOf(cell) } : null;
  }
}

/**
 * Whether a rename took: the row no longer has its old name under its old id (a source whose ids
 * embed names gave it a new one), and a row beside it has the new name. A refused rename leaves
 * the row as it was, whatever else has the new name.
 */
function wasRenamed(rows: readonly TreeTableRow[], row: TreeTableRow, from: string, to: string): boolean {
  return !rows.some((r) => r.ID === row.ID && labelOf(r) === from) && rows.some((r) => r.parent === row.parent && labelOf(r) === to);
}

/** `set <name>[.<Column>] <value>`, with or without an `=` between. */
function set(target: CommandTarget, args: string): Promise<OutputLine[]> {
  const parts = /^([^\s=]+)\s*(?:=\s*)?(.*)$/.exec(args);
  if (!parts || parts[2] === '') return Promise.resolve([error('Usage: set <name>[.<Column>] <value>')]);
  return setCell(target, parts[1]!, parts[2]!);
}

/**
 * Set the cell `path` names to `value`: one cell edit, as the table's editor would commit it, then
 * the cell as the document now has it. A Value is sent as typed, a MATLAB expression; a text
 * column's value (a Name, a Description) loses its quotes, as MATLAB would assign the text.
 */
async function setCell(target: CommandTarget, path: string, value: string): Promise<OutputLine[]> {
  const doc = activeDoc(target);
  if (!target.edit) return [error(`${doc.name} is read-only.`)];
  const cell = cellAt(target.rows(), path, doc, () => "Only the table's columns can be set here.");
  const { row, column, name } = cell;
  if (isSectionRowId(row.ID)) return [error(`"${name}" is a section: set its entries instead.`)];
  const editor = editorOf(row, column);
  if (!editor) return [error(`"${name}" has no editable ${column}.`)];
  let newValue = column === 'Value' ? value : unquote(value);
  if (editor.options) {
    // A choice is one of the choices, quoted or not.
    const choice = [value, unquote(value)].find((v) => editor.options!.includes(v));
    if (choice === undefined) return [error(`"${name}" takes one of: ${editor.options.join(', ')}.`)];
    newValue = choice;
  }
  const oldValue = editor.text;
  // The value the cell has already: no edit, as the table commits none for an editor left as it opened.
  if (newValue === oldValue) return [out(display(row, column, cell.path))];
  await target.edit({ rowId: row.ID, columnId: column, oldValue, newValue });
  const rows = target.rows();
  if (column === 'Name') {
    return wasRenamed(rows, row, oldValue, newValue) ? [out(`Renamed "${oldValue}" to "${newValue}".`)] : [error(`"${name}" was not renamed.`)];
  }
  // The row as the edit left it: a refused one, as it was, which is what the window says.
  const now = rows.find((r) => r.ID === row.ID) ?? lookup(rows, name).row;
  if (!now) return [out(`${cell.path} = ${newValue}`)];
  const lines = [out(display(now, column, cell.path))];
  if (textAt(now, column) === oldValue) lines.push(info(`"${name}" is unchanged.`));
  return lines;
}

/** `add <class> [<name>]`: a new entry of the class, where the Add gallery's tile for it puts one, then named. */
async function add(target: CommandTarget, args: string): Promise<OutputLine[]> {
  const doc = activeDoc(target);
  if (!target.addEntry) return [error(`${doc.name} is read-only.`)];
  const choices = target.classes?.() ?? [];
  if (choices.length === 0) return [error(`Nothing can be added to ${doc.name}.`)];
  const takes = info(`It takes: ${[...new Set(choices.map((c) => c.className))].join(', ')}`);
  const parts = /^(\S+)\s*(.*)$/.exec(args);
  if (!parts) return [error('Usage: add <class> [<name>]'), takes];
  const asked = parts[1]!;
  const name = unquote(parts[2]!);
  // The first tile of the class, as the gallery lists them (Design Data's before Architectural
  // Data's); a class typed in another case is still the class.
  const choice =
    choices.find((c) => c.className === asked) ?? choices.find((c) => c.className.toLowerCase() === asked.toLowerCase());
  if (!choice) return [error(`${doc.name} cannot take a "${asked}".`), takes];
  const before = new Set(target.rows().map((r) => r.ID));
  await target.addEntry({ section: choice.section, className: choice.className, rename: false });
  const created = target.rows().find((r) => !before.has(r.ID) && isEntry(r));
  if (!created) return [error(`No ${choice.className} was added.`)];
  const made = labelOf(created);
  if (!name || name === made) return [out(`Created "${made}" (${choice.className}).`)];
  if (target.edit && created.Name?.editable) {
    await target.edit({ rowId: created.ID, columnId: 'Name', oldValue: made, newValue: name });
  }
  return wasRenamed(target.rows(), created, made, name)
    ? [out(`Created "${name}" (${choice.className}).`)]
    : [error(`Created "${made}" (${choice.className}), but could not name it "${name}".`)];
}

/** `rm <name>`: delete the row, an entry or a row inside one, as the table's Delete would. */
async function remove(target: CommandTarget, name: string): Promise<OutputLine[]> {
  if (!name) return [error('Usage: rm <name>')];
  const doc = activeDoc(target);
  if (!target.remove) return [error(`${doc.name} is read-only.`)];
  const row = findRow(target.rows(), name, doc);
  if (isSectionRowId(row.ID)) return [error(`"${name}" is a section: remove its entries instead.`)];
  await target.remove([row.ID]);
  return target.rows().some((r) => r.ID === row.ID) ? [error(`"${name}" was not removed.`)] : [out(`Removed "${name}".`)];
}

/** `save`: the save's own message, or why it failed. */
async function save(target: CommandTarget): Promise<OutputLine[]> {
  const doc = activeDoc(target);
  if (!target.save) return [error(`${doc.name} cannot be saved here.`)];
  try {
    return [out((await target.save()) || `Saved ${doc.name}.`)];
  } catch (err) {
    return [error(`Save failed: ${messageOf(err)}`)];
  }
}
