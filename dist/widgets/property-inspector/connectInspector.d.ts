import { type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import type { InspectorFeed } from '../../model/source/tableSource.js';
import type { DexPropertyInspector } from './dex-property-inspector.js';
/** How connectInspector wires an inspector. */
export interface ConnectInspectorOptions {
    /**
     * The variable editor the Value row's matrix glyph opens. Default: the followed feed's own when
     * it is a table's handle (one editor for the table and its inspector), else one connectInspector
     * makes, in `<body>`, as it first follows such a feed, and takes away on dispose().
     */
    variableEditor?: DexVariableEditor;
    /**
     * What shows while there is nothing to inspect: an element, shown (and the inspector hidden,
     * by `hidden`) while there is nothing; or a function told `true` for nothing and `false` for a
     * page, for a page that hides and shows things its own way. Default: the inspector just shows
     * no rows.
     */
    empty?: HTMLElement | ((empty: boolean) => void);
}
/** A connected inspector: what connectInspector returns. */
export interface InspectorHandle {
    /**
     * Hear a clicked cross-reference (`dex-pi-navigate`'s target), until the returned function is
     * called: a row of a document, to open.
     */
    on(type: 'navigate', listener: (target: string) => void): () => void;
    /**
     * Follow another feed, with the same options and listeners: for one inspector beside several
     * tables, the active table's handle. The inspector empties (its `empty` state) and then shows
     * that feed's pages, from its first (a table's handle sends its selection's page at once).
     * `null` follows none: the empty state, until a feed is followed again. A grid the inspector
     * opened closes; one the table beside it opened in a shared editor stays open. The feed it
     * already follows changes nothing.
     */
    follow(feed: InspectorFeed | null): void;
    /** Stop: the inspector keeps what it shows and hears nothing more. */
    dispose(): void;
}
/**
 * Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. A
 * `null` feed starts it empty, following none until `follow()` gives it one.
 */
export declare function connectInspector(inspector: DexPropertyInspector, feed: InspectorFeed | null, options?: ConnectInspectorOptions): InspectorHandle;
