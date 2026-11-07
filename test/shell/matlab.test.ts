// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell with a MATLAB its host reaches (ShellHost.matlab), connected: the status bar names the
// MATLAB connected, and goes back to saying nothing when it goes; its button, the palette's
// Connect to MATLAB… and the `matlab-connect` command show the host's way to connect. While one is
// connected, a row's menu, an open file's menu in the Explorer and the palette offer MATLAB's
// commands for what they are on, each sending what it should to the host and saying what came
// back: an evaluation in Properties, Update Diagram's diagnostics in a toast and the Log, a failure
// of the link as an error. A host with no MATLAB (the browser host, the VS Code extension) shows
// none of it anywhere. The MATLAB is test/shell/matlabHost.ts's fake: no MATLAB runs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMenuItem } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { DexPropertyInspector } from '../../src/widgets/property-inspector/dex-property-inspector.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import type { Toast } from '../../src/widgets/app-shell/dex-toast-host.js';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { DexShellStatus } from '../../src/widgets/app-shell/connect/dex-shell-status.js';
import { CONNECTED, fakeMatlab, type FakeMatlab } from './matlabHost.js';
import {
  at,
  choose,
  dirtyTabs,
  edit,
  explorer,
  logPanel,
  open,
  palette,
  rowOf,
  selectRow,
  selectTab,
  settled,
  startPage,
  tabIdOf,
  tableOf,
  textOf,
  toastHost,
  until,
  type Page,
} from './harness.js';

const status = () => document.querySelector<DexShellStatus>('dex-shell-status[slot="status"]')!;
/** The status bar's MATLAB button, once the bar has drawn what it was last given. */
async function matlabButton(): Promise<HTMLButtonElement | null> {
  await status().updateComplete;
  return status().shadowRoot!.querySelector<HTMLButtonElement>('button.matlab');
}

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
const matlabRows = (page: Page) => paletteRows(page).filter((c) => c.category === 'MATLAB');
const run = (id: string) => palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id }, bubbles: true, composed: true }));
const connects = (matlab: FakeMatlab) => matlab.calls.filter((c) => c.name === 'showConnect').length;

describe('a shell host with no MATLAB', () => {
  it('shows no MATLAB in the status bar or the palette', async () => {
    const page = startPage();
    expect(await matlabButton()).toBeNull();
    expect(paletteRows(page).length).toBeGreaterThan(0);
    expect(matlabRows(page)).toEqual([]);
  });
});

describe('a shell host with a MATLAB', () => {
  it('shows no button while none is connected, and offers Connect to MATLAB… in the palette', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    const page = startPage({}, { host: { matlab } });
    expect(await matlabButton()).toBeNull();
    expect(matlabRows(page).map((c) => [c.id, c.label])).toEqual([['matlab-connect', 'Connect to MATLAB…']]);
    page.command('palette');
    run('matlab-connect');
    expect(connects(matlab)).toBe(1);
  });

  it('names the MATLAB connected in the status bar, says when it is busy, and says nothing once it goes', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    startPage({}, { host: { matlab } });
    matlab.set(CONNECTED);
    await until(() => status().matlab !== '');
    const button = (await matlabButton())!;
    expect(button.textContent?.trim()).toBe('MATLAB R2027a');
    expect(button.title).toBe('Connected to MATLAB R2027a (process 4242)');
    matlab.set({ ...CONNECTED, busy: true });
    expect((await matlabButton())!.textContent?.trim()).toBe('MATLAB R2027a (busy)');
    matlab.set({ state: 'off' });
    expect(await matlabButton()).toBeNull();
  });

  it('draws a MATLAB connected before the shell was, as it connects', async () => {
    startPage({}, { host: { matlab: fakeMatlab(CONNECTED) } });
    expect((await matlabButton())?.textContent?.trim()).toBe('MATLAB R2027a');
  });

  it("shows the host's Connect to MATLAB on a press of the button, and on the matlab-connect command", async () => {
    const matlab = fakeMatlab(CONNECTED);
    const page = startPage({}, { host: { matlab } });
    (await matlabButton())!.click();
    expect(connects(matlab)).toBe(1);
    page.command('matlab-connect');
    expect(connects(matlab)).toBe(2);
  });

  it('listens to the MATLAB once, and stops once the shell is disposed', async () => {
    const matlab = fakeMatlab({ state: 'off' });
    const subscribed: string[] = [];
    const on = matlab.on.bind(matlab);
    matlab.on = (listener) => {
      subscribed.push('on');
      const off = on(listener);
      return () => (subscribed.push('off'), off());
    };
    const page = startPage({}, { host: { matlab } });
    expect(subscribed).toEqual(['on']);
    page.handle.dispose();
    expect(subscribed).toEqual(['on', 'off']);
    expect(() => matlab.set(CONNECTED)).not.toThrow();
  });
});

