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
    /**
     * A row's raw data (`TableSource.raw`). `json` asks with `record`: the record a save writes, as
     * JSON, in place of the bytes a MAT-file's variable was read from. Absent: `json` says there is
     * none for this document.
     */
    raw?(rowId: string, options?: {
        record?: boolean;
    }): Promise<CommandRaw>;
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
    /** What the line says, as text: drawn as it is, its spaces kept (a listing's columns line up on them). */
    text: string;
    /**
     * What it is: `out`, what the command answers (a value, a listing); `error`, why the command did
     * nothing, or not what was asked; `info`, a note around the answer (a heading, "is unchanged").
     */
    kind: 'out' | 'error' | 'info';
}
/** A command's answer: the lines to show, after clearing the window first where `clear` says. */
export interface CommandOutput {
    /** The lines to show, in order; none for a blank line, a comment, or a line ending in `;` that did what it said. */
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
export declare function addChoicesOf(view: Pick<TableView, 'add' | 'addSections'>): AddChoice[];
/**
 * Run one line typed at the prompt against `target`, and answer it. Resolves always, never
 * rejects: what went wrong is a line of the answer. A blank line answers nothing.
 */
export declare function runCommand(line: string, target: CommandTarget): Promise<CommandOutput>;
/**
 * What a cell's editor would open on, or null where the table offers none: the same rules as the
 * tree table's _cellEditTarget, so the window edits exactly the cells a double-click would (a
 * test holds the two together over real views; exported for it). A
 * Name by its own flag; a Value by its cell's or the row's `_valueEditable`; a Description wherever
 * the object has one it can keep; any other column where its cell says it is editable. `options`
 * only where the cell's editor is a select, the one editor the table lists them in: a text editor
 * that carries them takes any text.
 */
export declare function cellEditor(row: TreeTableRow, column: string): {
    text: string;
    options?: string[];
} | null;
