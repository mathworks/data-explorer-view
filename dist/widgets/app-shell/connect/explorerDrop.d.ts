import type { DragDescriptor } from '../../../model/source/wire.js';
import type { DexExplorer } from '../dex-explorer.js';
import type { OpenTab } from './documents.js';
/** What the Explorer's drops are answered from. */
export interface ExplorerDrops {
    /** The drag of table rows in flight, as the workspace's registers last told it; null for none. */
    drag(): DragDescriptor | null;
    /** The open tab of an Explorer file id. */
    tabOf(fileId: string): OpenTab | undefined;
    /** The open tab of the document opened under `uri`. */
    tabOfUri(uri: string): OpenTab | undefined;
    /** Say what a drop did. */
    dropped(text: string): void;
    /** A mark of what the workspace has said so far, taken as a drop is handed over, for `refused`. */
    mark(): number;
    /**
     * Say why the document refused a drop the Explorer took, unless the workspace said it since `since`
     * (a mark): a move that left its original behind is said by both.
     */
    refused(text: string, since: number): void;
}
/** Answer `explorer`'s drops with `on`; returns what stops it. */
export declare function connectExplorerDrop(explorer: DexExplorer, on: ExplorerDrops): () => void;
