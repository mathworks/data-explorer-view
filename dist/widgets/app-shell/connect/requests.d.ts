import type { DexAppShell } from '../dex-app-shell.js';
import type { OpenTab } from './documents.js';
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
    /** Move `tab` to `index`, its place once moved. */
    move(tab: OpenTab, index: number): void;
    /** Show the Explorer's Root: no document. */
    showRoot(): void;
    /** Go to the location bar's segment `index`. */
    toStep(index: number): void;
    /** Toggle the Settings or About popover beside `anchor`. */
    toggle(id: 'settings' | 'about', anchor: Rect): void;
    /** The user brought the view `view` forward, or opened or closed its side. */
    viewChanged(view: string | null, open: boolean): void;
}
/** Answer `parts`' requests with `on`; returns what stops it. */
export declare function connectRequests(shell: DexAppShell, parts: ShellParts, on: ShellRequests): () => void;
