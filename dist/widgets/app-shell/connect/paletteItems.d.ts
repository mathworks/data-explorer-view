import type { PaletteCommand } from '../modules/dex-command-palette.js';
import { type ToolbarState } from './toolbarItems.js';
/** The palette's commands for the shell as `state` says it is. */
export declare function paletteCommands(state: ToolbarState): PaletteCommand[];
