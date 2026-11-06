import { type RawView } from '../../../model/raw/rawView.js';
import type { DexRawViewer } from '../modules/dex-raw-viewer.js';
/** What the pane is to show: a document's answers, and the row (or the file itself) to ask for. */
export interface RawTarget {
    /** Which document and row this is, to tell a new one from the same one asked again. */
    key: string;
    /** The document's raw answers; none for one that gives none (a source across a channel). */
    raw?: (rowId: string) => Promise<RawView>;
    /** The selected row, or the document's own uri for the file itself. */
    rowId: string;
    /** What the viewer's header names: the row's name, or the file's. */
    label?: string;
}
/** What the pane reads and where its Copy goes. */
export interface RawPaneContext {
    /** What to show now: null for no document (Root, a project, a file still being read). */
    target(): RawTarget | null;
    /** Whether the pane is on screen: its view shown on an open side. */
    shown(): boolean;
    /** Put text on the clipboard (the host's, or the page's). */
    copy(text: string): Promise<void>;
    /** Say that something could not be done, in words for a person. */
    failed(message: string): void;
}
/** Wire `viewer` to the active document; refresh() shows what it holds now. */
export declare function connectRawPane(viewer: DexRawViewer, context: RawPaneContext): {
    refresh(): void;
    dispose(): void;
};
