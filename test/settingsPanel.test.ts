// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Settings popover, opened from the gear at the foot of an activity bar: a segmented
// control for each setting, the theme, the toolbar's density, the icons' style and the tables'
// rules, in that order. It only shows what it is given and asks for a change; the app applies the theme, keeps the settings, and sets them back. So what is
// pinned here is that contract: the checked segments are exactly `settings`, a click or an arrow
// key sends the whole new record and changes nothing by itself, and the popover stays open while
// a person tries the themes one after another.
//
// And that it gets out of the way the way a popover must. Escape and a press outside close it;
// a press inside, or on the gear that toggles it, does not. Its document listeners exist only
// while it is open: one left behind would swallow every later Escape on the page. Focus goes in
// on the chosen theme, so a keyboard user can arrow through the themes at once, and comes back
// to the gear, so they are not dropped at the top of the page.
//
// happy-dom has no layout, so the popover's own size is stubbed and the viewport is set: what is
// checked is where show() puts it from those, by placeBeside's rule.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { DexSettingsPanel, defineSettingsPanel, type SettingsChangeDetail } from '../src/widgets/app-shell/dex-settings-panel.js';
import { DEFAULT_SETTINGS, type ShellSettings } from '../src/model/shell/settings.js';
import type { Rect } from '../src/model/shell/placement.js';

defineSettingsPanel();

// A gear at the foot of a 48px left bar, in a 1024x768 window.
const GEAR: Rect = { x: 0, y: 720, width: 48, height: 40 };
const SIZE = { width: 240, height: 110 };

let panel: DexSettingsPanel | null = null;
let opener: HTMLButtonElement | null = null;

function viewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

// The host is what show() measures: it is the fixed box, shrink-wrapped round the popover.
function stubSize(el: HTMLElement, size: { width: number; height: number }): void {
  const r = { x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size };
  el.getBoundingClientRect = () => ({ ...r, toJSON: () => r }) as DOMRect;
}

// A focused button stands in for the gear, so focus has somewhere to come back to.
async function open(settings: ShellSettings = DEFAULT_SETTINGS, anchor: Rect = GEAR, size = SIZE): Promise<DexSettingsPanel> {
  opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  panel = new DexSettingsPanel();
  panel.settings = settings;
  stubSize(panel, size);
  document.body.append(panel);
  panel.show(anchor);
  await panel.updateComplete;
  return panel;
}

function group(el: DexSettingsPanel, name: string): HTMLElement {
  return el.shadowRoot!.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${name}"]`)!;
}

function radios(el: DexSettingsPanel, name: string): HTMLButtonElement[] {
  return Array.from(group(el, name).querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

function radio(el: DexSettingsPanel, name: string, label: string): HTMLButtonElement {
  return radios(el, name).find((r) => r.textContent!.trim() === label)!;
}

function checked(el: DexSettingsPanel, name: string): string[] {
  return radios(el, name)
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.textContent!.trim());
}

function focused(el: DexSettingsPanel): string | undefined {
  return (el.shadowRoot!.activeElement as HTMLElement | null)?.textContent?.trim();
}

// Every request the panel sends, heard on the document: the event has to leave the shadow root.
function requests(): ShellSettings[] {
  const sent: ShellSettings[] = [];
  const hear = (e: CustomEvent<SettingsChangeDetail>) => sent.push(e.detail.settings);
  document.addEventListener('dex-settings-change', hear);
  cleanups.push(() => document.removeEventListener('dex-settings-change', hear));
  return sent;
}

function key(target: EventTarget, k: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

function press(target: EventTarget, at: { clientX?: number; clientY?: number } = {}): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, ...at }));
}

let cleanups: (() => void)[] = [];

beforeEach(() => viewport(1024, 768));

afterEach(() => {
  // close() before removal: show()'s document listeners must not leak into the next test.
  panel?.close();
  panel?.remove();
  opener?.remove();
  panel = null;
  opener = null;
  for (const c of cleanups) c();
  cleanups = [];
  vi.restoreAllMocks();
});

