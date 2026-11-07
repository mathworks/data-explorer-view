import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { PromptOptions } from '../dex-confirm-dialog.js';
import type { ShellLink, ShellLinkFile, ShellLinkRequest } from './types.js';
/** What Open from URL… asks. */
export declare const OPEN_URL_PROMPT: PromptOptions;
/** What Copy Link says when none of the open files has an address. */
export declare const NO_LINK = "None of the open files has a web address to link to.";
/** The tab a link is made at: its path, its table's selection and rows. */
export interface LinkTab {
    path: string;
    selection: readonly string[];
    rows: readonly TreeTableRow[];
}
/** The request for a link to `files` (every open tab, pane by pane) at `tab`'s selection; at Root, `tab` is undefined. */
export declare function linkRequestOf(files: readonly ShellLinkFile[], tab: LinkTab | undefined): ShellLinkRequest;
/** What Copy Link says once it has copied `link`: "Link copied", or a warning naming the files left out. */
export declare function copiedNote(link: ShellLink): {
    level: 'info' | 'warning';
    text: string;
};
