// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Settings and About, connected: the settings read back when the shell starts, the
// theme they say applied to the page at once (the prototype applied it only when Settings was
// opened, so a dark choice came back light), Auto following the system's theme, the gear and the
// (i) toggling their popovers, a change kept and applied, and the layout kept under the shell's
// own key. And the popovers make way for a dialog: one Escape must not close two layers.
import { describe, expect, it } from 'vitest';
import type { Theme } from '../../src/model/shell/settings.js';
import {
  aboutPanel,
  activityButton,
  confirmDialog,
  dirtyTabs,
  edit,
  errorDialog,
  open,
  settingsPanel,
  startPage,
  toolbar,
  until,
} from './harness.js';

const theme = () => document.documentElement.dataset.theme;

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
    expect(settingsPanel().settings).toEqual({ theme: 'dark', toolbar: 'compact' });
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
    settingsPanel().dispatchEvent(new CustomEvent('dex-settings-change', { detail: { settings: { theme: 'light', toolbar: 'normal' } }, bubbles: true, composed: true }));
    expect(theme()).toBe('light');
    system.set('dark');
    expect(theme()).toBe('light');
  });

  it('a change is kept, applied, and shown in the popover, the toolbar going compact', async () => {
    startPage({}, { systemTheme: fakeSystem('light').option });
    settingsPanel().dispatchEvent(new CustomEvent('dex-settings-change', { detail: { settings: { theme: 'dark', toolbar: 'compact' } }, bubbles: true, composed: true }));
    expect(JSON.parse(localStorage.getItem('dex-shell:settings')!)).toEqual({ theme: 'dark', toolbar: 'compact' });
    expect(theme()).toBe('dark');
    expect(settingsPanel().settings).toEqual({ theme: 'dark', toolbar: 'compact' });
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
      expect(settingsPanel().settings).toEqual({ theme: 'auto', toolbar: 'normal' });
    } finally {
      Storage.prototype.getItem = get;
    }
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
