// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Settings and About, connected: the settings read back when the shell starts, the
// theme they say applied to the page at once (the prototype applied it only when Settings was
// opened, so a dark choice came back light), Auto following the system's theme, the gear and the
// (i) toggling their popovers, a change kept and applied, and the layout kept under the shell's
// own key. The icon style reaches the toolbar, the location bar and the shell's bars, the table
// style every table the shell makes, the ones it makes later too, and the graph's layout Root's
// graph, from the start. And the popovers make way
// for a dialog: one Escape must not close two layers.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ShellSettings, type Theme } from '../../src/model/shell/settings.js';
import { aboutPanel, activityButton, at, confirmDialog, dirtyTabs, edit, errorDialog, folderBar, graph, graphShown, locationBar, open, settingsPanel, startPage, tableOf, toolbar, until } from './harness.js';

const theme = () => document.documentElement.dataset.theme;

/** Ask for `settings` as the popover does, on a click of one of its segments. */
function choose(settings: ShellSettings): void {
  settingsPanel().dispatchEvent(new CustomEvent('dex-settings-change', { detail: { settings }, bubbles: true, composed: true }));
}

/** A system theme a test sets, as a host's would report it. */
function fakeSystem(initial: Theme) {
  let now = initial;
  const listeners = new Set<(t: Theme) => void>();
  return {
    option: { now: () => now, on: (l: (t: Theme) => void) => (listeners.add(l), () => listeners.delete(l)) },
    set(t: Theme) {
      now = t;
      for (const l of listeners) l(t);
    },
    listening: () => listeners.size,
  };
}

describe('the settings', () => {
  it('are read back at start, and the theme they name applied at once, before Settings is opened', () => {
    localStorage.setItem('dex-shell:settings', JSON.stringify({ theme: 'dark', toolbar: 'compact' }));
    startPage();
    expect(theme()).toBe('dark');
    // A record kept before the icon and table styles and the graph's layout were settings: theirs
    // are the defaults.
    expect(settingsPanel().settings).toEqual({ theme: 'dark', toolbar: 'compact', iconStyle: 'minimal', tableStyle: 'grid', graphLayout: 'tree' });
  });

  it('under the storage key the app gives', () => {
    localStorage.setItem('my-app:settings', JSON.stringify({ theme: 'high-contrast', toolbar: 'normal' }));
    startPage({}, { storageKey: 'my-app' });
    expect(theme()).toBe('high-contrast');
  });

  it("Auto, the default, follows the system's theme, as it changes, until a theme is chosen", async () => {
    const system = fakeSystem('dark');
    startPage({}, { systemTheme: system.option });
    expect(theme()).toBe('dark');
    system.set('high-contrast');
    expect(theme()).toBe('high-contrast');
    choose({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(theme()).toBe('light');
    system.set('dark');
    expect(theme()).toBe('light');
  });

  it('a change is kept, applied, and shown in the popover, the toolbar going compact', async () => {
    startPage({}, { systemTheme: fakeSystem('light').option });
    const asked: ShellSettings = { ...DEFAULT_SETTINGS, theme: 'dark', toolbar: 'compact' };
    choose(asked);
    expect(JSON.parse(localStorage.getItem('dex-shell:settings')!)).toEqual(asked);
    expect(theme()).toBe('dark');
    expect(settingsPanel().settings).toEqual(asked);
    await until(() => toolbar().compact);
  });

  it('the gear opens the popover beside it, and closes it again', async () => {
    const page = startPage();
    await until(() => !!activityButton(page.shell, 'settings'));
    const gear = activityButton(page.shell, 'settings')!;
    expect(gear.getAttribute('aria-label')).toBe('Settings');
    gear.click();
    expect(settingsPanel().open).toBe(true);
    gear.click();
    expect(settingsPanel().open).toBe(false);
  });

  it('a page without storage still comes up, on the defaults', () => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    try {
      startPage({}, { systemTheme: fakeSystem('dark').option });
      expect(theme()).toBe('dark');
      expect(settingsPanel().settings).toEqual(DEFAULT_SETTINGS);
    } finally {
      Storage.prototype.getItem = get;
    }
  });
});

describe('the icon style', () => {
  // Minimal, the default (the prototype's), draws the icons of the shell's own buttons in one
  // colour: the toolbar's, Back, Forward and Up, the folder bar's, the activity bars' and the status bar's.
  const mono = (page: ReturnType<typeof startPage>) => [toolbar().mono, locationBar().mono, folderBar().mono, page.shell.mono];

  it('is Minimal at first: the toolbar, the location bar and the bars draw their icons in one colour', () => {
    const page = startPage();
    expect(settingsPanel().settings.iconStyle).toBe('minimal');
    expect(mono(page)).toEqual([true, true, true, true]);
  });

  it('Colorful draws them in their own colours, is kept, and comes back so at the next start', () => {
    const page = startPage();
    choose({ ...DEFAULT_SETTINGS, iconStyle: 'colorful' });
    expect(mono(page)).toEqual([false, false, false, false]);
    expect(JSON.parse(localStorage.getItem('dex-shell:settings')!).iconStyle).toBe('colorful');
    page.handle.dispose();
    const next = startPage();
    expect(mono(next)).toEqual([false, false, false, false]);
    choose({ ...DEFAULT_SETTINGS });
    expect(mono(next)).toEqual([true, true, true, true]);
  });
});

describe('the table style', () => {
  // Grid, the default, is the table's own (`normal`); Rows is its `light`. Every table the shell
  // makes follows the setting: those open when it changes, and those made after.
  const styles = (...names: string[]) => names.map((n) => tableOf(n)?.tableStyle);

  it('is Grid at first, every table ruled round its cells', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    expect(styles('params.sldd', 'ParamMat.mat')).toEqual(['normal', 'normal']);
  });

  it('Rows redraws every open table, and a table made after it is drawn so too', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd');
    choose({ ...DEFAULT_SETTINGS, tableStyle: 'rows' });
    expect(styles('params.sldd')).toEqual(['light']);
    await open(page, 'ParamMat.mat');
    expect(styles('params.sldd', 'ParamMat.mat')).toEqual(['light', 'light']);
    // A file that could not be read is a table too, its banner saying why.
    void page.handle.openPaths([at('gone.sldd')]);
    await until(() => !!tableOf('gone.sldd')?.banners?.error);
    expect(styles('gone.sldd')).toEqual(['light']);
    choose({ ...DEFAULT_SETTINGS, tableStyle: 'grid' });
    expect(styles('params.sldd', 'ParamMat.mat', 'gone.sldd')).toEqual(['normal', 'normal', 'normal']);
  });

  it('kept as Rows, is how the tables of the next start are drawn', async () => {
    localStorage.setItem('dex-shell:settings', JSON.stringify({ ...DEFAULT_SETTINGS, tableStyle: 'rows' }));
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    expect(styles('params.sldd')).toEqual(['light']);
  });
});

