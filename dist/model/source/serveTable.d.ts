import type { TableSource, TableView } from './tableSource.js';
import type { TablePort } from './wire.js';
/**
 * What a host that speaks more than the wire adds to it (the VS Code extension's Locate in Text,
 * navigation, and setRows fields of its own).
 */
export interface ServeTableExtra {
    /**
     * Hear each message from the table's end that is not one of the wire's (wire.ts), as it arrives.
     * Without it, such a message is left alone, for whatever else listens on the port.
     */
    receive?(message: Record<string, unknown>): void;
    /**
     * Fields of the host's own to send with every `setRows`, after the view's: for example the
     * extension's `hasTextView`. Asked for each one, with the view it carries.
     */
    setRows?(view: TableView): Record<string, unknown>;
}
/** What serveTable may be told besides its source and port. */
export interface ServeTableOptions {
    extra?: ServeTableExtra;
}
/**
 * Answer the table's end of `port` from `source`, until the returned function is called:
 *
 * - `ready` with `setRows` (the source's `open()`), or `error` with why it cannot be shown; after
 *   the `setRows`, the source is told (`opened`), for what it says after a paint;
 * - `requestChildren` with `childRows`, `requestMatrix` with `matrixCells`;
 * - `select` with `showProps` for the selection's first row, or `empty`;
 * - and every change the source makes, as it makes it: `setRows`, `updateEntryRows`,
 *   `insertEntryRows` or `error`, and an editable source's `sectionRules`, `clipboardState`,
 *   `dragState`, `selectRows`, `beginRename`, `validationError`, `refused` and `editText`.
 *
 * An editing message (`edit`, `copy`, `cut`, `delete`, `paste`, `addChild`, `addEntry`, `undo`,
 * `redo`, `dragStart`, `dragEnd`, `drop`, `requestEditText`) is handed to the source's command of
 * the same name, there and then: synchronously, in arrival order, with its fields as the table sent
 * them (the source judges them). A source without the command, a read-only one, is not asked.
 *
 * Any other message goes to `options.extra.receive` when there is one, and is otherwise left
 * alone, for whatever else listens on the port.
 */
export declare function serveTable(source: TableSource, port: TablePort, options?: ServeTableOptions): () => void;
