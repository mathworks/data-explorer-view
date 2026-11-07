// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Open from URL… (ShellHost.fetchUrl): for a host that fetches files from web
// addresses, a row of the palette and a button of the welcome ask for one in the shell's dialog,
// and the file the host fetched opens in a tab; what the host says of an address it did not fetch
// is said as it said it. And Copy Link (ShellHost.linkFor): the host is asked for the address that
// opens the open files again at the active tab's selected entry, which the shell copies, saying
// which files the link leaves out. A host with neither (the VS Code extension, a page that does not
// fetch) offers none of it, and asks nothing.
import { describe, expect, it, vi } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import { NO_LINK } from '../../src/widgets/app-shell/connect/shareLinks.js';
import type { ShellHost, ShellLink, ShellLinkRequest } from '../../src/widgets/app-shell/connect/types.js';
import {
  at,
  confirmButton,
  confirmDialog,
  docsArea,
  logPanel,
  open,
  palette,
  sectionOf,
  selectRow,
  selectTab,
  settled,
  startPage,
  tabNames,
  toastTexts,
  until,
  type Page,
} from './harness.js';

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

describe('Copy Link', () => {
  const LINK = 'https://dex.example/?files=samples/params.sldd|samples/ParamMat.mat#entry=Kp&section=Design%20Data';
  /** A host's linkFor answering `answer`, recording what it is asked. */
  function linkFor(answer: ShellLink = { url: LINK, left: [] }) {
    const asked: ShellLinkRequest[] = [];
    const fn = (request: ShellLinkRequest): ShellLink => (asked.push(request), answer);
    return { fn, asked, last: () => asked.at(-1)! };
  }
  /** A page with both files open, params.sldd active, through a host with `link`. */
  async function linkedPage(link = linkFor(), more: Partial<ShellHost> = {}): Promise<Page> {
    const page = startPage(FILES, { host: { linkFor: link.fn, ...more } });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await selectTab('params.sldd');
    return page;
  }
  const BOTH = [
    { path: at('params.sldd'), name: 'params.sldd' },
    { path: at('ParamMat.mat'), name: 'ParamMat.mat' },
  ];

  it('is offered nowhere by a host that makes no links', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    expect(paletteRows(page).map((c) => c.id)).not.toContain('copy-link');
  });

  it("copies the host's link to the open files at the selected entry, and says so", async () => {
    const link = linkFor();
    const page = await linkedPage(link);
    await selectRow('params.sldd', 'Kp');
    page.command('copy-link');
    await until(() => page.main.copied.length === 1);
    expect(link.last()).toEqual({ files: BOTH, at: { path: at('params.sldd'), entry: 'Kp', section: 'Design Data' } });
    expect(page.main.copied).toEqual([LINK]);
    await until(() => toastTexts().includes('Link copied'));
  });

  it("names no entry for a section's row, none at Root, and a MAT-file's variable by itself", async () => {
    const link = linkFor();
    const page = await linkedPage(link);
    const section = await sectionOf('params.sldd', 'Design Data');
    await selectRow('params.sldd', section.Name.label);
    page.command('copy-link');
    await until(() => page.main.copied.length === 1);
    expect(link.last().at).toEqual({ path: at('params.sldd') });
    page.command('show-graph');
    await until(() => tabNames().length === 2 && !document.querySelector('.doc-panel:not([hidden])'));
    page.command('copy-link');
    await until(() => page.main.copied.length === 2);
    expect(link.last()).toEqual({ files: BOTH });
    await selectTab('ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    page.command('copy-link');
    await until(() => page.main.copied.length === 3);
    expect(link.last().at).toEqual({ path: at('ParamMat.mat'), entry: 'ParamMat' });
  });

  it('is greyed in the palette, and says why and copies nothing, while no open file has an address', async () => {
    const page = await linkedPage(linkFor({ url: null, left: ['params.sldd', 'ParamMat.mat'] }));
    expect(paletteRows(page).find((c) => c.id === 'copy-link')).toMatchObject({ label: 'Copy Link', disabled: true });
    page.command('copy-link');
    await until(() => toastTexts().includes(NO_LINK));
    expect(page.main.copied).toEqual([]);
  });

  it('names the files the link leaves out, having no address', async () => {
    const page = await linkedPage(linkFor({ url: LINK, left: ['local.sldd'] }));
    page.command('copy-link');
    await until(() => toastTexts().includes('Link copied. Left out, having no web address: local.sldd'));
    expect(page.main.copied).toEqual([LINK]);
  });

  it('says a clipboard that refused it as an error', async () => {
    const page = await linkedPage(linkFor(), { copyText: async () => Promise.reject(new Error('denied')) });
    const log = logged();
    page.command('copy-link');
    await until(() => toastTexts().includes('Could not copy the link: denied'));
    expect(log).toContain('error Could not copy the link: denied');
  });
});
