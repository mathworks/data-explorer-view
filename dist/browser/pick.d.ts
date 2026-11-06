import { type FilePickers, type UserActivation } from './fsAccess.js';
import type { WebFiles } from './files.js';
import type { BrowserDir } from './walk.js';
/** The extensions the pickers offer: those core reads, as a desktop app's Open dialog offers them. */
export declare const SUPPORTED: string[];
/** The window and document the pickers are shown in, and whether a click or a key press led here. */
export interface PickDeps {
    /** Where the pickers are looked for. */
    window: FilePickers;
    /** Where a file input is made, when there is no picker. */
    document: Document;
    /** Whether a click or a key press led here. Absent, or without `userActivation`: the browser decides. */
    navigator?: UserActivation;
}
/** Ask for files to open: their paths, none when the user cancels. */
export declare function pickFiles(files: WebFiles, deps: PickDeps): Promise<string[]>;
/** Ask for a folder to show; null when the user cancels. */
export declare function pickDirectory(deps: PickDeps): Promise<BrowserDir | null>;
