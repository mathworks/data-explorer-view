// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What a page drives the shell by beside its files: a notice of its own (ShellHandle.notify), the
// system's theme told after the shell is up (ShellHandle.setSystemTheme), About's lines in
// sections, and an activity button of its own (a <dex-shell-action> it adds, whose press it hears).
//
// What it protects: the two pages built on the shell, the desktop app's and the web version's,
// each wrote these themselves. The web page warned in the console, which a user does not see, that
// a sample could not be fetched; the desktop page kept a theme source of its own, since Electron's
// nativeTheme reaches it only after connectShell has read the option; and the web page's Samples
// button worked by a rule no document said (an action the page adds is the page's to answer). A
// change to any of these would break a page silently, with no test of the shell noticing.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Theme } from '../../src/model/shell/settings.js';
import type { ShellActionDetail } from '../../src/widgets/app-shell/dex-app-shell.js';
import type { Toast } from '../../src/widgets/app-shell/dex-toast-host.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import { aboutPanel, activityButton, logPanel, settingsPanel, startPage, toastHost, toastTexts, until, type Page } from './harness.js';

const theme = () => document.documentElement.dataset.theme;

/** What the toast host and the Log are given from now on. */
function heard(): { toasts: Toast[]; log: string[] } {
  const toasts: Toast[] = [];
  const log: string[] = [];
  const show = toastHost().show.bind(toastHost());
  vi.spyOn(toastHost(), 'show').mockImplementation((toast) => (toasts.push(toast), show(toast)));
  const append = logPanel().appendEntry.bind(logPanel());
  logPanel().appendEntry = (entry: LogEntry) => (log.push(`${entry.level} ${entry.message}`), append(entry));
  return { toasts, log };
}

/** A system theme source a test moves, as the page's media queries would. */
function fakeSystem(initial: Theme) {
  let now = initial;
  const listeners = new Set<(t: Theme) => void>();
  return {
    option: { now: () => now, on: (l: (t: Theme) => void) => (listeners.add(l), () => void listeners.delete(l)) },
    move(t: Theme) {
      now = t;
      for (const l of listeners) l(t);
    },
  };
}

describe('notify', () => {
  it('shows the page\'s notice as a toast, and writes it in the Log at its level', async () => {
    const page = startPage();
    const { toasts, log } = heard();
    page.handle.notify({ level: 'warning', text: 'samples/Engine.slx could not be fetched: 404 Not Found' });
    page.handle.notify({ level: 'error', text: 'The drop could not be read.' });
    page.handle.notify({ level: 'info', text: 'Samples opened.' });
    expect(toasts).toEqual([
      { level: 'warning', message: 'samples/Engine.slx could not be fetched: 404 Not Found' },
      { level: 'error', message: 'The drop could not be read.' },
      { level: 'info', message: 'Samples opened.' },
    ]);
    expect(log).toEqual(['warning samples/Engine.slx could not be fetched: 404 Not Found', 'error The drop could not be read.', 'info Samples opened.']);
    await until(() => toastTexts().length === 3);
  });

  it("is 'info' with no level, or a level that is none of the three", () => {
    const page = startPage();
    const { toasts, log } = heard();
    page.handle.notify({ text: 'Plain.' });
    page.handle.notify({ level: 'fatal' as 'error', text: 'Odd.' });
    expect(toasts.map((t) => t.level)).toEqual(['info', 'info']);
    expect(log).toEqual(['info Plain.', 'info Odd.']);
  });

  it('says nothing once the shell is taken down', () => {
    const page = startPage();
    const { toasts, log } = heard();
    page.handle.dispose();
    expect(() => page.handle.notify({ level: 'error', text: 'Too late.' })).not.toThrow();
    expect([toasts, log]).toEqual([[], []]);
  });
});

describe('setSystemTheme', () => {
  it('is the theme Auto draws the page in, at once and as the host tells it again', () => {
    const page = startPage({}, { systemTheme: fakeSystem('light').option });
    expect(theme()).toBe('light');
    page.handle.setSystemTheme('dark');
    expect(theme()).toBe('dark');
    page.handle.setSystemTheme('high-contrast');
    expect(theme()).toBe('high-contrast');
  });

  it('takes over from the source the shell was connected with: its changes are no longer heeded', () => {
    const system = fakeSystem('light');
    const page = startPage({}, { systemTheme: system.option });
    system.move('dark');
    expect(theme()).toBe('dark');
    page.handle.setSystemTheme('light');
    system.move('high-contrast');
    expect(theme()).toBe('light');
  });

  it('leaves a theme the user chose as it is, and is what Auto comes back to', () => {
    const page = startPage({}, { systemTheme: fakeSystem('light').option });
    const choose = (t: typeof DEFAULT_SETTINGS.theme) =>
      settingsPanel().dispatchEvent(new CustomEvent('dex-settings-change', { detail: { settings: { ...DEFAULT_SETTINGS, theme: t } }, bubbles: true, composed: true }));
    choose('light');
    page.handle.setSystemTheme('dark');
    expect(theme()).toBe('light');
    choose('auto');
    expect(theme()).toBe('dark');
  });

  it('draws nothing once the shell is taken down', () => {
    const page = startPage({}, { systemTheme: fakeSystem('light').option });
    page.handle.dispose();
    page.handle.setSystemTheme('dark');
    expect(theme()).toBe('light');
  });
});

