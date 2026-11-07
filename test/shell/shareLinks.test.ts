// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Open from URL… (ShellHost.fetchUrl): for a host that fetches files from web
// addresses, a row of the palette and a button of the welcome ask for one in the shell's dialog,
// and the file the host fetched opens in a tab; what the host says of an address it did not fetch
// is said as it said it. A host with no fetchUrl (the VS Code extension, a page that does not
// fetch) offers none of it, and asks nothing.
import { describe, expect, it, vi } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import type { ShellHost } from '../../src/widgets/app-shell/connect/types.js';
import { at, confirmButton, confirmDialog, docsArea, logPanel, palette, settled, startPage, tabNames, toastTexts, until, type Page } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };

/** The palette's rows as the `palette` command shows them. */
function paletteRows(page: Page): PaletteCommand[] {
  let shown: PaletteCommand[] = [];
  const show = palette().show.bind(palette());
  palette().show = (commands) => ((shown = commands), show(commands));
  page.command('palette');
  palette().show = show;
  palette().close();
  return shown;
}

/** The welcome's buttons, by their text. */
const welcomeButtons = () => [...(docsArea().shadowRoot?.querySelectorAll<HTMLButtonElement>('.welcome button') ?? [])];
const welcomeButton = (label: string) => welcomeButtons().find((b) => b.textContent?.trim() === label);

/** What the Log is given from now on. */
function logged(): string[] {
  const lines: string[] = [];
  const append = logPanel().appendEntry.bind(logPanel());
  logPanel().appendEntry = (entry: LogEntry) => (lines.push(`${entry.level} ${entry.message}`), append(entry));
  return lines;
}

/** Type `text` into the open dialog's field, as the browser does: its value, then an input event. */
async function typeUrl(text: string): Promise<void> {
  await until(() => !!confirmDialog().shadowRoot?.querySelector('input'));
  const input = confirmDialog().shadowRoot!.querySelector('input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await confirmDialog().updateComplete;
}

describe('Open from URL…', () => {
  it('is offered nowhere by a host that fetches no web address, and asks nothing', async () => {
    const page = startPage(FILES);
    await docsArea().updateComplete;
    expect(paletteRows(page).map((c) => c.id)).not.toContain('open-url');
    expect(welcomeButtons().map((b) => b.textContent?.trim())).toEqual(['Open File…', 'Open Folder…']);
    page.command('open-url');
    await settled();
    expect(confirmDialog().hasAttribute('open')).toBe(false);
  });

  it('is a row of the palette and a button of the welcome, which asks for an address in the dialog', async () => {
    const fetchUrl = vi.fn<NonNullable<ShellHost['fetchUrl']>>(async () => at('params.sldd'));
    const page = startPage(FILES, { host: { fetchUrl } });
    await docsArea().updateComplete;
    expect(paletteRows(page).find((c) => c.id === 'open-url')?.label).toBe('Open from URL…');
    expect(welcomeButtons().map((b) => b.textContent?.trim())).toEqual(['Open File…', 'Open Folder…', 'Open from URL…']);
    welcomeButton('Open from URL…')!.click();
    await until(() => confirmDialog().hasAttribute('open'));
    await until(() => !!confirmDialog().shadowRoot?.querySelector('input[type=url]'));
    expect(confirmDialog().shadowRoot!.querySelector('.title')?.textContent).toBe('Open from URL');
  });

  it('opens the file the host fetched from the address typed', async () => {
    const fetchUrl = vi.fn<NonNullable<ShellHost['fetchUrl']>>(async () => at('params.sldd'));
    const page = startPage(FILES, { host: { fetchUrl } });
    page.command('open-url');
    await typeUrl('https://files.example/params.sldd');
    (await confirmButton('Open')).click();
    await until(() => tabNames().join() === 'params.sldd');
    expect(fetchUrl.mock.calls).toEqual([['https://files.example/params.sldd']]);
  });

  it('fetches nothing when the question is cancelled', async () => {
    const fetchUrl = vi.fn<NonNullable<ShellHost['fetchUrl']>>(async () => at('params.sldd'));
    const page = startPage(FILES, { host: { fetchUrl } });
    page.command('open-url');
    (await confirmButton('Cancel')).click();
    await settled();
    expect(fetchUrl).not.toHaveBeenCalled();
    expect(tabNames()).toEqual([]);
  });

  it("says what the host says of an address it did not fetch, as it says it, in a toast and the Log", async () => {
    const problem = 'https://files.example/x.sldd could not be fetched: 404 Not Found';
    const fetchUrl = vi.fn<NonNullable<ShellHost['fetchUrl']>>(async () => Promise.reject(new Error(problem)));
    const page = startPage(FILES, { host: { fetchUrl } });
    const log = logged();
    page.command('open-url');
    await typeUrl('https://files.example/x.sldd');
    (await confirmButton('Open')).click();
    await until(() => toastTexts().includes(problem));
    expect(toastTexts()).toEqual([problem]);
    expect(log).toContain(`error ${problem}`);
    expect(tabNames()).toEqual([]);
  });
});
