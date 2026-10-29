import { type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import type { InspectorFeed } from '../../model/source/tableSource.js';
import type { DexPropertyInspector } from './dex-property-inspector.js';
/** How connectInspector wires an inspector. */
export interface ConnectInspectorOptions {
    /**
     * The variable editor the Value row's matrix glyph opens. Default: the feed's own when it is a
     * table's handle (one editor for the table and its inspector), else one connectInspector makes,
     * in `<body>`, and takes away on dispose().
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
    /** Stop: the inspector keeps what it shows and hears nothing more. */
    dispose(): void;
}
/** Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. */
export declare function connectInspector(inspector: DexPropertyInspector, feed: InspectorFeed, options?: ConnectInspectorOptions): InspectorHandle;
