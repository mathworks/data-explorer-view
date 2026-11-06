// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's chords (connect/keys.ts): which key does which command, on either platform, heard on
// the window wherever the focus is, but for what a field is typing (where only Save and Open still
// work, as in any editor) and what a widget has taken for itself (a table's own Cmd/Ctrl+Z). With
// a native menu, which owns the File and Edit chords and fires them itself, only those it cannot
// have are answered here. Each chord answered is spent (preventDefault), so the browser does not
// also print, or open its own Open dialog.
import { afterEach, describe, expect, it } from 'vitest';
import { SHELL_CHORDS, installKeys } from '../../src/widgets/app-shell/connect/keys.js';
import type { ShellCommand } from '../../src/widgets/app-shell/connect/types.js';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, 'platform');
});
const onPlatform = (name: string) => Object.defineProperty(navigator, 'platform', { value: name, configurable: true });

/** Install the chords, and what they ran. */
function listen(options: { nativeMenu?: boolean } = {}): ShellCommand[] {
  const ran: ShellCommand[] = [];
  stops.push(installKeys((c) => ran.push(c), options));
  return ran;
}

/** A keydown from `from` (the body by default), and whether it was spent. */
function press(init: KeyboardEventInit, from: EventTarget = document.body): boolean {
  const e = new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init });
  from.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('the shell answers its chords', () => {
  it('off macOS, with Ctrl', () => {
    onPlatform('Win32');
    const ran = listen();
    const all: [KeyboardEventInit, ShellCommand][] = [
      [{ key: 'o', ctrlKey: true }, 'open-file'],
      [{ key: 'O', ctrlKey: true, shiftKey: true }, 'open-folder'],
      [{ key: 's', ctrlKey: true }, 'save'],
      [{ key: 'S', ctrlKey: true, shiftKey: true }, 'save-as'],
      [{ key: 's', ctrlKey: true, altKey: true }, 'save-all'],
      [{ key: 'w', ctrlKey: true }, 'close-tab'],
      [{ key: 'Tab', ctrlKey: true }, 'next-tab'],
      [{ key: 'Tab', ctrlKey: true, shiftKey: true }, 'previous-tab'],
      [{ key: 'f', ctrlKey: true }, 'focus-filter'],
      [{ key: 'ArrowLeft', altKey: true }, 'back'],
      [{ key: 'ArrowRight', altKey: true }, 'forward'],
      [{ key: 'ArrowUp', altKey: true }, 'up'],
      [{ key: ',', ctrlKey: true }, 'settings'],
    ];
    for (const [init] of all) expect(press(init), JSON.stringify(init)).toBe(true);
    expect(ran).toEqual(all.map(([, c]) => c));
  });

  it('on macOS, with Command, but Ctrl+Tab, which is Ctrl there too; and Option+S, which types ß', () => {
    onPlatform('MacIntel');
    const ran = listen();
    press({ key: 's', metaKey: true });
    press({ key: 'ß', code: 'KeyS', metaKey: true, altKey: true });
    press({ key: 'Tab', ctrlKey: true });
    // Ctrl+S is not Save on a Mac.
    expect(press({ key: 's', ctrlKey: true })).toBe(false);
    expect(ran).toEqual(['save', 'save-all', 'next-tab']);
  });

  it('leaves a press with a modifier more, or a key no chord names, alone', () => {
    onPlatform('Win32');
    const ran = listen();
    expect(press({ key: 's', ctrlKey: true, shiftKey: true, altKey: true })).toBe(false);
    expect(press({ key: 'q', ctrlKey: true })).toBe(false);
    expect(press({ key: 's' })).toBe(false);
    expect(ran).toEqual([]);
  });

  it('while a field takes the typing, answers only Save and Open', () => {
    onPlatform('Win32');
    const ran = listen();
    const input = document.createElement('input');
    document.body.append(input);
    expect(press({ key: 'w', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 'f', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 'ArrowLeft', altKey: true }, input)).toBe(false);
    expect(press({ key: 's', ctrlKey: true }, input)).toBe(true);
    expect(press({ key: 'o', ctrlKey: true }, input)).toBe(true);
    expect(ran).toEqual(['save', 'open-file']);
  });

  it('reads the field off the composed path, through a shadow root', () => {
    onPlatform('Win32');
    const ran = listen();
    const host = document.createElement('div');
    document.body.append(host);
    const input = document.createElement('textarea');
    host.attachShadow({ mode: 'open' }).append(input);
    expect(press({ key: 'w', ctrlKey: true }, input)).toBe(false);
    expect(ran).toEqual([]);
  });

  it('leaves a press a widget has already taken', () => {
    onPlatform('Win32');
    const ran = listen();
    const table = document.createElement('div');
    document.body.append(table);
    table.addEventListener('keydown', (e) => e.preventDefault());
    press({ key: 'f', ctrlKey: true }, table);
    expect(ran).toEqual([]);
  });

  it('answers a held chord once, but for the tab and history moves, which repeat', () => {
    onPlatform('Win32');
    const ran = listen();
    press({ key: 's', ctrlKey: true, repeat: true });
    press({ key: ',', ctrlKey: true, repeat: true });
    press({ key: 'Tab', ctrlKey: true, repeat: true });
    press({ key: 'ArrowLeft', altKey: true, repeat: true });
    expect(ran).toEqual(['next-tab', 'back']);
  });

  it('with a native menu, answers only Back, Forward, Up, Save All and Settings', () => {
    onPlatform('Win32');
    const ran = listen({ nativeMenu: true });
    expect(press({ key: 's', ctrlKey: true })).toBe(false);
    expect(press({ key: 'o', ctrlKey: true })).toBe(false);
    expect(press({ key: 'w', ctrlKey: true })).toBe(false);
    expect(press({ key: 'Tab', ctrlKey: true })).toBe(false);
    press({ key: 'ArrowUp', altKey: true });
    press({ key: 's', ctrlKey: true, altKey: true });
    press({ key: ',', ctrlKey: true });
    expect(ran).toEqual(['up', 'save-all', 'settings']);
    expect(SHELL_CHORDS.filter((c) => c.withNativeMenu).map((c) => c.command)).toEqual(['save-all', 'back', 'forward', 'up', 'settings']);
  });

  it('stops answering once taken away', () => {
    onPlatform('Win32');
    const ran: ShellCommand[] = [];
    const stop = installKeys((c) => ran.push(c));
    stop();
    expect(press({ key: 's', ctrlKey: true })).toBe(false);
    expect(ran).toEqual([]);
  });
});
