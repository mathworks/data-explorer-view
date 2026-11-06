/** A chord, parsed. */
export interface Chord {
    /** The key, as `KeyboardEvent.key` names it; a letter is upper case. */
    key: string;
    /** The platform's command key: Command on macOS, Ctrl elsewhere. */
    mod: boolean;
    /** Shift. */
    shift: boolean;
    /** Alt, which macOS calls Option. */
    alt: boolean;
    /** A literal Ctrl, on every platform: not the same as `mod` on macOS. */
    ctrl: boolean;
}
/** The fields of a KeyboardEvent a chord reads: a KeyboardEvent is one. */
export interface KeyPress {
    /** The character or named key typed. Chrome's autofill sends a keydown without one. */
    key: string;
    /** Where the key is on the keyboard, named for a US layout ('KeyS', 'Backquote'). */
    code?: string;
    /** Command on macOS; the Windows key elsewhere, which no chord here names. */
    metaKey: boolean;
    /** Ctrl: Mod off macOS, and a literal Ctrl on every platform. */
    ctrlKey: boolean;
    /** Shift. */
    shiftKey: boolean;
    /** Alt, which macOS calls Option. */
    altKey: boolean;
}
/**
 * A chord from its text: modifiers and then the key, joined by '+' ('Mod+Shift+E'). Modifier names
 * are Mod, Shift, Alt and Ctrl, in any case and order; the key is a `KeyboardEvent.key` name
 * ('E', '`', 'ArrowLeft', 'Tab'; a final '+' is the key itself). A character typed with Shift is
 * written with Shift ('Mod+Shift+?'), since the press holds Shift too and the modifiers must be
 * exactly the chord's; which characters those are depends on the layout (? and + need Shift on a
 * US keyboard, and + does not on a German one), so such chords suit one layout best. Throws on an
 * unknown modifier or no key: chords are written in code, and a typo should fail where it is
 * written, not silently never match.
 */
export declare function parseChord(text: string): Chord;
/**
 * Whether the key press `e` is `chord`, on macOS when `mac`. The modifiers held must be exactly the
 * chord's. A letter matches in either case, since Shift (or Caps Lock) changes `e.key`'s; a letter
 * or digit also matches by its place when the press types no Latin letter or digit, and a key in
 * BY_CODE by its place always. A press with no key matches nothing.
 */
export declare function matchesChord(chord: Chord, e: KeyPress, mac: boolean): boolean;
/**
 * The chord as a tooltip or a menu writes it: '⇧⌘E' on macOS, 'Ctrl+Shift+E' elsewhere. On macOS
 * the modifiers go in Apple's order, ⌃⌥⇧⌘, which is the order view's own menus write ('⇧⌘Z' for
 * Redo), so the shell's tooltips and a table's menu agree; elsewhere Ctrl, Alt, Shift. Arrow keys
 * are macOS's glyphs there and words elsewhere ('⌥←', 'Alt+Left'); a letter is upper case, and any
 * other key is written as it is named.
 */
export declare function chordLabel(chord: Chord, mac: boolean): string;
