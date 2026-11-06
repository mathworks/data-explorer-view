import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { ExplorerFile, ExplorerGroup } from '../dex-explorer.js';
/** The kinds of file the shell opens: every heading of the Explorer's but Other. */
export type FileKind = Exclude<ExplorerGroup, 'other'>;
/** The icon of each kind of file, on its Explorer row, its tab and its location segment. */
export declare const FILE_ICONS: Readonly<Record<FileKind, string>>;
/** What the status bar calls each kind of file. */
export declare const FILE_FORMATS: Readonly<Record<FileKind, string>>;
/** The heading the file at `path` goes under, by its name: core's kind tests, which a tab's label agrees with. */
export declare function fileGroupOf(path: string): ExplorerGroup;
/** An open tab, as the Explorer lists it. */
export interface ExplorerTab {
    id: string;
    path: string;
    name: string;
    dirty?: boolean;
    /** Its row's tooltip: its path, as the host says it (ShellHost.pathTitle). Default the path. */
    title?: string;
    /** Its table's last whole paint (TableHandle.view's rows), for its sections; none before the first. */
    rows?: readonly TreeTableRow[];
}
/** The Explorer's files: one per tab, in the order of the tabs (the Explorer sorts them under their headings). */
export declare function explorerFiles(tabs: readonly ExplorerTab[]): ExplorerFile[];
