import type { ShellCommand } from './types.js';
/** One view of the shell. */
export interface ShellViewSpec {
    /** Its id, as `<dex-shell-view view>` and the shell's layout name it. */
    view: string;
    side: 'left' | 'right' | 'bottom';
    /** Its button's tooltip and its side's header. */
    label: string;
    /** Its button's icon, which ships in icons/. */
    icon: string;
    /** The chord that shows it, or closes its side when it is shown. */
    chord: string;
    /** The command that brings it forward. */
    command: ShellCommand;
}
/** The shell's views, in the order of their buttons on each side. */
export declare const SHELL_VIEWS: readonly ShellViewSpec[];
/** The view a `show-<view>` command brings forward, or none for any other command. */
export declare function viewOfCommand(command: ShellCommand): ShellViewSpec | undefined;
