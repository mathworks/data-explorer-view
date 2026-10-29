import type { InspectorFeed, TableSource } from './tableSource.js';
import type { TablePort } from './wire.js';
/**
 * A TableSource answered by a host across `port`, in the wire format (wire.ts).
 *
 * `open()` says `ready` and resolves with the next `setRows` (or rejects with the next `error`);
 * `children()` and `matrix()` ask with `requestChildren` and `requestMatrix`; `inspect()` sends a
 * `select` and resolves with the `showProps` or `empty` that answers it. Every later `setRows`,
 * `updateEntryRows`, `insertEntryRows` and `error` reaches the subscribers as a TableChange.
 *
 * The returned `dispose()` stops listening, and rejects what is still waiting.
 */
export declare function messageSource(port: TablePort): TableSource & {
    dispose(): void;
};
/**
 * The pages a host sends a property inspector across `port`, in the wire format: each `showProps`
 * and `empty` is a page, and a matrix is asked for with `requestMatrix`. Its first listener says
 * `ready`, which asks the host for what the inspector shows now.
 *
 * For an inspector whose host follows a table elsewhere (another page, another webview); an
 * inspector beside its table follows the table's handle instead.
 */
export declare function inspectorFeed(port: TablePort): InspectorFeed & {
    dispose(): void;
};