// --- The commands, connected ---------------------------------------------------------------------

const FILES = { 'params.sldd': 'params.sldd', 'shared_gain.slx': 'shared_gain.slx', 'ParamMat.mat': 'ParamMat.mat' };

/** A page over `files` whose host reaches `matlab` (connected unless said). */
function matlabPage(matlab: FakeMatlab = fakeMatlab(CONNECTED), files: Record<string, string> = FILES): { page: Page; matlab: FakeMatlab } {
  return { page: startPage(files, { host: { matlab } }), matlab };
}

const menuEl = () => document.querySelector('dex-context-menu')!;

/** The items the shared menu is shown with next, separators kept, by its show(). */
function nextMenu(): () => ContextMenuItem[] {
  let shown: ContextMenuItem[] = [];
  const menu = menuEl();
  const show = menu.show.bind(menu);
  menu.show = (x, y, items, options) => ((shown = items), show(x, y, items, options));
  return () => {
    menu.show = show;
    return shown;
  };
}

/** The menu a right-click on row `row` of `name` shows, its row selected first, as a click on it would. */
async function rowMenu(name: string, row: string): Promise<ContextMenuItem[]> {
  const r = await selectRow(name, row);
  const shown = nextMenu();
  tableOf(name)!.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: r.ID }, bubbles: true, composed: true }));
  return shown();
}

/** The Explorer's menu of the open file `name`. */
function fileMenu(name: string): ContextMenuItem[] {
  const shown = nextMenu();
  explorer().dispatchEvent(new CustomEvent('dex-explorer-menu', { detail: { fileId: tabIdOf(name), x: 10, y: 20 }, bubbles: true, composed: true }));
  return shown();
}

/** A menu's items as their labels, `—` for a separator. */
const read = (items: ContextMenuItem[]) => items.map((i) => (i.separator ? '—' : i.label));

/** What the toasts and the Log are given from now on. */
function heard(): { toasts: Toast[]; log: string[] } {
  const toasts: Toast[] = [];
  const log: string[] = [];
  const show = toastHost().show.bind(toastHost());
  vi.spyOn(toastHost(), 'show').mockImplementation((toast) => (toasts.push(toast), show(toast)));
  const append = logPanel().appendEntry.bind(logPanel());
  logPanel().appendEntry = (entry: LogEntry) => (log.push(`${entry.level} ${entry.message}`), append(entry));
  return { toasts, log };
}
const said = (toasts: Toast[]) => toasts.map((t) => `${t.level} ${t.message}`);
afterEach(() => vi.restoreAllMocks());

const inspector = () => document.querySelector<DexPropertyInspector>('dex-property-inspector')!;
const matlabGroupShown = () => inspector().groups.find((g) => g.title === 'MATLAB');
const commands = (matlab: FakeMatlab) => matlab.calls.filter((c) => c.name !== 'showConnect');

