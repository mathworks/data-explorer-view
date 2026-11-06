// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The command palette (<dex-command-palette>): the shell's every command a few letters away. A
// person opens it, types, and presses Enter on the first row without looking twice, so what is
// held here is that Enter runs the row the palette shows as active, and only a command that can
// run. The list follows the typing (the order itself is fuzzy.test.ts's), a disabled command is
// shown and never sent, and the command run lately comes back first. And it is a modal as the
// confirm dialog is (confirmDialog.test.ts): keys stay inside it, Tab cannot leave it, Escape and
// a press outside close it, and focus goes back where the user was before the command runs, so a
// command that moves the focus itself (showing the Explorer) keeps it.
import { describe, it, expect, afterEach } from 'vitest';
import {
  DexCommandPalette,
  defineCommandPalette,
  type PaletteCommand,
  type PaletteRunDetail,
} from '../src/widgets/app-shell/modules/dex-command-palette.js';

defineCommandPalette();

const COMMANDS: PaletteCommand[] = [
  { id: 'save', label: 'Save', category: 'File', shortcut: '⌘S' },
  { id: 'saveAs', label: 'Save As', category: 'File' },
  { id: 'close', label: 'Close', category: 'File', shortcut: '⌘W' },
  { id: 'undo', label: 'Undo', category: 'Edit', disabled: true },
  { id: 'toggleExplorer', label: 'Toggle Explorer', category: 'View', shortcut: '⇧⌘E' },
  { id: 'settings', label: 'Settings', category: 'Other' },
];

let palette: DexCommandPalette | null = null;
let runs: string[] = [];
const onRun = (e: CustomEvent<PaletteRunDetail>): void => {
  runs.push(e.detail.id);
};

// show() focuses the input from a continuation of the first render, so a test lets both the Lit
// update and that continuation settle before it looks at focus.
async function open(commands: PaletteCommand[] = COMMANDS): Promise<DexCommandPalette> {
  palette ??= new DexCommandPalette();
  if (!palette.isConnected) {
    document.body.appendChild(palette);
    palette.addEventListener('dex-palette-run', onRun);
  }
  palette.show(commands);
  await settle(palette);
  return palette;
}

async function settle(el: DexCommandPalette): Promise<void> {
  await el.updateComplete;
  await Promise.resolve();
}

const input = (el: DexCommandPalette): HTMLInputElement => el.shadowRoot!.querySelector('input')!;
const options = (el: DexCommandPalette): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
const labels = (el: DexCommandPalette): string[] => options(el).map((o) => o.querySelector('.label')!.textContent!);
const active = (el: DexCommandPalette): HTMLElement | undefined => options(el).find((o) => o.getAttribute('aria-selected') === 'true');
const activeLabel = (el: DexCommandPalette): string | undefined => active(el)?.querySelector('.label')?.textContent ?? undefined;

async function type(el: DexCommandPalette, text: string): Promise<void> {
  input(el).value = text;
  input(el).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await el.updateComplete;
}

// A key pressed in the input, where focus is while the palette is open.
async function press(el: DexCommandPalette, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  input(el).dispatchEvent(ev);
  await el.updateComplete;
  return ev;
}

afterEach(() => {
  // close() takes away the document key listener show() put there; a test that left it would
  // hand its Tab and Escape handler to the next test.
  palette?.close();
  palette?.remove();
  palette = null;
  runs = [];
});

