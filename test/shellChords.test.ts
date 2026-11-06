// Copyright 2026 The MathWorks, Inc.
//
// The app shell's keyboard chords (src/model/shell/chords.ts): a chord written once as text
// ('Mod+Shift+E'), matched against a key press on either platform, and labelled the way that
// platform writes it, so the shortcut a button's tooltip names is the one that works.
//
// What it protects: Mod meaning Command on macOS and Ctrl elsewhere, with a literal Ctrl ('Ctrl+Tab')
// meaning Ctrl everywhere; a chord that does not fire when more keys are held than it names (⇧⌘E is
// not ⌘E, and Ctrl+Alt+E on Windows is AltGr+E, a character); a letter that matches whatever case
// Shift gives it; and Mod+` reaching the key under Escape on a layout where it types something else.
import { describe, expect, it } from 'vitest';
import { chordLabel, matchesChord, parseChord } from '../src/model/shell/chords.js';

/** A key press: `key` and the modifiers held (all up unless named). */
function press(key: string, held: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}, code?: string) {
  return {
    key,
    ...(code === undefined ? {} : { code }),
    metaKey: held.meta ?? false,
    ctrlKey: held.ctrl ?? false,
    shiftKey: held.shift ?? false,
    altKey: held.alt ?? false,
  };
}

describe('parseChord', () => {
  it('reads the modifiers and the key', () => {
    expect(parseChord('Mod+Shift+E')).toEqual({ key: 'E', mod: true, shift: true, alt: false, ctrl: false });
    expect(parseChord('Mod+`')).toEqual({ key: '`', mod: true, shift: false, alt: false, ctrl: false });
    expect(parseChord('Alt+ArrowLeft')).toEqual({ key: 'ArrowLeft', mod: false, shift: false, alt: true, ctrl: false });
    expect(parseChord('Ctrl+Tab')).toEqual({ key: 'Tab', mod: false, shift: false, alt: false, ctrl: true });
    expect(parseChord('Mod+e').key).toBe('E');
    expect(parseChord('Mod++').key).toBe('+');
    expect(parseChord('F1')).toEqual({ key: 'F1', mod: false, shift: false, alt: false, ctrl: false });
  });

  it('refuses a modifier it does not know, and a chord with no key', () => {
    expect(() => parseChord('Hyper+E')).toThrow(/Hyper/);
    expect(() => parseChord('constructor+E')).toThrow(/constructor/);
    expect(() => parseChord('Mod+')).toThrow();
    expect(() => parseChord('')).toThrow();
  });
});

