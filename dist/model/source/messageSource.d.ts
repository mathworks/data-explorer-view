import type { EditableTableSource, InspectorFeed } from './tableSource.js';
import type { TablePort } from './wire.js';
/** What a messageSource may be told besides its port. */
export interface MessageSourceOptions {
    /**
     * Hear each message from the host that is not one of the wire's (wire.ts): the host's own, such
     * as the VS Code extension's `openAddGallery`. A message of the wire is never passed here, even
     * one in a shape the source cannot use.
     */
    extra?(message: Record<string, any>): void;
}
/**
 * A TableSource answered by a host across `port`, in the wire format (wire.ts), which also takes
 * edits.
 *
 * `open()` says `ready` and resolves with the next `setRows` (or rejects with the next `error`);
 * `children()` and `matrix()` ask with `requestChildren` and `requestMatrix`; `inspect()` sends a
 * `select` and resolves with the `showProps` or `empty` that answers it. Every later `setRows`,
 * `updateEntryRows`, `insertEntryRows` and `error` reaches the subscribers as a TableChange.
 *
 * Each command posts its editing message at once (`edit()` an `edit`, `undo()` an `undo`), and
 * each editing message the host sends reaches the subscribers as the change it carries:
 * `sectionRules`, `clipboardState` (a `clipboard`), `dragState` (a `drag`), `selectRows` (a
 * `select`), `beginRename`, `validationError` (an `invalid`), `refused` and `editText`.
 *
 * The returned `dispose()` stops listening, and rejects what is still waiting.
 */
export declare function messageSource(port: TablePort, options?: MessageSourceOptions): EditableTableSource & {
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
