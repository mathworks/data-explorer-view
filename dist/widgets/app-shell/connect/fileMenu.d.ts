import type { ContextMenuItem, DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexExplorer } from '../dex-explorer.js';
import { type MatlabAction } from './matlab.js';
import type { ShellTab } from './tabs.js';
/** What the menu's items do, on the tab they were shown for. */
export interface FileMenuActions<T extends ShellTab> {
    /** The open tab of an Explorer file id, if it is still open. */
    tabOf(fileId: string): T | undefined;
    save(tab: T, as: boolean): void;
    close(tab: T): void;
    /** The MATLAB items after the file's own, a separator before them; none without a MATLAB. */
    matlabItems?(tab: T): ContextMenuItem[];
    /** Carry out a MATLAB item chosen on `tab`'s file. */
    runMatlab?(tab: T, id: MatlabAction): void;
}
/** Answer `explorer`'s file menus with `menu`; returns what stops it. */
export declare function connectFileMenu<T extends ShellTab>(explorer: DexExplorer, menu: DexContextMenu, actions: FileMenuActions<T>): () => void;
