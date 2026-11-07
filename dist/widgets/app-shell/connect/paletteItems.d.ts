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
/**
 * `commands` with a host's MATLAB group (`matlab`, connectShell's from matlab.ts) among them: after
 * every other group, before Settings and About, as a MATLAB menu would come before a window's own.
 * An empty group leaves the list as it was. A list of its own rather than a part of
 * paletteCommands, so what the shell lists of itself does not wait on what its host reaches.
 */
export declare function withMatlabCommands(commands: readonly PaletteCommand[], matlab: readonly PaletteCommand[]): PaletteCommand[];