describe("MATLAB's commands", () => {
  it('are offered nowhere while no MATLAB is connected', async () => {
    const { page } = matlabPage(fakeMatlab({ state: 'off' }));
    await open(page, 'params.sldd');
    expect(read(await rowMenu('params.sldd', 'Kp')).at(-1)).toBe('Show in Graph');
    expect(read(fileMenu('params.sldd'))).toEqual(['Save', 'Save As…', '—', 'Close']);
    menuEl().close();
  });

  it("end a dictionary entry's menu, after a separator, while a MATLAB is connected", async () => {
    const { page } = matlabPage();
    await open(page, 'params.sldd');
    const items = read(await rowMenu('params.sldd', 'Kp'));
    expect(items.slice(items.indexOf('Show in Graph'))).toEqual([
      'Show in Graph',
      '—',
      'Evaluate in MATLAB',
      'Send to Workspace',
      'Get from Workspace',
      "Open in MATLAB's Data Explorer",
    ]);
    menuEl().close();
  });

  it("evaluate a row's value in its section, and show MATLAB's answer in Properties while the value stands", async () => {
    const { page, matlab } = matlabPage();
    await open(page, 'params.sldd');
    const kp = await rowOf('params.sldd', 'Kp');
    await rowMenu('params.sldd', 'Kp');
    choose('matlab-evaluate');
    await until(() => !!matlabGroupShown());
    expect(commands(matlab)).toEqual([{ name: 'evaluate', arg: { expression: textOf(kp), context: { dictionary: at('params.sldd'), section: 'Design Data' } } }]);
    expect(page.shell.layout.right).toMatchObject({ view: 'properties', open: true });
    expect(inspector().groups.at(-1)).toEqual({
      title: 'MATLAB',
      properties: [
        { name: 'In MATLAB', value: '3', multiline: true },
        { name: 'Class', value: 'double' },
        { name: 'Size', value: '1×1' },
      ],
    });
    // The value changed: the answer was of the value it was.
    await edit('params.sldd', 'Kp', '7');
    await until(() => !matlabGroupShown());
  });

  it("show an expression's own error as MATLAB's answer, and let every answer go when MATLAB does", async () => {
    const { page, matlab } = matlabPage();
    await open(page, 'params.sldd');
    matlab.answer('evaluate', { error: { identifier: 'MATLAB:UndefinedFunction', message: "Unrecognized function or variable 'Kp'." } });
    await rowMenu('params.sldd', 'Kp');
    choose('matlab-evaluate');
    await until(() => !!matlabGroupShown());
    expect(matlabGroupShown()!.properties).toEqual([{ name: 'In MATLAB', value: "Error: Unrecognized function or variable 'Kp'.", multiline: true }]);
    matlab.set({ state: 'off' });
    await until(() => !matlabGroupShown());
  });

  it("open a model's block in Simulink, and offer a block Update Diagram and the Data Explorer", async () => {
    const { page, matlab } = matlabPage();
    const { toasts } = heard();
    await open(page, 'shared_gain.slx');
    const gain = await rowOf('shared_gain.slx', 'PlantGain');
    const items = read(await rowMenu('shared_gain.slx', 'PlantGain'));
    expect(items.slice(items.indexOf('Show in Graph') + 2)).toEqual(['Open in Simulink', 'Update Diagram', "Open in MATLAB's Data Explorer"]);
    choose('matlab-open');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]).toEqual({ name: 'open', arg: { model: at('shared_gain.slx'), block: gain._blockPath } });
    await until(() => said(toasts).includes(`info Opened shared_gain in Simulink at ${gain._blockPath}`));
  });

  it("open a model's data source row in the Data Explorer as the model, naming no entry MATLAB would refuse", async () => {
    const { page, matlab } = matlabPage(fakeMatlab(CONNECTED), { 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'shadow_ws.slx');
    const items = read(await rowMenu('shadow_ws.slx', 'params.sldd'));
    expect(items.slice(items.indexOf('Show in Graph') + 2)).toEqual(['Open in Simulink', 'Update Diagram', "Open in MATLAB's Data Explorer"]);
    choose('matlab-data-explorer');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]).toEqual({ name: 'openInDataExplorer', arg: { path: at('shadow_ws.slx') } });
  });

  it("say Update Diagram's warnings and errors in a toast, and each in the Log", async () => {
    const { page, matlab } = matlabPage();
    const { toasts, log } = heard();
    await open(page, 'shared_gain.slx');
    matlab.answer('updateDiagram', { model: 'shared_gain', ok: true, errors: [], warnings: [{ message: 'One.' }, { message: 'Two.' }] });
    await rowMenu('shared_gain.slx', 'PlantGain');
    choose('matlab-update-diagram');
    await until(() => said(toasts).includes('warning Updated shared_gain: 2 warnings'));
    expect(log).toEqual(expect.arrayContaining(['warning shared_gain: One.', 'warning shared_gain: Two.']));
    matlab.answer('updateDiagram', { model: 'shared_gain', ok: false, errors: [{ message: 'Bad.' }], warnings: [] });
    await rowMenu('shared_gain.slx', 'PlantGain');
    choose('matlab-update-diagram');
    await until(() => said(toasts).includes('error shared_gain could not be updated: 1 error'));
    expect(log).toContain('error shared_gain: Bad.');
  });

  it('wait for a save before Send and Get, saying why, and get an entry from the workspace into the saved file', async () => {
    const { page, matlab } = matlabPage();
    const { toasts } = heard();
    await open(page, 'params.sldd');
    const matlabItems = (items: ContextMenuItem[]) => items.filter((i) => i.id.startsWith('matlab-'));
    const clean = matlabItems(await rowMenu('params.sldd', 'Kp'));
    expect(clean.map((i) => i.label)).toEqual(['Evaluate in MATLAB', 'Send to Workspace', 'Get from Workspace', "Open in MATLAB's Data Explorer"]);
    expect(clean.filter((i) => i.disabled)).toEqual([]);
    choose('matlab-from-workspace');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]).toEqual({ name: 'fromWorkspace', arg: { file: at('params.sldd'), section: 'Design Data', entry: 'Kp', name: 'Kp' } });
    await until(() => said(toasts).includes('info Wrote Kp from the MATLAB workspace into params.sldd'));
    await edit('params.sldd', 'Uo', '9');
    await until(() => dirtyTabs().length === 1);
    const dirty = matlabItems(await rowMenu('params.sldd', 'Kp'));
    expect(dirty.filter((i) => i.disabled).map((i) => [i.label, i.reason])).toEqual([
      ['Send to Workspace', 'Save the file first: MATLAB reads the saved file.'],
      ['Get from Workspace', 'Save the file first: MATLAB writes the saved file.'],
    ]);
    menuEl().close();
    // Asked for anyway (a native menu's item, say): the reason, and nothing sent.
    page.command('matlab-to-workspace');
    await until(() => said(toasts).includes('info Save the file first: MATLAB reads the saved file.'));
    expect(commands(matlab)).toHaveLength(1);
  });

  it("offer a MAT-file's variable Evaluate in the base workspace, Send, Get and the Data Explorer, which a MATLAB without it does not", async () => {
    const { page, matlab } = matlabPage();
    await open(page, 'ParamMat.mat', 'params.sldd');
    await selectTab('ParamMat.mat');
    const items = read(await rowMenu('ParamMat.mat', 'ParamMat'));
    expect(items.slice(items.indexOf('Show in Graph') + 2)).toEqual(['Evaluate in MATLAB', 'Send to Workspace', 'Get from Workspace', "Open in MATLAB's Data Explorer"]);
    choose('matlab-evaluate');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]!.arg).toEqual({ expression: textOf(await rowOf('ParamMat.mat', 'ParamMat')) });
    matlab.set({ ...CONNECTED, dataExplorer: false });
    expect(read(await rowMenu('ParamMat.mat', 'ParamMat'))).not.toContain("Open in MATLAB's Data Explorer");
    await selectTab('params.sldd');
    expect(read(await rowMenu('params.sldd', 'Kp')).at(-1)).toBe('Open in Model Explorer');
    menuEl().close();
  });

  it("end an open model's menu in the Explorer with its commands, and carry one out on that file", async () => {
    const { page, matlab } = matlabPage();
    await open(page, 'shared_gain.slx', 'params.sldd');
    expect(read(fileMenu('shared_gain.slx'))).toEqual(['Save', 'Save As…', '—', 'Close', '—', 'Open in Simulink', 'Update Diagram', "Open in MATLAB's Data Explorer"]);
    choose('matlab-update-diagram');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]).toEqual({ name: 'updateDiagram', arg: at('shared_gain.slx') });
  });

  it("list the active file's commands in the palette after Connect to MATLAB…, and run one from there", async () => {
    const { page, matlab } = matlabPage();
    await open(page, 'shared_gain.slx');
    expect(matlabRows(page).map((c) => c.label)).toEqual(['Connect to MATLAB…', 'Open in Simulink', 'Update Diagram', "Open in MATLAB's Data Explorer"]);
    page.command('palette');
    run('matlab-update-diagram');
    await until(() => commands(matlab).length === 1);
    expect(commands(matlab)[0]).toEqual({ name: 'updateDiagram', arg: at('shared_gain.slx') });
  });

  it('say a failure of the link as an error under the command, in a toast and the Log', async () => {
    const { page, matlab } = matlabPage();
    const { toasts, log } = heard();
    await open(page, 'shared_gain.slx');
    matlab.answer('updateDiagram', new Error('MATLAB is not connected.'));
    page.command('matlab-update-diagram');
    await until(() => said(toasts).includes('error Update Diagram failed: MATLAB is not connected.'));
    expect(log).toContain('error Update Diagram failed: MATLAB is not connected.');
  });

  it('say a command is not available where it is not offered, and send nothing', async () => {
    const { page, matlab } = matlabPage();
    const { toasts } = heard();
    await open(page, 'params.sldd');
    page.command('matlab-open');
    await until(() => said(toasts).includes('info Open in Simulink is not available here'));
    matlab.set({ state: 'off' });
    page.command('matlab-data-explorer');
    await until(() => said(toasts).includes("info Open in MATLAB's Data Explorer is not available here"));
    expect(commands(matlab)).toEqual([]);
  });

  it('leave the menus and the palette as they are for a host with no MATLAB', async () => {
    const page = startPage(FILES);
    await open(page, 'shared_gain.slx');
    expect(read(await rowMenu('shared_gain.slx', 'PlantGain')).at(-1)).toBe('Show in Graph');
    expect(read(fileMenu('shared_gain.slx'))).toEqual(['Save', 'Save As…', '—', 'Close']);
    expect(matlabRows(page)).toEqual([]);
    page.command('matlab-update-diagram');
    await settled();
    menuEl().close();
  });
});
