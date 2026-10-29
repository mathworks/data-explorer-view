import type { TableSource } from './tableSource.js';
import type { TablePort } from './wire.js';
/**
 * Answer the table's end of `port` from `source`, until the returned function is called:
 *
 * - `ready` with `setRows` (the source's `open()`), or `error` with why it cannot be shown;
 * - `requestChildren` with `childRows`, `requestMatrix` with `matrixCells`;
 * - `select` with `showProps` for the selection's first row, or `empty`;
 * - and every change the source makes, as it makes it: `setRows`, `updateEntryRows`,
 *   `insertEntryRows` or `error`.
 *
 * Any other message is left alone, for whatever else listens on the port.
 */
export declare function serveTable(source: TableSource, port: TablePort): () => void;
