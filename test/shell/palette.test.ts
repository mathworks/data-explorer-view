// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The command palette, connected: Mod+Shift+P (or the `palette` command) opens it with the shell's
// commands, enabled as the toolbar is at that moment, after closing the popovers (one Escape must
// not close two layers); a command run in it is carried out as its button or chord would be. And
// the commands that show each view, which the palette lists: the view comes forward, and a view
// with a box (Search, the Terminal) takes the keyboard.
import { afterEach, describe, expect, it } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import { dirtyTabs, edit, open, palette, searchPanel, settingsPanel, startPage, until, type Page } from './harness.js';

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
});
