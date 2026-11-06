import type { BrowserSource } from './files.js';
import { type BrowserDir } from './walk.js';
/** One thing dropped: a file, by its name and what reads it, or a folder. */
export type DroppedItem = {
    kind: 'file';
    name: string;
    source: BrowserSource;
} | {
    kind: 'folder';
    dir: BrowserDir;
};
/**
 * The files and folders of a drop, in the order they were dropped. Call it from the drop's
 * listener (see the file's header): what the drop holds is asked for at once, and read after. A
 * folder read through its entries stops at `limit` files, and says it did (BrowserDir `truncated`).
 */
export declare function dropSources(data: DataTransfer, limit?: number): Promise<DroppedItem[]>;
