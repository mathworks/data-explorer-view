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
/** The palette's commands for the shell as `state` says it is, and its panes as `panes` says (none, by default). */
export declare function paletteCommands(state: ToolbarState, panes?: PaneCommands): PaletteCommand[];
