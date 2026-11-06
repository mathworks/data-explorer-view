// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's chords (connect/keys.ts): which key does which command, on either platform, heard on
// the window wherever the focus is, but for what a field is typing (where only New, Open and Save
// still work, as in any editor) and what a widget has taken for itself (a table's own Cmd/Ctrl+Z). With
// a native menu, which owns the File and Edit chords and fires them itself, only those it cannot
// have are answered here. Each chord answered is spent (preventDefault), so the browser does not
// also print, or open its own Open dialog. Undo and Redo are answered outside a table and a field
// only: a table answers them itself, and a field undoes its own typing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHELL_CHORDS, installKeys } from '../../src/widgets/app-shell/connect/keys.js';
import type { ShellCommand } from '../../src/widgets/app-shell/connect/types.js';
import { defineTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import { at, dirtyTabs, docTabs, edit, graphShown, open, rowOf, selectRow, settingsPanel, settled, startPage, tabIdOf, tabNames, tableOf, textOf, until } from './harness.js';

const stops: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
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
      [{ key: 'n', ctrlKey: true }, 'new-file'],
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
      [{ key: 'H', ctrlKey: true, shiftKey: true }, 'show-graph'],
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
    press({ key: 'H', metaKey: true, shiftKey: true });
    // Ctrl+S is not Save on a Mac.
    expect(press({ key: 's', ctrlKey: true })).toBe(false);
    // Shift+Command+G is a browser's Find Previous there, which the graph's chord keeps clear of.
    expect(press({ key: 'G', metaKey: true, shiftKey: true })).toBe(false);
    expect(ran).toEqual(['save', 'save-all', 'next-tab', 'show-graph']);
  });

  it('leaves a press with a modifier more, or a key no chord names, alone', () => {
    onPlatform('Win32');
    const ran = listen();
    expect(press({ key: 's', ctrlKey: true, shiftKey: true, altKey: true })).toBe(false);
    expect(press({ key: 'q', ctrlKey: true })).toBe(false);
    expect(press({ key: 's' })).toBe(false);
    expect(ran).toEqual([]);
  });

  it('while a field takes the typing, answers only New, Open and Save', () => {
    onPlatform('Win32');
    const ran = listen();
    const input = document.createElement('input');
    document.body.append(input);
    expect(press({ key: 'w', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 'f', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 'ArrowLeft', altKey: true }, input)).toBe(false);
    expect(press({ key: 's', ctrlKey: true }, input)).toBe(true);
    expect(press({ key: 'o', ctrlKey: true }, input)).toBe(true);
    expect(press({ key: 'n', ctrlKey: true }, input)).toBe(true);
    expect(ran).toEqual(['save', 'open-file', 'new-file']);
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

  it("with a native menu, answers only Back, Forward, Up, Save All, Settings, the palette and Root's graph", () => {
    onPlatform('Win32');
    const ran = listen({ nativeMenu: true });
    expect(press({ key: 's', ctrlKey: true })).toBe(false);
    expect(press({ key: 'o', ctrlKey: true })).toBe(false);
    // New is the menu's File > New.
    expect(press({ key: 'n', ctrlKey: true })).toBe(false);
    expect(press({ key: 'w', ctrlKey: true })).toBe(false);
    expect(press({ key: 'Tab', ctrlKey: true })).toBe(false);
    press({ key: 'ArrowUp', altKey: true });
    press({ key: 's', ctrlKey: true, altKey: true });
    press({ key: ',', ctrlKey: true });
    press({ key: 'P', ctrlKey: true, shiftKey: true });
    press({ key: 'F1' });
    press({ key: 'H', ctrlKey: true, shiftKey: true });
    expect(ran).toEqual(['up', 'save-all', 'settings', 'palette', 'palette', 'show-graph']);
    expect(SHELL_CHORDS.filter((c) => c.withNativeMenu).map((c) => c.command)).toEqual([
      'save-all',
      'back',
      'forward',
      'up',
      'show-graph',
      'settings',
      'palette',
      'palette',
    ]);
  });

  it('leaves the chord of a command the shell does not offer now to the page, asked at each press', () => {
    onPlatform('Win32');
    let offered = false;
    const ran: ShellCommand[] = [];
    stops.push(installKeys((c) => ran.push(c), { offers: (c) => c !== 'new-file' || offered }));
    expect(press({ key: 'n', ctrlKey: true })).toBe(false);
    expect(press({ key: 'o', ctrlKey: true })).toBe(true);
    offered = true;
    expect(press({ key: 'n', ctrlKey: true })).toBe(true);
    expect(ran).toEqual(['open-file', 'new-file']);
  });

  it("opens the palette on F1 as on Mod+Shift+P, which Firefox keeps for its private window", () => {
    for (const platform of ['Win32', 'MacIntel']) {
      onPlatform(platform);
      const ran = listen();
      expect(press({ key: 'F1' })).toBe(true);
      press({ key: 'P', shiftKey: true, ...(platform === 'Win32' ? { ctrlKey: true } : { metaKey: true }) });
      expect(ran).toEqual(['palette', 'palette']);
      for (const stop of stops.splice(0)) stop();
    }
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

describe('Undo and Redo, outside a table', () => {
  it('off macOS: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, each spent', () => {
    onPlatform('Win32');
    const ran = listen();
    expect(press({ key: 'z', ctrlKey: true })).toBe(true);
    expect(press({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(press({ key: 'y', ctrlKey: true })).toBe(true);
    expect(ran).toEqual(['undo', 'redo', 'redo']);
  });

  it('on macOS: Command+Z and Shift+Command+Z; Ctrl+Y is no chord there', () => {
    onPlatform('MacIntel');
    const ran = listen();
    press({ key: 'z', metaKey: true });
    press({ key: 'z', metaKey: true, shiftKey: true });
    expect(press({ key: 'y', ctrlKey: true })).toBe(false);
    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(ran).toEqual(['undo', 'redo']);
  });

  it("are a text field's own, which undoes its typing as the browser does: neither answered nor spent", () => {
    onPlatform('Win32');
    const ran = listen();
    const input = document.createElement('input');
    document.body.append(input);
    expect(press({ key: 'z', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 'y', ctrlKey: true }, input)).toBe(false);
    expect(ran).toEqual([]);
  });

  it("are a table's own, which answers them where its document takes edits, and nowhere else", () => {
    onPlatform('Win32');
    defineTreeTable();
    const ran = listen();
    const table = document.createElement('dex-tree-table');
    document.body.append(table);
    expect(press({ key: 'z', ctrlKey: true }, table)).toBe(false);
    expect(press({ key: 'Z', ctrlKey: true, shiftKey: true }, table)).toBe(false);
    // Its other chords' neighbours are still the shell's there: Save, say.
    expect(press({ key: 's', ctrlKey: true }, table)).toBe(true);
    expect(ran).toEqual(['save']);
  });

  it("with a native menu, are the menu's Edit > Undo and Redo", () => {
    onPlatform('Win32');
    const ran = listen({ nativeMenu: true });
    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(press({ key: 'y', ctrlKey: true })).toBe(false);
    expect(ran).toEqual([]);
  });

  it('go on as the key is held, as an editor\'s do', () => {
    onPlatform('Win32');
    const ran = listen();
    press({ key: 'z', ctrlKey: true });
    press({ key: 'z', ctrlKey: true, repeat: true });
    expect(ran).toEqual(['undo', 'undo']);
  });
});

describe('the chords, connected', () => {
  const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };
  const ctrl = (key: string, more: KeyboardEventInit = {}) => press({ key, ctrlKey: true, ...more });

  it('save, close, cycle the tabs, focus the filter and open files, as the toolbar and a menu would', async () => {
    onPlatform('Win32');
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 1);
    expect(ctrl('s')).toBe(true);
    await until(() => dirtyTabs().length === 0);
    ctrl('Tab');
    await until(() => docTabs().active === tabIdOf('params.sldd'));
    const focus = vi.spyOn(tableOf('params.sldd')!, 'focusFilter');
    ctrl('f');
    await until(() => focus.mock.calls.length === 1);
    ctrl('w');
    await until(() => tabNames().join() === 'ParamMat.mat');
    page.main.picks.push([at('params.sldd')]);
    ctrl('o');
    await until(() => tabNames().join() === 'ParamMat.mat,params.sldd');
  });

  it("Settings opens and closes once a press, though its chord is the shell's action's too", async () => {
    onPlatform('Win32');
    const page = startPage();
    await until(() => !!page.shell.shadowRoot?.querySelector('button[data-action="settings"]'));
    ctrl(',');
    expect(settingsPanel().open).toBe(true);
    ctrl(',');
    expect(settingsPanel().open).toBe(false);
  });

  it("Undo and Redo, with the focus outside the table, take back the active document's edit and make it again", async () => {
    onPlatform('Win32');
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const kp = async () => textOf(await rowOf('params.sldd', 'Kp'));
    expect(ctrl('z')).toBe(true);
    await until(() => dirtyTabs().length === 0);
    expect(await kp()).toBe('1');
    ctrl('y');
    await until(() => dirtyTabs().length === 1);
    expect(await kp()).toBe('5');
    ctrl('z');
    await until(() => dirtyTabs().length === 0);
    ctrl('Z', { shiftKey: true });
    await until(() => dirtyTabs().length === 1);
    expect(await kp()).toBe('5');
  });

  it('pressed in the table, Undo takes back one edit: the table answers, and the shell leaves it', async () => {
    onPlatform('Win32');
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '5');
    await edit('params.sldd', 'Kp', '6');
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '6');
    expect(press({ key: 'z', ctrlKey: true }, tableOf('params.sldd')!)).toBe(true);
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '5');
    await settled();
    expect(textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp'))).toBe('5');
    expect(dirtyTabs()).toEqual(['params.sldd']);
  });

  it("Ctrl+Shift+H shows Root's graph from a tab, the tab kept", async () => {
    onPlatform('Win32');
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    expect(ctrl('H', { shiftKey: true })).toBe(true);
    await until(() => docTabs().hidden && graphShown());
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
  });

  it("'+' in a table adds a child to the selected struct, as Add Child does; typed in its search box, it is the box's", async () => {
    // The prototype's chord, which the shell asks the table for (connectTable's addChildChord).
    const page = startPage({ 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'rt_bin.sldd');
    const specs = await selectRow('rt_bin.sldd', 'Specs');
    const table = tableOf('rt_bin.sldd')!;
    const children = () => table.rows.filter((r) => r.parent === specs.ID).length;
    const before = children();
    const search = document.createElement('input');
    table.append(search);
    expect(press({ key: '+', shiftKey: true }, search)).toBe(false);
    await settled();
    expect(children()).toBe(before);
    expect(press({ key: '+', shiftKey: true }, table)).toBe(true);
    await until(() => children() > before);
    await until(() => dirtyTabs().join() === 'rt_bin.sldd');
  });

  it('with a native menu, leaves Save to the menu, which sends it through the handle', async () => {
    onPlatform('Win32');
    const page = startPage(FILES, { nativeMenu: true });
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    expect(ctrl('s')).toBe(false);
    await settled();
    expect(dirtyTabs()).toEqual(['params.sldd']);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
  });
});
