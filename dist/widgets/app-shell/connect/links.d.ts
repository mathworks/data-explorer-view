import type { LinkTarget } from '../../../model/ids/linkTarget.js';
/** Where a link leads. */
export interface LinkDestination {
    /** The file to open, absolute. */
    path: string;
    /** The row to select there, by name (an entry, a variable, or a block's key). */
    select?: string;
}
/** The folder of the file at `path`, either separator. */
export declare function folderOf(path: string): string;
/** Where `link`, in the file at `fromPath`, leads: the file to open, and the row to select there by name. */
export declare function linkDestination(link: LinkTarget, fromPath: string): LinkDestination;
/**
 * The path a project page's link names: `rel` (`models/plant.slx`, `../Lib`, either separator)
 * from the project's folder `root`, with `.` and `..` resolved.
 */
export declare function projectLinkPath(root: string, rel: string): string;
