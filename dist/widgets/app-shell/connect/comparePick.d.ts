import type { PaletteCommand } from '../modules/dex-command-palette.js';
import type { OpenTab } from './documents.js';
/** What a picked row's id begins with: `pick:<tab id>`, or `pick:browse`. */
export declare const PICK_PREFIX = "pick:";
/** Whether `tab` is a file a compare reads: read, shown in a table, not a project, not a comparison. */
export declare function comparable(tab: OpenTab): boolean;
/** Compare With…'s rows: each other open file a compare reads (its name, its path as the host says it as the category), then Browse…. */
export declare function compareChoices(from: OpenTab, tabs: readonly OpenTab[], titleOf: (path: string) => string): PaletteCommand[];
