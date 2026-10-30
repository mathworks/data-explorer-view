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
