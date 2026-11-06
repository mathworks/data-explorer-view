import type { ShellCommand } from './types.js';
/** One chord of the shell's. */
export interface ShellChord {
    /** The chord, as the model's chords are written ('Mod+Shift+S'). */
    chord: string;
    /** What it does. */
    command: ShellCommand;
    /** Answered with a native menu too: a menu has no item for it. */
    withNativeMenu?: boolean;
    /** Answered while a field takes the typing. */
    inField?: boolean;
    /** Answered again as a held key repeats: a move, which a person holds to go further. */
    repeats?: boolean;
    /** Left to a table the press is in, which answers it itself. */
    tablesOwn?: boolean;
    /** Off macOS only: a chord of Windows and Linux (Ctrl+Y), which is no chord on a Mac. */
    offMac?: boolean;
}
/** The chords the shell answers, in the order the toolbar and the menus list them. */
export declare const SHELL_CHORDS: readonly ShellChord[];
/** The chord of `command`, as written in SHELL_CHORDS (its first, for one with two), or none. */
export declare function chordOf(command: ShellCommand): string | undefined;
/** Whether the page runs on macOS, where Mod is Command: read at each press, as the shell reads it. */
export declare function onMac(): boolean;
/** How installKeys answers. */
export interface KeyOptions {
    /** A native menu has the File and Edit chords: only those it has no item for are answered. */
    nativeMenu?: boolean;
    /**
     * Whether the shell offers `command` now (New, for a host that makes files), asked at each press:
     * the chord of one it does not is left to the page, unspent. Default: every one.
     */
    offers?(command: ShellCommand): boolean;
}
/**
 * Answer the shell's chords on the window with `run`, until the returned function is called. Each
 * chord answered is spent (preventDefault). With `nativeMenu`, only the chords a native menu has
 * no item for: Undo and Redo among the rest are the menu's. A chord of a command the shell does not
 * offer now (`offers`) is not answered.
 */
export declare function installKeys(run: (command: ShellCommand) => void, options?: KeyOptions): () => void;
