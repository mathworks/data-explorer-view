import type { PaletteCommand } from '../modules/dex-command-palette.js';
import { type ToolbarState } from './toolbarItems.js';
/** What the panes' commands would do now, as the open tabs are (connectShell's TabList). */
export interface PaneCommands {
    /** Split Right would move the active tab: it has another tab beside it, or a pane on its right to go to. */
    splitRight: boolean;
    /** Move to Other Pane would move the active tab: there are two panes, or its pane has another tab. */
    moveToOther: boolean;
    /** How many panes there are: none with nothing open, one, or two. */
    panes: number;
}
/** What the Folder view's commands would do now: whether a folder is shown, whether it has one above, what ⟳ does. */
export interface FolderCommands {
    /**
     * Whether the shell has a Folder view, as it was connected (a host that shows folders then). Absent:
     * a host that shows folders now has one (`ToolbarState.canOpenFolder`).
     */
    view?: boolean;
    /** A folder is shown: Read Again reads it (or picks it again). */
    shown: boolean;
    /** The folder shown has one above it the host can open: Up One Level goes there. */
    canUp: boolean;
    /** What Read Again does: read the folder again, or ask for it again (a browser's snapshot). */
    refresh: 'read' | 'pick';
}
/** The commands a host's optional members give, as they stand when the palette opens. */
export interface HostCommands {
    /** ShellHost.fetchUrl is there: Open from URL…. */
    openUrl: boolean;
    /** ShellHost.linkFor is there (null: no Copy Link), and whether it links a file now. */
    copyLink: {
        enabled: boolean;
    } | null;
}
/** What the compare commands would do now. */
export interface CompareCommands {
    /** The active tab is a file a compare reads: Compare With… is enabled. */
    canCompare: boolean;
    /** The active tab is a compare with a change in it: Next and Previous Change are enabled. */
    hasChanges: boolean;
}
/**
 * The palette's commands for the shell as `state` says it is, its panes as `panes` says (none, by
 * default), its folder as `folder` says (none shown, by default), what the host's optional members
 * give as `host` says (none, by default), and a compare as `compare` says (nothing to compare, by
 * default). The Folder view's rows are there where the shell has the view (`folder.view`, else a
 * host that shows folders, `state.canOpenFolder`). Open from URL… is a File row after the ways to
 * open a file the toolbar has, Compare With… after the toolbar's File rows, and Copy Link the File
 * group's last, greyed while the host's link would link no file.
 */
export declare function paletteCommands(state: ToolbarState, panes?: PaneCommands, folder?: FolderCommands, host?: HostCommands, compare?: CompareCommands): PaletteCommand[];