describe("About's sections", () => {
  it('reach the popover as the app gives them, the lines with none under the app\'s name', async () => {
    const about = [
      { label: 'Version', value: '2.0.0' },
      { label: 'data-explorer-view', value: '1.9.0', section: 'Built on' },
      { label: 'data-explorer-core', value: '1.58.0', section: 'Built on' },
    ];
    const page = startPage({}, { appName: 'Plant Data', about });
    expect(aboutPanel().lines).toEqual(about);
    page.command('about');
    await aboutPanel().updateComplete;
    const root = aboutPanel().shadowRoot!;
    expect(root.querySelector('.section')?.textContent?.trim()).toBe('Built on');
    expect(Array.from(root.querySelectorAll('.line dt'), (dt) => dt.textContent)).toEqual(['Version', 'data-explorer-view', 'data-explorer-core']);
  });
});

describe("a page's own activity button", () => {
  /** Add the page's own action, as the web version adds its Samples button: after connectShell. */
  function addAction(page: Page, attributes: Record<string, string>): HTMLElement {
    const el = document.createElement('dex-shell-action');
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    page.shell.append(el);
    return el;
  }
  const actionIds = (page: Page, side: 'left' | 'right') =>
    Array.from(page.shell.shadowRoot!.querySelectorAll<HTMLElement>(`nav.activity.${side} button[data-action]`), (b) => b.dataset.action);
  /** What dex-shell-action the shell sends from now on. */
  function sent(page: Page): ShellActionDetail[] {
    const got: ShellActionDetail[] = [];
    page.shell.addEventListener('dex-shell-action', (e) => got.push(e.detail));
    return got;
  }

  it("is drawn after the shell's Settings and About, and its press is the page's to answer", async () => {
    const page = startPage();
    const presses = sent(page);
    addAction(page, { side: 'left', action: 'samples', label: 'Samples', icon: 'documentList' });
    await until(() => !!activityButton(page.shell, 'samples'));
    expect(actionIds(page, 'left')).toEqual(['settings', 'about', 'samples']);
    const button = activityButton(page.shell, 'samples')!;
    expect(button.getAttribute('aria-label')).toBe('Samples');
    button.click();
    expect(presses.map((p) => p.actionId)).toEqual(['samples']);
    // The shell opens nothing of its own for it.
    expect([settingsPanel().open, aboutPanel().open]).toEqual([false, false]);
  });

  it('goes on the right bar for side="right", and its shortcut presses it', async () => {
    const page = startPage();
    const presses = sent(page);
    addAction(page, { side: 'right', action: 'share', label: 'Share', icon: 'info', shortcut: 'Mod+Shift+M' });
    await until(() => actionIds(page, 'right').length === 1);
    expect(actionIds(page, 'right')).toEqual(['share']);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, composed: true }));
    expect(presses.map((p) => p.actionId)).toEqual(['share']);
  });

  it("is not drawn with an id of the shell's own, settings or about, whose buttons stay the shell's", async () => {
    const page = startPage();
    addAction(page, { side: 'left', action: 'about', label: 'My About', icon: 'info' });
    addAction(page, { side: 'left', action: 'settings', label: 'My Settings', icon: 'settings' });
    // One of its own after them, for the shell to have read them all when it is drawn.
    addAction(page, { side: 'left', action: 'samples', label: 'Samples', icon: 'documentList' });
    await until(() => !!activityButton(page.shell, 'samples'));
    expect(actionIds(page, 'left')).toEqual(['settings', 'about', 'samples']);
    expect(activityButton(page.shell, 'about')!.getAttribute('aria-label')).toBe('About');
    activityButton(page.shell, 'about')!.click();
    expect(aboutPanel().open).toBe(true);
  });

  it("stays the page's when the shell is taken down: its own parts go, the page's action does not", async () => {
    const page = startPage();
    const samples = addAction(page, { side: 'left', action: 'samples', label: 'Samples', icon: 'documentList' });
    page.handle.dispose();
    expect(samples.parentElement).toBe(page.shell);
    expect(page.shell.querySelectorAll('dex-shell-action')).toHaveLength(1);
  });
});