describe('what the palette shows', () => {
  it('renders nothing while closed', async () => {
    palette = new DexCommandPalette();
    document.body.appendChild(palette);
    await palette.updateComplete;
    expect(palette.open).toBe(false);
    expect(palette.hasAttribute('open')).toBe(false);
    expect(palette.shadowRoot!.querySelector('.palette')).toBeNull();
  });

  it('opens on show() with an empty input that has the focus', async () => {
    const el = await open();
    expect(el.open).toBe(true);
    expect(el.hasAttribute('open')).toBe(true);
    expect(input(el).value).toBe('');
    expect(el.shadowRoot!.activeElement).toBe(input(el));
    expect(input(el).placeholder).toBe('Type a command');
  });

  it('lists every command in the order given, each with its category and shortcut', async () => {
    const el = await open();
    expect(labels(el)).toEqual(['Save', 'Save As', 'Close', 'Undo', 'Toggle Explorer', 'Settings']);
    const save = options(el)[0]!;
    expect(save.querySelector('.category')?.textContent).toBe('File');
    expect(save.querySelector('.shortcut')?.textContent).toBe('⌘S');
    // No shortcut, no empty box for one.
    expect(options(el)[1]!.querySelector('.shortcut')).toBeNull();
  });

  it('draws a command without a category with none', async () => {
    const el = await open([{ id: 'a', label: 'Alone' }]);
    expect(options(el)[0]!.querySelector('.category')).toBeNull();
  });

  it('shows what it is given as text, not markup', async () => {
    // A command can be named for a file, and a file's name comes off the disk.
    const el = await open([{ id: 'x', label: '<img src=x onerror=alert(1)>', category: '<b>c</b>' }]);
    expect(el.shadowRoot!.querySelector('.option img, .option b')).toBeNull();
    expect(labels(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });

  it('is a modal dialog whose input is a combobox over a listbox of options', async () => {
    // Without these a screen reader hears an input and nothing of the list under it.
    const el = await open();
    const dialog = el.shadowRoot!.querySelector('.palette')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Command Palette');
    const box = input(el);
    expect(box.getAttribute('role')).toBe('combobox');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    const list = el.shadowRoot!.getElementById(box.getAttribute('aria-controls')!);
    expect(list?.getAttribute('role')).toBe('listbox');
    expect(options(el).every((o) => o.id && list!.contains(o))).toBe(true);
    // The active option is the input's active descendant, so it is read as the arrows move.
    expect(box.getAttribute('aria-activedescendant')).toBe(active(el)!.id);
  });

  it('opens on the first command', async () => {
    const el = await open();
    expect(activeLabel(el)).toBe('Save');
  });
});

describe('filtering', () => {
  it('lists the commands the typed letters find, best first', async () => {
    const el = await open();
    await type(el, 'se');
    // Settings begins with "se". Save and Save As only hold an S and then an e, from their
    // first letter on, and Close from its fourth.
    expect(labels(el)).toEqual(['Settings', 'Save', 'Save As', 'Close']);
  });

  it('marks the letters that matched', async () => {
    const el = await open();
    await type(el, 'tex');
    expect(labels(el)).toEqual(['Toggle Explorer']);
    const hits = [...options(el)[0]!.querySelectorAll('.hit')].map((h) => h.textContent);
    expect(hits).toEqual(['T', 'Ex']);
  });

  it('makes the first match active again as the query changes', async () => {
    const el = await open();
    await press(el, 'ArrowDown');
    await press(el, 'ArrowDown');
    expect(activeLabel(el)).toBe('Close');
    await type(el, 'set');
    expect(activeLabel(el)).toBe('Settings');
  });

  it('says so when nothing matches, and Enter then sends nothing', async () => {
    const el = await open();
    await type(el, 'qqq');
    expect(options(el)).toEqual([]);
    expect(el.shadowRoot!.querySelector('.empty')?.textContent?.trim()).toBe('No matching commands');
    expect(input(el).hasAttribute('aria-activedescendant')).toBe(false);
    await press(el, 'Enter');
    expect(runs).toEqual([]);
    expect(el.open).toBe(true);
  });

  it('starts afresh on each show(): an empty query and every command', async () => {
    const el = await open();
    await type(el, 'set');
    el.close();
    await open();
    expect(input(el).value).toBe('');
    expect(labels(el)).toHaveLength(COMMANDS.length);
  });
});

describe('the keys', () => {
  it('ArrowDown and ArrowUp move the active command, wrapping at the ends', async () => {
    const el = await open();
    await press(el, 'ArrowDown');
    expect(activeLabel(el)).toBe('Save As');
    await press(el, 'ArrowUp');
    await press(el, 'ArrowUp');
    expect(activeLabel(el)).toBe('Settings');
    await press(el, 'ArrowDown');
    expect(activeLabel(el)).toBe('Save');
    expect(input(el).getAttribute('aria-activedescendant')).toBe(active(el)!.id);
  });

  it('keeps the arrows from moving the caret', async () => {
    const ev = await press(await open(), 'ArrowDown');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('scrolls the active command into view as the arrows move it, and as the query changes', async () => {
    const el = await open();
    const scrolled: string[] = [];
    const watch = (): void => {
      for (const o of options(el)) o.scrollIntoView = () => scrolled.push(o.querySelector('.label')!.textContent!);
    };
    watch();
    await press(el, 'ArrowUp');
    await settle(el);
    expect(scrolled).toEqual(['Settings']);
    await type(el, 'clo');
    watch();
    await type(el, 'close');
    expect(scrolled.at(-1)).toBe('Close');
  });

  it('Enter sends dex-palette-run with the active command and closes', async () => {
    const el = await open();
    await type(el, 'tog');
    await press(el, 'Enter');
    expect(runs).toEqual(['toggleExplorer']);
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('sends a run that bubbles out of the shadow root to the document', async () => {
    const el = await open();
    let heard: PaletteRunDetail | null = null;
    const listen = (e: CustomEvent<PaletteRunDetail>): void => {
      heard = e.detail;
    };
    document.addEventListener('dex-palette-run', listen);
    await press(el, 'Enter');
    document.removeEventListener('dex-palette-run', listen);
    expect(heard).toEqual({ id: 'save' });
  });

  it('does not run on the Enter that ends an IME composition', async () => {
    // A Japanese or Chinese input method confirms its text with Enter; that Enter is the input
    // method's, and running a command on it would surprise everyone who types that way.
    const el = await open();
    await press(el, 'Enter', { isComposing: true });
    expect(runs).toEqual([]);
    expect(el.open).toBe(true);
  });

  it('Escape closes it and sends nothing', async () => {
    const el = await open();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    input(el).dispatchEvent(ev);
    expect(el.open).toBe(false);
    expect(runs).toEqual([]);
  });

  it('Escape closes it even when focus has left it', async () => {
    // Heard on the document, as the confirm dialog's, so a modal is never left with no way out
    // by keyboard; and stopped there, so the page's own Escape does not also act on it.
    const el = await open();
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    const heard: string[] = [];
    const listen = (e: KeyboardEvent): void => {
      heard.push(e.key);
    };
    document.addEventListener('keydown', listen);
    outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    document.removeEventListener('keydown', listen);
    expect(el.open).toBe(false);
    expect(heard).toEqual([]);
    outside.remove();
  });

  it('leaves the Escape that cancels an IME composition to the input method', async () => {
    const el = await open();
    input(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, composed: true, cancelable: true }));
    expect(el.open).toBe(true);
  });

  it('keeps Tab in the input instead of leaving behind the backdrop', async () => {
    // The input is the palette's one control: Tab and Shift+Tab have nowhere else to go.
    const el = await open();
    for (const shiftKey of [false, true]) {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(el.shadowRoot!.activeElement).toBe(input(el));
    }
  });

  it('lets no key pressed in it reach the page behind it', async () => {
    // The table and the context menu listen for keys on the document as they bubble: an arrow or
    // an Enter meant for the palette would act on the page behind a modal.
    const el = await open();
    const heard: string[] = [];
    const listen = (e: KeyboardEvent): void => {
      heard.push(e.key);
    };
    document.addEventListener('keydown', listen);
    try {
      for (const k of ['a', 'ArrowDown', 'Delete', 'Enter']) await press(el, k);
      expect(heard).toEqual([]);
    } finally {
      document.removeEventListener('keydown', listen);
    }
  });

  it('leaves the keys of the input alone: typing, Home and End, copy and paste', async () => {
    const el = await open();
    for (const init of [{ key: 'a' }, { key: 'Home' }, { key: 'End' }, { key: 'v', metaKey: true }, { key: 'Backspace' }]) {
      const ev = await press(el, init.key, init);
      expect(ev.defaultPrevented, init.key).toBe(false);
      expect(el.open).toBe(true);
    }
  });

  it('stops trapping Tab once closed', async () => {
    const el = await open();
    el.close();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('the pointer', () => {
  it('runs a command clicked, and closes', async () => {
    const el = await open();
    options(el)[2]!.click();
    expect(runs).toEqual(['close']);
    expect(el.open).toBe(false);
  });

  it('keeps the focus in the input on a press in the list', async () => {
    // A press on a disabled row leaves the palette open, and typing must still go on.
    const el = await open();
    const down = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true });
    options(el)[3]!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('closes on a click on the backdrop, sending nothing', async () => {
    const el = await open();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.open).toBe(false);
    expect(runs).toEqual([]);
  });

  it('stays open on a click inside it', async () => {
    const el = await open();
    const box = el.shadowRoot!.querySelector('.palette')!;
    box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(el.open).toBe(true);
  });

  it('stays open after a drag that began in it and was let go over the backdrop', async () => {
    // Selecting the typed text by dragging past the palette's edge: the browser sends that click
    // to the host, the nearest element holding both ends, and it is no request to close.
    const el = await open();
    input(el).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.open).toBe(true);
  });
});

describe('a disabled command', () => {
  it('is shown greyed, and said to be unavailable', async () => {
    const el = await open();
    const undo = options(el)[3]!;
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.classList.contains('disabled')).toBe(true);
    expect(options(el)[0]!.hasAttribute('aria-disabled')).toBe(false);
  });

  it('is reached by the arrows, and Enter on it sends nothing and keeps the palette open', async () => {
    // Reached, as the toolbar's disabled buttons are, so a keyboard learns it is there.
    const el = await open();
    for (let i = 0; i < 3; i++) await press(el, 'ArrowDown');
    expect(activeLabel(el)).toBe('Undo');
    await press(el, 'Enter');
    expect(runs).toEqual([]);
    expect(el.open).toBe(true);
  });

  it('sends nothing when clicked', async () => {
    const el = await open();
    options(el)[3]!.click();
    expect(runs).toEqual([]);
    expect(el.open).toBe(true);
  });

  it('is passed over for the command the list opens on', async () => {
    // Typing and pressing Enter at once must run something that can run.
    const el = await open([
      { id: 'undo', label: 'Undo', disabled: true },
      { id: 'undoAll', label: 'Undo All' },
    ]);
    expect(activeLabel(el)).toBe('Undo All');
    await type(el, 'und');
    expect(labels(el)).toEqual(['Undo', 'Undo All']);
    expect(activeLabel(el)).toBe('Undo All');
    await press(el, 'Enter');
    expect(runs).toEqual(['undoAll']);
  });

  it('is active when every match is disabled, so the list is still read', async () => {
    const el = await open();
    await type(el, 'undo');
    expect(activeLabel(el)).toBe('Undo');
    await press(el, 'Enter');
    expect(runs).toEqual([]);
  });
});

describe('recent commands', () => {
  it('come first the next time, latest first', async () => {
    const el = await open();
    await type(el, 'settings');
    await press(el, 'Enter');
    await open();
    await type(el, 'close');
    await press(el, 'Enter');
    await open();
    expect(labels(el).slice(0, 3)).toEqual(['Close', 'Settings', 'Save']);
    // And the first is active: Enter runs again what ran last.
    expect(activeLabel(el)).toBe('Close');
  });

  it('come first when the same commands are shown again and nothing was typed', async () => {
    // Enter on the first row, at once: the next show() is of the very same list, and the very
    // same empty query, and must still be ranked anew.
    const el = await open();
    await press(el, 'ArrowUp');
    await press(el, 'Enter');
    expect(runs).toEqual(['settings']);
    await open();
    expect(labels(el)[0]).toBe('Settings');
  });

  it('come first among equal matches only', async () => {
    // Save As, run last, goes before Save, which begins with "sa" as it does. Close, run before
    // it, holds an s only loosely, and stays under the three labels that begin with one.
    const el = await open();
    await type(el, 'close');
    await press(el, 'Enter');
    await open();
    await type(el, 'save as');
    await press(el, 'Enter');
    await open();
    await type(el, 'sa');
    expect(labels(el)).toEqual(['Save As', 'Save']);
    await type(el, 's');
    expect(labels(el)).toEqual(['Save As', 'Save', 'Settings', 'Close']);
  });

  it('are kept by the element alone, not shared with another palette', async () => {
    const el = await open();
    await press(el, 'ArrowDown');
    await press(el, 'Enter');
    const other = new DexCommandPalette();
    document.body.appendChild(other);
    other.show(COMMANDS);
    await settle(other);
    expect(other.shadowRoot!.querySelector('.option .label')?.textContent).toBe('Save');
    other.close();
    other.remove();
  });
});

describe('opening and closing', () => {
  it('returns focus where it was when it closes', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    el.close();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('returns focus before it sends the run, so a command that moves the focus keeps it', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    let focusedWhenRun: Element | null = null;
    const listen = (): void => {
      focusedWhenRun = document.activeElement;
    };
    el.addEventListener('dex-palette-run', listen);
    await press(el, 'Enter');
    el.removeEventListener('dex-palette-run', listen);
    expect(focusedWhenRun).toBe(before);
    before.remove();
  });

  it('returns focus inside another component shadow root', async () => {
    const wrapper = document.createElement('div');
    wrapper.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    wrapper.shadowRoot!.appendChild(inner);
    document.body.appendChild(wrapper);
    inner.focus();
    const el = await open();
    input(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    expect(wrapper.shadowRoot!.activeElement).toBe(inner);
    wrapper.remove();
  });

  it('a second show() takes the new commands, and focus still returns where it was first', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    await type(el, 'set');
    await open([{ id: 'a', label: 'Another' }]);
    expect(input(el).value).toBe('');
    expect(labels(el)).toEqual(['Another']);
    el.close();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('close() on a closed palette does nothing', async () => {
    const el = await open();
    el.close();
    expect(() => el.close()).not.toThrow();
    expect(runs).toEqual([]);
  });

  it('does not open when it is not on the page', async () => {
    // Nobody could see it, and a key listener left on the document would trap Tab for nothing.
    palette = new DexCommandPalette();
    palette.show(COMMANDS);
    expect(palette.open).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('closes when it leaves the page, and lets go of the keys', async () => {
    const el = await open();
    el.remove();
    expect(el.open).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('does not take focus when closed before its first render', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    palette = new DexCommandPalette();
    document.body.appendChild(palette);
    palette.show(COMMANDS);
    palette.close();
    await settle(palette);
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('does not throw when where focus was has left the page', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    before.remove();
    expect(() => el.close()).not.toThrow();
  });

  it('takes a list that is not an array as no commands', async () => {
    const el = await open(null as unknown as PaletteCommand[]);
    expect(options(el)).toEqual([]);
    expect(el.shadowRoot!.querySelector('.empty')).not.toBeNull();
  });
});
