import { LitElement, type PropertyValues } from 'lit';
import { type RawView } from '../../../model/raw/rawView.js';
/** What `dex-raw-copy` carries: the whole text the pane shows, which the app puts on the clipboard. */
export interface RawCopyDetail {
    text: string;
}
/**
 * The longest JSON or XML text the pane colours, in characters: a longer one is drawn as plain
 * text. A span per token of a record of megabytes would take the page longer to lay out than the
 * record takes to read.
 */
export declare const RAW_HIGHLIGHT_LIMIT: number;
/**
 * How much of a text the pane draws, in characters: 1 MB, then a line saying how much more there
 * is, as the hex dump stops at 64 KB. Copy sends the whole text all the same.
 */
export declare const RAW_DRAW_LIMIT: number;
/**
 * The Raw pane: what the file holds for the selected row, unrendered, as `TableSource.raw`
 * answers it. A JSON or XML text is coloured (keys, strings, numbers, tags, attributes, comments,
 * each with its `--dex-syntax-*` token), a value's bytes are a hex dump, and either is drawn in a
 * monospaced, scrollable, selectable block under a header naming its format and what it is for
 * (`label`: the row's name, or the file's). The text is drawn as text, never as markup, and its
 * first megabyte alone (RAW_DRAW_LIMIT), then a line saying how much more there is.
 *
 * Copy sends `dex-raw-copy` with the whole text (the dump, for bytes): the app puts it on the
 * clipboard, as only it may. A RawView with nothing to show draws its reason as a muted note; no
 * RawView at all (`raw` null), a note asking for a selection; and `loading`, a note that the answer
 * is on its way, in place of the last one. The pane knows nothing of documents: the app hands it
 * each answer.
 *
 * @tagname dex-raw-viewer
 */
export declare class DexRawViewer extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * What to show: `TableSource.raw`'s answer for the selected row. Null, the default, is no
     * selection, and draws a note asking for one. Property only.
     */
    raw: RawView | null;
    /**
     * The answer for a new selection is on its way: the pane says Loading… in place of the last one,
     * which is no longer the selection's. Set it while `raw()` is asked. Default false. Attribute
     * `loading`.
     */
    loading: boolean;
    /**
     * What `raw` is for, named in the header and in the text's accessible name: the selected row's
     * name, or the file's for its own summary. Default empty: no name. Attribute `label`.
     */
    label: string;
    private _shown;
    protected willUpdate(changed: PropertyValues<this>): void;
    private _copy;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-raw-viewer>`, or under `tag`, and the `<dex-icon>` its Copy button draws. */
export declare function defineRawViewer(tag?: string): void;
/**
 * The events `<dex-raw-viewer>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface RawViewerEventMap {
    /**
     * Copy was pressed: put `text`, the whole text the pane shows (past what it draws of a long one;
     * a value's hex dump, for its bytes), on the clipboard. A request: the pane copies nothing itself.
     */
    'dex-raw-copy': CustomEvent<RawCopyDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-raw-viewer': DexRawViewer;
    }
    interface HTMLElementEventMap extends RawViewerEventMap {
    }
    interface DocumentEventMap extends RawViewerEventMap {
    }
    interface WindowEventMap extends RawViewerEventMap {
    }
}