describe("the graph's layout", () => {
  // Tree, the default, is the graph's own top-down trees; Indented, its file trees, which draw a
  // large set narrower. Root's graph follows the setting from the start, before Root is first shown.
  it('is Tree at first, and Indented draws Root\'s graph as file trees, kept for the next start', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    expect(settingsPanel().settings.graphLayout).toBe('tree');
    expect(graph().layout).toBe('tree');
    choose({ ...DEFAULT_SETTINGS, graphLayout: 'indented' });
    expect(graph().layout).toBe('indented');
    expect(JSON.parse(localStorage.getItem('dex-shell:settings')!).graphLayout).toBe('indented');
    // Shown at Root with a file open: drawn as the setting says.
    await open(page, 'params.sldd');
    page.command('show-graph');
    await until(() => graphShown());
    expect(graph().layout).toBe('indented');
    choose({ ...DEFAULT_SETTINGS });
    expect(graph().layout).toBe('tree');
  });

  it('kept as Indented, is how the graph of the next start is drawn', () => {
    localStorage.setItem('dex-shell:settings', JSON.stringify({ ...DEFAULT_SETTINGS, graphLayout: 'indented' }));
    startPage();
    expect(graph().layout).toBe('indented');
  });
});

describe('About', () => {
  it('is headed with the app name, lists the lines the app gives, and toggles from the (i)', async () => {
    const page = startPage({}, { appName: 'Plant Data', about: [{ label: 'Version', value: '1.2.3' }] });
    await until(() => !!activityButton(page.shell, 'about'));
    expect(aboutPanel().heading).toBe('Plant Data');
    expect(aboutPanel().lines).toEqual([{ label: 'Version', value: '1.2.3' }]);
    const info = activityButton(page.shell, 'about')!;
    info.click();
    expect(aboutPanel().open).toBe(true);
    // The command, as the (i) again: it closes.
    page.command('about');
    expect(aboutPanel().open).toBe(false);
  });
});

describe('the popovers and the dialogs', () => {
  it('close before the confirm dialog asks, or the error dialog says why', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' }, { without: ['confirmClose'] });
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('settings');
    page.command('about');
    expect([settingsPanel().open, aboutPanel().open]).toEqual([true, true]);
    page.command('close-tab');
    await until(() => confirmDialog().hasAttribute('open'));
    expect([settingsPanel().open, aboutPanel().open]).toEqual([false, false]);
    confirmDialog().close();

    page.main.failSave = 'The disk is full.';
    page.command('settings');
    page.command('save');
    await until(() => errorDialog().hasAttribute('open'));
    expect(settingsPanel().open).toBe(false);
  });
});

describe('the layout', () => {
  it("is kept under the shell's own storage key, or the app's key and :layout when the shell has none", () => {
    const page = startPage();
    expect(page.shell.storageKey).toBe('dex-shell:layout');
    const other = startPage({}, { shellStorageKey: 'kept-here' });
    expect(other.shell.storageKey).toBe('kept-here');
  });

  it('shows the Explorer on the left and the Properties on the right, each with its chord', async () => {
    const page = startPage();
    await until(() => !!activityButton(page.shell, 'properties'));
    expect(page.shell.layout.left).toMatchObject({ view: 'explorer', open: true });
    expect(page.shell.layout.right).toMatchObject({ view: 'properties', open: true });
    const props = activityButton(page.shell, 'properties')!;
    expect(props.getAttribute('aria-label')).toBe('Properties');
  });
});

describe('the system theme listener', () => {
  it('is let go of on dispose', () => {
    const system = fakeSystem('dark');
    const page = startPage({}, { systemTheme: system.option });
    expect(system.listening()).toBe(1);
    page.handle.dispose();
    expect(system.listening()).toBe(0);
  });
});
