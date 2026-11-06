import type { NameIndex } from '../../../model/search/nameIndex.js';
/** An installed search, as the shell drives it. */
export interface SearchHandle {
    /** The folder's names changed (another folder, or a change in it): read them again when asked. */
    reset(): void;
    /** Stop listening to the box. */
    dispose(): void;
}
/**
 * Search the names `names` gives (the folder shown's) as `input` is typed in: the matches in
 * `results`, in place of `tree` while there is a query; a match clicked, or the first on Enter,
 * goes to `pick` with its file's uri and the name to select there. Escape empties the box.
 */
export declare function installSearch(input: HTMLInputElement, results: HTMLElement, tree: HTMLElement, names: () => NameIndex | undefined, pick: (uri: string, revealName: string) => void): SearchHandle;
