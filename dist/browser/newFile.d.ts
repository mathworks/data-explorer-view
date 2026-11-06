import type { WebFiles } from './files.js';
import { type SaveDeps } from './save.js';
/** The new files a browser host makes, and the Save of the ones the page keeps itself. */
export declare class NewFiles {
    private readonly files;
    private readonly deps;
    /** The new files the page keeps, with no file on disk: each Save of one downloads it. */
    private readonly kept;
    /** New files among `files`, picked and downloaded through `deps`. */
    constructor(files: WebFiles, deps: SaveDeps);
    /**
     * Where a new file goes, `suggestedName` offered: its path, or null when the user cancels. With
     * the save picker, the file chosen (a file the page has a path for keeps it, and is read from then
     * on through the picker's handle, which the page may write), a new dictionary written there unless
     * the page has it open (`open`) or its name is not a dictionary's; with none, a file the page keeps,
     * holding a new dictionary until a Save.
     */
    make(suggestedName: string, open: (path: string) => boolean): Promise<string | null>;
    /** Whether `path` is a new file the page keeps, whose Save is `save`'s. */
    keeps(path: string): boolean;
    /** Save the kept new file `path`: a download of `bytes` under its name, which the page then holds as the file. */
    save(path: string, bytes: Uint8Array): {
        overwritten: boolean;
    };
}