describe('where it opens', () => {
  it('beside the anchor, to its right, bottoms in line', async () => {
    const el = await open();
    // 48 + the 4px gap; 760 (the gear's bottom) - 110.
    expect(el.style.left).toBe('52px');
    expect(el.style.top).toBe('650px');
  });

  it("on the anchor's left when the right has no room", async () => {
    const el = await open(DEFAULT_SETTINGS, { x: 976, y: 100, width: 48, height: 40 });
    expect(el.style.left).toBe(`${976 - 4 - 240}px`);
    expect(el.style.top).toBe('30px');
  });

  it('from the right bar, measures its whole width, not what the window leaves past the button', async () => {
    // show() first puts it at the anchor's right, past the window's edge, where a browser
    // shrink-wraps a fixed box into the room that is left. Measured there, it would be placed
    // by a width it does not have.
    panel = new DexSettingsPanel();
    const r = (el: HTMLElement) => {
      const width = Math.min(240, Math.max(60, window.innerWidth - parseFloat(el.style.left || '0')));
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 110, width, height: 110 };
    };
    panel.getBoundingClientRect = () => ({ ...r(panel!), toJSON: () => r(panel!) }) as DOMRect;
    document.body.append(panel);
    panel.show({ x: 976, y: 100, width: 48, height: 40 });
    await panel.updateComplete;
    expect(panel.style.left).toBe(`${976 - 4 - 240}px`);
  });

  it("at the anchor's right before it has measured itself", () => {
    // Its size is known only once it has rendered; until then it is at least beside the
    // anchor rather than at the window's corner.
    panel = new DexSettingsPanel();
    document.body.append(panel);
    panel.show(GEAR);
    expect(panel.style.left).toBe('52px');
    expect(panel.style.top).toBe('720px');
  });

  it('moves on a second show(), and stays open', async () => {
    const el = await open();
    el.show({ x: 0, y: 300, width: 48, height: 40 });
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(el.style.top).toBe('230px');
  });

  it('a second show() still gives focus back to what had it before the first', async () => {
    // By the second show() focus is inside the popover; taking THAT as the place to go back
    // to would leave focus on a radio of a closed popover.
    const el = await open();
    el.show({ x: 0, y: 300, width: 48, height: 40 });
    await el.updateComplete;
    key(document, 'Escape');
    expect(document.activeElement).toBe(opener);
  });
});

