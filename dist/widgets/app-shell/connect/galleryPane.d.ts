import type { NewEntry, TableView } from '../../../model/source/tableSource.js';
import type { DexGalleryPanel } from '../modules/dex-gallery-panel.js';
/** The file a tile adds to: what the panel shows of it, and the add. */
export interface GalleryTarget {
    /** The file's name, the heading's "Add to …". */
    name: string;
    /** Its table's view, once painted: what the gallery offers. */
    view: TableView | undefined;
    /** Whether the page edits it now: else the tiles are greyed. */
    editable: boolean;
    /** Why it takes no entry, for a file that takes none (a .mdl, a file kept for viewing only); absent, the panel's own note. */
    note?: string;
    /** Add one entry to it: the shell commits a cell editor still open first. */
    add(entry: NewEntry): void | Promise<void>;
}
/** What the panel adds to, and where an add that failed is said. */
export interface GalleryPaneContext {
    /** The active file, or null for none. */
    target(): GalleryTarget | null;
    /** Say that something could not be done, in words for a person. */
    failed(message: string): void;
}
/** Wire `panel` to the active file (`target()`, null for none); refresh() draws it as it is now. */
export declare function connectGalleryPane(panel: DexGalleryPanel, context: GalleryPaneContext): {
    refresh(): void;
    dispose(): void;
};
