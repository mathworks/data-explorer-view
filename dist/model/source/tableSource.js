/**
 * Why an answer never came: the source was closed while it was being asked (a table of a document
 * that closed during its paint). Whoever relays a source's answers (serveTable, connectTable) says
 * nothing of it, as there is no one left to tell.
 */
export class SourceClosed extends Error {
    constructor(message) {
        super(message);
        this.name = 'SourceClosed';
    }
}
/**
 * Whether `err` is a SourceClosed. By its name, not `instanceof`, as serveTable tells one: the serve
 * entry loads no module of the model, this one included.
 */
export const isSourceClosed = (err) => err?.name === 'SourceClosed';
/** The commands an EditableTableSource takes, by name. */
const COMMANDS = [
    'edit',
    'copy',
    'cut',
    'delete',
    'paste',
    'addChild',
    'addEntry',
    'undo',
    'redo',
    'dragStart',
    'dragEnd',
    'drop',
    'requestEditText',
];
/**
 * Whether `source` takes edits: it has every command of an EditableTableSource. Whether its
 * table may edit what it shows now is the view's `editable`, which can be false for a source that
 * takes edits (a MAT-file opened for viewing only).
 */
export function isEditable(source) {
    const commands = source;
    return COMMANDS.every((name) => typeof commands[name] === 'function');
}