describe('what it shows', () => {
  it('a dialog named Settings, with a Theme, a Toolbar, an Icons and a Table radio group, in that order', async () => {
    const el = await open();
    const dialog = el.shadowRoot!.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Settings');
    expect(dialog.querySelector('.title')!.textContent!.trim()).toBe('Settings');
    expect([...dialog.querySelectorAll('[role="radiogroup"]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Theme', 'Toolbar', 'Icons', 'Table']);
    // Auto first: the default, and what most people keep.
    expect(radios(el, 'Theme').map((r) => r.textContent!.trim())).toEqual(['Auto', 'Light', 'Dark', 'Hi-Con']);
    expect(radios(el, 'Toolbar').map((r) => r.textContent!.trim())).toEqual(['Normal', 'Compact']);
    expect(radios(el, 'Icons').map((r) => r.textContent!.trim())).toEqual(['Minimal', 'Colorful']);
    expect(radios(el, 'Table').map((r) => r.textContent!.trim())).toEqual(['Grid', 'Rows']);
    // Each row's label is what names its group.
    expect([...dialog.querySelectorAll('.label')].map((l) => l.textContent!.trim())).toEqual(['Theme', 'Toolbar', 'Icons', 'Table']);
  });

  it('says in a tooltip what each choice does, the compact toolbar keeping its labels', async () => {
    // The compact toolbar is a lower row with smaller icons and every label beside its icon: a
    // tooltip that said "Icons alone" promised a row it does not draw.
    const el = await open();
    const titles = (name: string) => radios(el, name).map((r) => r.title);
    expect(titles('Toolbar')).toEqual(['Labels under the icons', 'Smaller icons, with the labels beside them']);
    expect(titles('Toolbar').join(' ')).not.toMatch(/alone/i);
    expect(titles('Icons')).toEqual(["The toolbar's and the bars' icons in one colour", 'The icons in their own colours']);
    expect(titles('Table')).toEqual(['Lines round every cell', 'A faint line between rows alone']);
    expect(radio(el, 'Theme', 'Auto').title).toBe("The system's theme");
    expect(radio(el, 'Theme', 'Hi-Con').title).toBe('High contrast');
  });

  it('checks the segments `settings` names, and only those', async () => {
    const el = await open();
    expect(checked(el, 'Theme')).toEqual(['Auto']);
    expect(checked(el, 'Toolbar')).toEqual(['Normal']);
    expect(checked(el, 'Icons')).toEqual(['Minimal']);
    expect(checked(el, 'Table')).toEqual(['Grid']);
    expect(radios(el, 'Theme').map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('follows `settings` when the app sets it', async () => {
    const el = await open();
    el.settings = { theme: 'high-contrast', toolbar: 'compact', iconStyle: 'colorful', tableStyle: 'rows' };
    await el.updateComplete;
    expect(checked(el, 'Theme')).toEqual(['Hi-Con']);
    expect(checked(el, 'Toolbar')).toEqual(['Compact']);
    expect(checked(el, 'Icons')).toEqual(['Colorful']);
    expect(checked(el, 'Table')).toEqual(['Rows']);
  });

  it('puts only the checked segment of each group in the Tab order', async () => {
    // A radio group is one Tab stop; the arrows move inside it.
    const el = await open({ theme: 'dark', toolbar: 'compact', iconStyle: 'colorful', tableStyle: 'grid' });
    expect(radios(el, 'Theme').map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(radios(el, 'Toolbar').map((r) => r.tabIndex)).toEqual([-1, 0]);
    expect(radios(el, 'Icons').map((r) => r.tabIndex)).toEqual([-1, 0]);
    expect(radios(el, 'Table').map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it('is open, and says so in an attribute, from show() to close()', async () => {
    panel = new DexSettingsPanel();
    document.body.append(panel);
    await panel.updateComplete;
    expect(panel.open).toBe(false);
    expect(panel.hasAttribute('open')).toBe(false);
    expect(panel.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
    panel.show(GEAR);
    await panel.updateComplete;
    expect(panel.open).toBe(true);
    expect(panel.hasAttribute('open')).toBe(true);
    panel.close();
    await panel.updateComplete;
    expect(panel.open).toBe(false);
    expect(panel.hasAttribute('open')).toBe(false);
    expect(panel.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('asking for a change', () => {
  it('a click on Dark asks for the same settings with the dark theme, and stays open', async () => {
    const el = await open({ theme: 'light', toolbar: 'compact', iconStyle: 'colorful', tableStyle: 'rows' });
    const sent = requests();
    radio(el, 'Theme', 'Dark').click();
    await el.updateComplete;
    expect(sent).toEqual([{ theme: 'dark', toolbar: 'compact', iconStyle: 'colorful', tableStyle: 'rows' }]);
    expect(el.open).toBe(true);
  });

  it('changes nothing by itself: Light stays checked until the app sets `settings`', async () => {
    // The app may refuse, or apply it later; the panel shows what IS, not what was asked.
    const el = await open({ ...DEFAULT_SETTINGS, theme: 'light' });
    radio(el, 'Theme', 'Dark').click();
    await el.updateComplete;
    expect(checked(el, 'Theme')).toEqual(['Light']);
  });

  it('a click on Compact asks for the compact toolbar', async () => {
    const el = await open();
    const sent = requests();
    radio(el, 'Toolbar', 'Compact').click();
    expect(sent).toEqual([{ ...DEFAULT_SETTINGS, toolbar: 'compact' }]);
  });

  it('a click on Colorful asks for the icons in their colours, and one on Rows for the light rules', async () => {
    const el = await open();
    const sent = requests();
    radio(el, 'Icons', 'Colorful').click();
    radio(el, 'Table', 'Rows').click();
    // Each from the settings shown, which the app has not changed yet: one change each.
    expect(sent).toEqual([
      { ...DEFAULT_SETTINGS, iconStyle: 'colorful' },
      { ...DEFAULT_SETTINGS, tableStyle: 'rows' },
    ]);
  });

  it('a click on the segment already checked asks nothing', async () => {
    // As a radio button sends no change when it is already the one checked.
    const el = await open();
    const sent = requests();
    radio(el, 'Theme', 'Auto').click();
    radio(el, 'Toolbar', 'Normal').click();
    radio(el, 'Icons', 'Minimal').click();
    radio(el, 'Table', 'Grid').click();
    expect(sent).toEqual([]);
  });

  it('sends a record of its own, not the object it was given', async () => {
    const given: ShellSettings = { ...DEFAULT_SETTINGS, theme: 'light' };
    const el = await open(given);
    const sent = requests();
    radio(el, 'Theme', 'Dark').click();
    expect(sent[0]).not.toBe(given);
    expect(given).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
  });
});

describe('the keyboard', () => {
  it('starts on the checked theme', async () => {
    const el = await open({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(focused(el)).toBe('Dark');
  });

  it('ArrowRight and ArrowDown move to the next theme and ask for it, wrapping at the end', async () => {
    const el = await open({ ...DEFAULT_SETTINGS, theme: 'dark' });
    const sent = requests();
    const e = key(el.shadowRoot!.activeElement!, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(focused(el)).toBe('Hi-Con');
    key(el.shadowRoot!.activeElement!, 'ArrowDown');
    expect(focused(el)).toBe('Auto');
    // The second step goes on from the focused radio, not the checked one: the app has not
    // answered the first request yet.
    expect(sent.map((s) => s.theme)).toEqual(['high-contrast', 'auto']);
  });

  it('ArrowLeft and ArrowUp move to the previous theme, wrapping at the start', async () => {
    const el = await open({ ...DEFAULT_SETTINGS, theme: 'light' });
    const sent = requests();
    key(el.shadowRoot!.activeElement!, 'ArrowLeft');
    expect(focused(el)).toBe('Auto');
    key(el.shadowRoot!.activeElement!, 'ArrowUp');
    expect(focused(el)).toBe('Hi-Con');
    expect(sent.map((s) => s.theme)).toEqual(['auto', 'high-contrast']);
  });

  it('moves inside the group it is in: the Toolbar arrows change the toolbar alone', async () => {
    const el = await open();
    const sent = requests();
    radio(el, 'Toolbar', 'Normal').focus();
    key(radio(el, 'Toolbar', 'Normal'), 'ArrowRight');
    expect(focused(el)).toBe('Compact');
    expect(sent).toEqual([{ ...DEFAULT_SETTINGS, toolbar: 'compact' }]);
  });

  it('the Icons and Table arrows change their own setting, wrapping as two segments do', async () => {
    const el = await open();
    const sent = requests();
    radio(el, 'Icons', 'Minimal').focus();
    key(radio(el, 'Icons', 'Minimal'), 'ArrowLeft');
    expect(focused(el)).toBe('Colorful');
    radio(el, 'Table', 'Grid').focus();
    key(radio(el, 'Table', 'Grid'), 'ArrowDown');
    expect(focused(el)).toBe('Rows');
    expect(sent).toEqual([
      { ...DEFAULT_SETTINGS, iconStyle: 'colorful' },
      { ...DEFAULT_SETTINGS, tableStyle: 'rows' },
    ]);
  });

  it('leaves an arrow with a modifier alone: that is a shell chord, not a choice', async () => {
    const el = await open();
    const sent = requests();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, composed: true, cancelable: true });
    el.shadowRoot!.activeElement!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(focused(el)).toBe('Auto');
    expect(sent).toEqual([]);
  });

  it('Escape closes it and gives focus back', async () => {
    const el = await open();
    key(el.shadowRoot!.activeElement!, 'Escape');
    await el.updateComplete;
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('Escape is spent on closing it: nothing behind the popover hears it too', async () => {
    const el = await open();
    const heard = vi.fn();
    document.body.addEventListener('keydown', heard);
    cleanups.push(() => document.body.removeEventListener('keydown', heard));
    key(el.shadowRoot!.activeElement!, 'Escape');
    expect(heard).not.toHaveBeenCalled();
  });

  it('gives focus back to a button inside another shadow root, as the shell\'s gear is', async () => {
    // document.activeElement names only the shell element; focusing that would put focus on
    // no button at all.
    const shell = document.createElement('div');
    const root = shell.attachShadow({ mode: 'open' });
    const gear = document.createElement('button');
    root.append(gear);
    document.body.append(shell);
    cleanups.push(() => shell.remove());
    gear.focus();
    panel = new DexSettingsPanel();
    document.body.append(panel);
    panel.show(GEAR);
    await panel.updateComplete;
    expect(focused(panel)).toBe('Auto');
    key(panel.shadowRoot!.activeElement!, 'Escape');
    expect(root.activeElement).toBe(gear);
  });

  it('close() from the app leaves focus alone when the popover does not hold it', async () => {
    // The person has moved on to a field elsewhere; pulling focus back to the gear would
    // interrupt their typing.
    const el = await open();
    const field = document.createElement('input');
    document.body.append(field);
    cleanups.push(() => field.remove());
    field.focus();
    el.close();
    expect(document.activeElement).toBe(field);
  });
});

describe('a press of the pointer', () => {
  it('outside closes it', async () => {
    const el = await open();
    press(document.body, { clientX: 500, clientY: 300 });
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('inside does not', async () => {
    const el = await open();
    press(radio(el, 'Theme', 'Dark'));
    press(el.shadowRoot!.querySelector('.title')!);
    expect(el.open).toBe(true);
  });

  it('on the anchor does not: the gear that toggles it closes it on its click', async () => {
    // Closed on pointerdown, the popover would be shut by the time the gear's click asked
    // whether it was open, and the click would open it again.
    const el = await open();
    press(opener!, { clientX: 20, clientY: 740 });
    expect(el.open).toBe(true);
  });
});

describe('its document listeners', () => {
  function spyListeners() {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const ours = (calls: unknown[][]) => calls.filter(([type]) => type === 'keydown' || type === 'pointerdown');
    return { added: () => ours(added.mock.calls), removed: () => ours(removed.mock.calls) };
  }

  it('are added on show() and removed, the same ones, on close()', async () => {
    const spy = spyListeners();
    const el = await open();
    expect(spy.added().map(([type]) => type).sort()).toEqual(['keydown', 'pointerdown']);
    el.close();
    expect(spy.removed()).toEqual(spy.added());
  });

  it('are removed when it leaves the page while open', async () => {
    const spy = spyListeners();
    const el = await open();
    el.remove();
    expect(spy.removed()).toEqual(spy.added());
    expect(el.open).toBe(false);
  });

  it('are never added for a panel that is not on the page: it does not open', async () => {
    // Nothing could take them away again (a panel never connected is never disconnected),
    // and they would swallow every Escape on the page.
    const spy = spyListeners();
    panel = new DexSettingsPanel();
    panel.show(GEAR);
    expect(panel.open).toBe(false);
    expect(panel.hasAttribute('open')).toBe(false);
    expect(spy.added()).toEqual([]);
    const heard = vi.fn();
    document.body.addEventListener('keydown', heard);
    cleanups.push(() => document.body.removeEventListener('keydown', heard));
    key(document.body, 'Escape');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('are not added twice by a second show()', async () => {
    const spy = spyListeners();
    const el = await open();
    el.show(GEAR);
    expect(spy.added()).toHaveLength(2);
  });

  it('are gone after close(): a later Escape reaches the page', async () => {
    const el = await open();
    el.close();
    const heard = vi.fn();
    document.body.addEventListener('keydown', heard);
    cleanups.push(() => document.body.removeEventListener('keydown', heard));
    key(document.body, 'Escape');
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