describe('matchesChord', () => {
  const explorer = parseChord('Mod+Shift+E');

  it('matches Mod+Shift+E as ⇧⌘E on macOS and Ctrl+Shift+E elsewhere, and not ⌘E', () => {
    expect(matchesChord(explorer, press('E', { meta: true, shift: true }), true)).toBe(true);
    expect(matchesChord(explorer, press('E', { ctrl: true, shift: true }), false)).toBe(true);
    expect(matchesChord(explorer, press('e', { meta: true }), true)).toBe(false);
    // Each platform's Mod is its own: Ctrl on macOS and the Windows key elsewhere are not it.
    expect(matchesChord(explorer, press('E', { ctrl: true, shift: true }), true)).toBe(false);
    expect(matchesChord(explorer, press('E', { meta: true, shift: true }), false)).toBe(false);
  });

  it('does not match with a modifier held that the chord does not name', () => {
    expect(matchesChord(explorer, press('E', { meta: true, shift: true, alt: true }), true)).toBe(false);
    expect(matchesChord(explorer, press('E', { meta: true, shift: true, ctrl: true }), true)).toBe(false);
    expect(matchesChord(explorer, press('E', { ctrl: true, shift: true, alt: true }), false)).toBe(false);
  });

  it('matches letter keys whatever their case', () => {
    expect(matchesChord(explorer, press('e', { meta: true, shift: true }), true)).toBe(true);
    // Caps Lock gives 'W' without Shift.
    expect(matchesChord(parseChord('Mod+w'), press('W', { ctrl: true }), false)).toBe(true);
    expect(matchesChord(parseChord('Mod+w'), press('w', { ctrl: true }), false)).toBe(true);
    expect(matchesChord(parseChord('Mod+W'), press('w', { ctrl: true }), false)).toBe(true);
  });

  it("matches Mod+` on code === 'Backquote' too", () => {
    const panel = parseChord('Mod+`');
    expect(matchesChord(panel, press('`', { ctrl: true }), false)).toBe(true);
    // A layout where the key under Escape types another character (or is a dead key).
    expect(matchesChord(panel, press('^', { ctrl: true }, 'Backquote'), false)).toBe(true);
    expect(matchesChord(panel, press('Dead', { meta: true }, 'Backquote'), true)).toBe(true);
    expect(matchesChord(panel, press('1', { ctrl: true }, 'Digit1'), false)).toBe(false);
  });

  it('matches a literal Ctrl as Ctrl on both platforms, and Alt+Arrow keys', () => {
    const nextTab = parseChord('Ctrl+Tab');
    expect(matchesChord(nextTab, press('Tab', { ctrl: true }), true)).toBe(true);
    expect(matchesChord(nextTab, press('Tab', { ctrl: true }), false)).toBe(true);
    expect(matchesChord(nextTab, press('Tab', { meta: true }), true)).toBe(false);
    expect(matchesChord(nextTab, press('Tab', { ctrl: true, shift: true }), false)).toBe(false);

    const back = parseChord('Alt+ArrowLeft');
    expect(matchesChord(back, press('ArrowLeft', { alt: true }), true)).toBe(true);
    expect(matchesChord(back, press('ArrowLeft', { alt: true }), false)).toBe(true);
    expect(matchesChord(back, press('ArrowLeft'), false)).toBe(false);
    expect(matchesChord(back, press('ArrowRight', { alt: true }), false)).toBe(false);
  });

  it('takes Mod together with Ctrl as just Ctrl off macOS', () => {
    const both = parseChord('Mod+Ctrl+K');
    expect(matchesChord(both, press('k', { ctrl: true }), false)).toBe(true);
    expect(matchesChord(both, press('k', { ctrl: true, meta: true }), true)).toBe(true);
    expect(matchesChord(both, press('k', { meta: true }), true)).toBe(false);
  });
});

describe('chordLabel', () => {
  it("writes ⇧⌘E on macOS (Apple's order, as view's menus do) and Ctrl+Shift+E elsewhere", () => {
    expect(chordLabel(parseChord('Mod+Shift+E'), true)).toBe('⇧⌘E');
    expect(chordLabel(parseChord('Mod+Alt+Shift+Ctrl+E'), true)).toBe('⌃⌥⇧⌘E');
    expect(chordLabel(parseChord('Mod+Alt+Shift+E'), false)).toBe('Ctrl+Alt+Shift+E');
    expect(chordLabel(parseChord('Mod+Shift+E'), false)).toBe('Ctrl+Shift+E');
  });

  it('writes the other modifiers and the named keys each platform\'s way', () => {
    expect(chordLabel(parseChord('Mod+`'), true)).toBe('⌘`');
    expect(chordLabel(parseChord('Mod+`'), false)).toBe('Ctrl+`');
    expect(chordLabel(parseChord('Alt+ArrowLeft'), true)).toBe('⌥←');
    expect(chordLabel(parseChord('Alt+ArrowLeft'), false)).toBe('Alt+Left');
    expect(chordLabel(parseChord('Ctrl+Tab'), true)).toBe('⌃Tab');
    expect(chordLabel(parseChord('Ctrl+Tab'), false)).toBe('Ctrl+Tab');
    expect(chordLabel(parseChord('Mod+Ctrl+K'), false)).toBe('Ctrl+K');
    expect(chordLabel(parseChord('Mod+Ctrl+K'), true)).toBe('⌃⌘K');
  });
});
