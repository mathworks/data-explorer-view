// Copyright 2026 The MathWorks, Inc.
//
// The app shell's keyboard chords: each written once as text ('Mod+Shift+E', 'Mod+`',
// 'Alt+ArrowLeft', 'Ctrl+Tab'), then matched against a key press and labelled for a tooltip from
// that one text, so the shortcut a button names is the shortcut that works, on either platform.
//
// Mod is the platform's command key: Command on macOS, Ctrl elsewhere, as the prototype's
// `_mod` and view's menu labels have it. Ctrl is a literal Ctrl on every platform, for the chords
// that are Ctrl on macOS too (Ctrl+Tab cycles tabs there as in every browser). Off macOS the two
// are the same key, so a chord naming both is just Ctrl.
//
// A chord matches only with exactly the modifiers it names held. A press with one more is another
// chord: ⌘⇧E is not ⌘E, and Ctrl+Alt+E off macOS is AltGr+E, which types € on many layouts.
//
// DOM-free: a key press is the few KeyboardEvent fields read, so a KeyboardEvent is one without the
// model naming a DOM type, and a test's plain object is another. The platform is passed in for the
// same reason, and so both are tested on one machine.

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

/** The fields of a KeyboardEvent a chord reads. */
interface KeyPress {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

// The tables below are Maps rather than object literals so that a name such as 'constructor' finds
// nothing instead of what Object.prototype holds under it.

/** The modifiers a chord's text may name, by their lower-case name. */
const MODIFIERS = new Map<string, 'mod' | 'shift' | 'alt' | 'ctrl'>([
  ['mod', 'mod'],
  ['shift', 'shift'],
  ['alt', 'alt'],
  ['ctrl', 'ctrl'],
]);

/**
 * Keys a chord also matches by their place on the keyboard (`KeyboardEvent.code`). The key under
 * Escape types ` on a US layout, but ^ or ² or a dead key on others, and ~ with Shift; Mod+` (the
 * bottom panel, VS Code's terminal chord) means that key wherever it is, as VS Code takes it.
 * Letters are not here: a letter chord means the letter, which a layout such as AZERTY puts
 * somewhere else, and matching its place would fire Mod+A on the key marked Q.
 */
const BY_CODE = new Map<string, string>([['`', 'Backquote']]);

/** Named keys a label writes otherwise than `KeyboardEvent.key` does: macOS's glyphs, and words elsewhere. */
const KEY_LABELS = new Map<string, { mac: string; other: string }>([
  ['ArrowLeft', { mac: '←', other: 'Left' }],
  ['ArrowRight', { mac: '→', other: 'Right' }],
  ['ArrowUp', { mac: '↑', other: 'Up' }],
  ['ArrowDown', { mac: '↓', other: 'Down' }],
]);

/**
 * A chord from its text: modifiers and then the key, joined by '+' ('Mod+Shift+E'). Modifier names
 * are Mod, Shift, Alt and Ctrl, in any case and order; the key is a `KeyboardEvent.key` name
 * ('E', '`', 'ArrowLeft', 'Tab', and '+' itself as 'Mod++'). Throws on an unknown modifier or no
 * key: chords are written in code, and a typo should fail where it is written, not silently never
 * match.
 */
export function parseChord(text: string): Chord {
  // The key is everything after the last '+' that is not the text's own last character, so in
  // 'Mod++' it is the final '+'. A key that still ends in '+' ('Mod+', 'Mod+Shift+') is none.
  const split = text.length > 1 ? text.lastIndexOf('+', text.length - 2) : -1;
  const key = text.slice(split + 1);
  if (key === '' || (key.length > 1 && key.endsWith('+'))) throw new Error(`The chord '${text}' names no key.`);
  const chord: Chord = { key: key.length === 1 ? key.toUpperCase() : key, mod: false, shift: false, alt: false, ctrl: false };
  if (split < 0) return chord;
  for (const name of text.slice(0, split).split('+')) {
    const modifier = MODIFIERS.get(name.toLowerCase());
    if (modifier === undefined) throw new Error(`The chord '${text}' names '${name}', which is not a modifier (Mod, Shift, Alt, Ctrl).`);
    chord[modifier] = true;
  }
  return chord;
}

/**
 * Whether the key press `e` is `chord`, on macOS when `mac`. The modifiers held must be exactly the
 * chord's. A letter matches in either case, since Shift (or Caps Lock) changes `e.key`'s; a key in
 * BY_CODE matches by its place too.
 */
export function matchesChord(
  chord: Chord,
  e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  mac: boolean,
): boolean {
  const meta = mac && chord.mod;
  const ctrl = chord.ctrl || (!mac && chord.mod);
  if (e.metaKey !== meta || e.ctrlKey !== ctrl || e.shiftKey !== chord.shift || e.altKey !== chord.alt) return false;
  return keyMatches(chord.key, e);
}

/** Whether `e` is the chord's key, ignoring the modifiers. */
function keyMatches(key: string, e: KeyPress): boolean {
  if (e.key.toLowerCase() === key.toLowerCase()) return true;
  const code = BY_CODE.get(key);
  return code !== undefined && e.code === code;
}

/**
 * The chord as a tooltip or a menu writes it: '⌘⇧E' on macOS, 'Ctrl+Shift+E' elsewhere. The
 * modifiers go in one order on both, Ctrl, Mod, Alt, Shift: the order the prototype's tooltips
 * wrote Mod and Shift in. Arrow keys are macOS's glyphs there and words elsewhere ('⌥←',
 * 'Alt+Left'); a letter is upper case, and any other key is written as it is named.
 */
export function chordLabel(chord: Chord, mac: boolean): string {
  const named = KEY_LABELS.get(chord.key);
  const key = named ? (mac ? named.mac : named.other) : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  if (mac) {
    return `${chord.ctrl ? '⌃' : ''}${chord.mod ? '⌘' : ''}${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}${key}`;
  }
  const parts: string[] = [];
  if (chord.ctrl || chord.mod) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}
