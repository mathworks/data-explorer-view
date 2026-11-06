// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The command palette, connected: Mod+Shift+P or F1 (or the `palette` command) opens it with the
// shell's commands, enabled as the toolbar is at that moment, after closing the popovers (one
// Escape must not close two layers); a command run in it is carried out as its button or chord
// would be. And
// the commands that show each view, which the palette lists: the view comes forward, and a view
// with a box (Search, the Terminal) takes the keyboard.
import { afterEach, describe, expect, it } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import { commandWindow, confirmButton, confirmDialog, dirtyTabs, edit, errorDialog, open, palette, searchPanel, settingsPanel, settled, startPage, until, variableEditor, type Page } from './harness.js';

afterEach(() => Reflect.deleteProperty(navigator, 'platform'));

const FILES = { 'params.sldd': 'params.sldd' };
/** The commands the palette was last shown with. */
let shownWith: PaletteCommand[] = [];
function recordShown(): void {
  const show = palette().show.bind(palette());
  palette().show = (commands) => ((shownWith = commands), show(commands));
}
const offered = () => shownWith;
const run = (id: string) => palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id }, bubbles: true, composed: true }));
const viewShown = (page: Page, side: 'left' | 'right' | 'bottom') => (page.shell.layout[side].open ? page.shell.layout[side].view : null);

describe('the command palette', () => {
  it('opens on Mod+Shift+P with every command, greyed as the toolbar is now, and closes the popovers first', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const page = startPage(FILES);
    recordShown();
    await open(page, 'params.sldd');
    page.command('settings');
    expect(settingsPanel().open).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(palette().open).toBe(true);
    expect(settingsPanel().open).toBe(false);
    const ids = offered().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['open-file', 'save', 'show-search', 'show-terminal', 'settings', 'about']));
    expect(offered().find((c) => c.id === 'save')!.disabled).toBe(true);
    expect(!!offered().find((c) => c.id === 'save-as')!.disabled).toBe(false);
    palette().close();
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('palette');
    expect(!!offered().find((c) => c.id === 'save')!.disabled).toBe(false);
  });

  it('does not open over a modal the shell has up: a question, the error dialog, the variable editor', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const page = startPage(FILES, { without: ['confirmClose', 'confirmReload'] });
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const chord = () => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, composed: true, cancelable: true }));
    // A question the close asks.
    page.command('close-tab');
    await until(() => confirmDialog().hasAttribute('open'));
    chord();
    page.command('palette');
    expect(palette().open).toBe(false);
    (await confirmButton('Cancel')).click();
    await until(() => !confirmDialog().hasAttribute('open'));
    // The error dialog, and the variable editor.
    errorDialog().show({ title: 'Could Not Save params.sldd', reason: 'The disk is full.' });
    page.command('palette');
    expect(palette().open).toBe(false);
    errorDialog().close();
    variableEditor().show(document.body, { name: 'Kp', className: 'double', dims: [2, 2], nodeId: 'n' });
    page.command('palette');
    expect(palette().open).toBe(false);
    variableEditor().close();
    // And with none up, it opens.
    page.command('palette');
    expect(palette().open).toBe(true);
  });

  it('carries out a command run in it, as its button would', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('palette');
    run('save');
    await until(() => dirtyTabs().length === 0);
    expect(page.main.saves).toHaveLength(1);
  });

  it("shows each view from its command, and gives Search's box the keyboard", async () => {
    const page = startPage();
    await until(() => !!page.shell.shadowRoot?.querySelector('button[data-view="search"]'));
    for (const [id, side, view] of [
      ['show-gallery', 'left', 'gallery'],
      ['show-raw', 'right', 'raw'],
      ['show-log', 'bottom', 'log'],
      ['show-terminal', 'bottom', 'terminal'],
      ['show-properties', 'right', 'properties'],
      ['show-search', 'left', 'search'],
    ] as const) {
      page.command(id);
      expect(viewShown(page, side), id).toBe(view);
    }
    await until(() => searchPanel().shadowRoot?.activeElement?.localName === 'input');
    // A view shown already stays shown: the command brings it forward, it does not close its side.
    page.command('show-search');
    expect(viewShown(page, 'left')).toBe('search');
  });

  it("gives a box the keyboard once its side is drawn, for a side that was closed", async () => {
    const page = startPage();
    await until(() => !!page.shell.shadowRoot?.querySelector('button[data-view="terminal"]'));
    page.shell.toggleView('terminal');
    await page.shell.updateComplete;
    expect(page.shell.layout.bottom.open).toBe(false);
    // Where the side's slot is when the box is asked to take the focus: a box in no slot is not drawn, and takes none.
    const slotted: boolean[] = [];
    const focusInput = commandWindow().focusInput.bind(commandWindow());
    commandWindow().focusInput = () => (slotted.push(!!page.shell.shadowRoot!.querySelector('slot[name="bottom"]')), focusInput());
    run('show-terminal');
    await settled();
    expect(slotted).toEqual([true]);
    expect(commandWindow().shadowRoot!.activeElement?.localName).toBe('input');
  });

  it("leaves the Terminal's box the keyboard after its chord, past the shell's own focus step", async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const page = startPage();
    await until(() => !!page.shell.shadowRoot?.querySelector('button[data-view="terminal"]'));
    page.command('show-log');
    await settled();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', ctrlKey: true, bubbles: true, cancelable: true }));
    await settled();
    expect(viewShown(page, 'bottom')).toBe('terminal');
    expect(commandWindow().shadowRoot!.activeElement?.localName).toBe('input');
  });
});
