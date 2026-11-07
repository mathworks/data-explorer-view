import type { DexAppShell } from '../dex-app-shell.js';
import type { OpenTab } from './documents.js';
import { type MatlabAction } from './matlab.js';
import type { ContextMenuItem } from '../../context-menu/dex-context-menu.js';
import type { ShellParts } from './parts.js';
import type { ShellCommand } from './types.js';
import type { Rect } from '../../../model/shell/placement.js';
/** Whether `id` is a command the shell carries out: what a part sends as one may be anything. */
export declare function isShellCommand(id: string): id is ShellCommand;
/** What connectShell does for its parts' requests. */
export interface ShellRequests {
    command(id: ShellCommand): void;
    /** The open tab of a part's id for it. */
    tabOf(id: string): OpenTab | undefined;
    activate(tab: OpenTab): void;
    /** Close `tab`, asking first about unsaved edits. */
    close(tab: OpenTab): void;
    save(tab: OpenTab, as: boolean): void;
    pin(tab: OpenTab): void;
    /** Move `tab` to `index` of the pane `pane`, its place once moved: along its row, or into the other pane's. */
    move(tab: OpenTab, index: number, pane: number): void;
    /** The pane of a tab row (0 the left), or -1 for none of the panes' rows. */
    paneOfRow(row: EventTarget | null): number;
    /** The user is in the pane `pane` now: a press, or the keyboard's focus, came into it. */
    focusPane(pane: number): void;
    /** `tab` was dropped on the documents of the pane `pane`: move it there, or with `side`, into a new pane on that side. */
    drop(tab: OpenTab, pane: number, side?: 'left' | 'right'): void;
    /** The divider between the panes was moved: the left pane takes `ratio` of the width. */
    resized(ratio: number): void;
    /** Show the Explorer's Root: no document. */
    showRoot(): void;
    /** Go to the location bar's segment `index`. */
    toStep(index: number): void;
    /** Toggle the Settings or About popover beside `anchor`. */
    toggle(id: 'settings' | 'about', anchor: Rect): void;
    /** The user brought the view `view` forward, or opened or closed its side. */
    viewChanged(view: string | null, open: boolean): void;
    /** The MATLAB items an open file's menu in the Explorer ends with; none without a MATLAB. */
    matlabItems?(tab: OpenTab): ContextMenuItem[];
    /** Carry out a MATLAB item chosen on a file's menu. */
    runMatlab?(tab: OpenTab, id: MatlabAction): void;
}
/** Answer `parts`' requests with `on`; returns what stops it. */
export declare function connectRequests(shell: DexAppShell, parts: ShellParts, on: ShellRequests): () => void;
