// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-command-window>: the app shell's terminal, a MATLAB-style `>>` prompt over the output of
// the commands run at it. It runs nothing itself: Enter shows the line and asks the app to run it
// (`dex-command-run`), and the app hands back the answer through appendOutput(). What is pinned here is
// that half: the line sent as typed and shown after the prompt, a blank one sent never; each line
// of an answer drawn as text in its kind's colour, a `clear` answer clearing first, and the oldest
// lines dropped past the cap; history recalled with the arrow keys, newest first, filtered by what
// is typed as MATLAB's is, and the line being typed given back; Escape emptying the prompt; and the
// two ways the prompt gets the keyboard, focusInput() and a click in the output that selects nothing.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DexCommandWindow,
  defineCommandWindow,
  type CommandRunDetail,
} from '../src/widgets/app-shell/modules/dex-command-window.js';

beforeAll(() => defineCommandWindow());

// What heard() put on the document, taken off after each case so no case hears another's lines.
const listening: Array<(e: CustomEvent<CommandRunDetail>) => void> = [];
afterEach(() => {
  for (const listener of listening.splice(0)) document.removeEventListener('dex-command-run', listener);
  document.body.replaceChildren();
});

async function commandWindow(props: Partial<Pick<DexCommandWindow, 'maxLines'>> = {}): Promise<DexCommandWindow> {
  const el = document.createElement('dex-command-window');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const input = (el: DexCommandWindow): HTMLInputElement => el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
const output = (el: DexCommandWindow): HTMLElement => el.shadowRoot!.querySelector<HTMLElement>('.output')!;
const lines = (el: DexCommandWindow): string[] => [...output(el).querySelectorAll('.line')].map((l) => l.textContent!);
const kinds = (el: DexCommandWindow): string[] =>
  [...output(el).querySelectorAll('.line')].map((l) => [...l.classList].filter((c) => c !== 'line').join(' '));

// Every dex-command-run, heard on the document: it has to leave the shadow root and bubble that
// far for an app listening on the shell or the page to hear it.
function heard(): string[] {
  const seen: string[] = [];
  const listener = (e: CustomEvent<CommandRunDetail>): void => {
    seen.push(e.detail.line);
  };
  listening.push(listener);
  document.addEventListener('dex-command-run', listener);
  return seen;
}

/** A key pressed in the prompt; the event, to read what the window did with it. */
async function press(el: DexCommandWindow, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  input(el).dispatchEvent(e);
  await el.updateComplete;
  return e;
}

/** Text typed into the prompt, as a person types it: the value, then an input event. */
function type(el: DexCommandWindow, text: string): void {
  input(el).value = text;
  input(el).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

/** A line typed and Enter pressed. */
async function enter(el: DexCommandWindow, text: string): Promise<void> {
  type(el, text);
  await press(el, 'Enter');
}

describe('the window', () => {
  it('greets with the welcome lines, under no prompt line yet', async () => {
    const el = await commandWindow();
    expect(lines(el)).toEqual(['Data Explorer — Command Window', 'Type "help" for available commands.']);
    expect(input(el).value).toBe('');
  });

  it('is a log region of output over a labelled prompt, the >> hidden from a screen reader', async () => {
    const el = await commandWindow();
    expect(output(el).getAttribute('role')).toBe('log');
    expect(output(el).getAttribute('aria-label')).toBe('Command output');
    expect(input(el).getAttribute('aria-label')).toBe('Command');
    expect(input(el).getAttribute('autocomplete')).toBe('off');
    expect(input(el).getAttribute('spellcheck')).toBe('false');
    const prompt = el.shadowRoot!.querySelector('.prompt')!;
    expect(prompt.textContent).toBe('>>');
    expect(prompt.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('running a line', () => {
  it('sends the line on Enter, shows it after the prompt, and empties the prompt', async () => {
    const el = await commandWindow();
    const seen = heard();
    await enter(el, 'ls');
    expect(seen).toEqual(['ls']);
    expect(lines(el).at(-1)).toBe('>> ls');
    expect(kinds(el).at(-1)).toBe('input');
    expect(input(el).value).toBe('');
  });

  it('sends the line without the spaces around it', async () => {
    const el = await commandWindow();
    const seen = heard();
    await enter(el, '  Kp = 5  ');
    expect(seen).toEqual(['Kp = 5']);
    expect(lines(el).at(-1)).toBe('>> Kp = 5');
  });

  it('sends nothing for a blank line, and shows nothing', async () => {
    const el = await commandWindow();
    const seen = heard();
    const before = lines(el);
    await enter(el, '   ');
    expect(seen).toEqual([]);
    expect(lines(el)).toEqual(before);
  });

  it('sends nothing while a character is being composed', async () => {
    // Enter that ends an input method's composition (Japanese, Chinese) picks the characters; it is
    // not the line's end.
    const el = await commandWindow();
    const seen = heard();
    type(el, 'ls');
    await press(el, 'Enter', { isComposing: true });
    expect(seen).toEqual([]);
    expect(input(el).value).toBe('ls');
  });

  it('keeps the keys it acts on to itself', async () => {
    // A shell around the window must not take Enter or an arrow for its own (a focused tab bar,
    // a chord), so the window stops them.
    const el = await commandWindow();
    const outside: string[] = [];
    const onKey = (e: KeyboardEvent) => outside.push(e.key);
    document.addEventListener('keydown', onKey);
    try {
      await enter(el, 'ls');
      await press(el, 'ArrowUp');
      await press(el, 'ArrowDown');
      expect(outside).toEqual([]);
    } finally {
      document.removeEventListener('keydown', onKey);
    }
  });
});

describe('the answer', () => {
  it("draws each line in its kind, as text and never as markup", async () => {
    const el = await commandWindow();
    el.clear();
    el.appendOutput({
      lines: [
        { text: 'Kp = 5', kind: 'out' },
        { text: 'Nothing is named "x".', kind: 'error' },
        { text: '<img src=x onerror=alert(1)>', kind: 'info' },
      ],
    });
    await el.updateComplete;
    expect(lines(el)).toEqual(['Kp = 5', 'Nothing is named "x".', '<img src=x onerror=alert(1)>']);
    expect(kinds(el)).toEqual(['out', 'error', 'info']);
    expect(output(el).querySelectorAll('img').length).toBe(0);
  });

  it('keeps a blank line of an answer as a line', async () => {
    const el = await commandWindow();
    el.clear();
    el.appendOutput({ lines: [{ text: 'a', kind: 'out' }, { text: '', kind: 'out' }, { text: 'b', kind: 'out' }] });
    await el.updateComplete;
    expect(lines(el)).toEqual(['a', '', 'b']);
  });

  it('clears before the lines of an answer that says to', async () => {
    const el = await commandWindow();
    await enter(el, 'clear');
    el.appendOutput({ lines: [], clear: true });
    await el.updateComplete;
    expect(lines(el)).toEqual([]);
    el.appendOutput({ lines: [{ text: 'fresh', kind: 'out' }], clear: true });
    await el.updateComplete;
    expect(lines(el)).toEqual(['fresh']);
  });

  it('empties the output on clear(), the welcome lines with it', async () => {
    const el = await commandWindow();
    el.clear();
    await el.updateComplete;
    expect(lines(el)).toEqual([]);
  });

  it('keeps the newest maxLines lines, dropping the oldest', async () => {
    const el = await commandWindow({ maxLines: 3 });
    el.appendOutput({ lines: ['1', '2', '3', '4'].map((text) => ({ text, kind: 'out' as const })) });
    await el.updateComplete;
    expect(lines(el)).toEqual(['2', '3', '4']);
    await enter(el, 'ls');
    expect(lines(el)).toEqual(['3', '4', '>> ls']);
  });

  it('takes max-lines as an attribute', async () => {
    const el = document.createElement('dex-command-window');
    el.setAttribute('max-lines', '2');
    document.body.append(el);
    await el.updateComplete;
    expect(el.maxLines).toBe(2);
    expect(lines(el)).toEqual(['Data Explorer — Command Window', 'Type "help" for available commands.']);
  });

  it('scrolls to the newest line', async () => {
    const el = await commandWindow();
    const box = output(el);
    Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 900 });
    el.appendOutput({ lines: [{ text: 'more', kind: 'out' }] });
    await el.updateComplete;
    expect(box.scrollTop).toBe(900);
  });
});

describe('history', () => {
  // Four lines run, the last one twice in a row: kept once, as a shell keeps it.
  async function withHistory(): Promise<DexCommandWindow> {
    const el = await commandWindow();
    for (const line of ['ls', 'info Kp', 'Kp = 5', 'Kp = 5']) await enter(el, line);
    return el;
  }

  it('recalls the lines run, newest first, ArrowDown walking back to an empty prompt', async () => {
    const el = await withHistory();
    const up: string[] = [];
    for (let i = 0; i < 3; i++) {
      await press(el, 'ArrowUp');
      up.push(input(el).value);
    }
    expect(up).toEqual(['Kp = 5', 'info Kp', 'ls']);
    const down: string[] = [];
    for (let i = 0; i < 3; i++) {
      await press(el, 'ArrowDown');
      down.push(input(el).value);
    }
    expect(down).toEqual(['info Kp', 'Kp = 5', '']);
  });

  it('stays on the oldest line at the top, and on the prompt at the bottom', async () => {
    const el = await withHistory();
    for (let i = 0; i < 6; i++) await press(el, 'ArrowUp');
    expect(input(el).value).toBe('ls');
    await press(el, 'ArrowDown');
    expect(input(el).value).toBe('info Kp');
    for (let i = 0; i < 4; i++) await press(el, 'ArrowDown');
    expect(input(el).value).toBe('');
  });

  it('recalls only the lines that begin with what is typed, and gives back what was typed', async () => {
    // MATLAB's: type the start of a line, and the arrows step through the lines that start so.
    const el = await withHistory();
    type(el, 'i');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('info Kp');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('info Kp');
    await press(el, 'ArrowDown');
    expect(input(el).value).toBe('i');
  });

  it('starts again from the newest line after a recalled line is typed over', async () => {
    const el = await withHistory();
    await press(el, 'ArrowUp');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('info Kp');
    type(el, 'K');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('Kp = 5');
  });

  it('takes the arrows from the caret, which would jump to the start of the line', async () => {
    const el = await withHistory();
    expect((await press(el, 'ArrowUp')).defaultPrevented).toBe(true);
    expect((await press(el, 'ArrowDown')).defaultPrevented).toBe(true);
  });

  it('runs a recalled line as it is, and recalls it first next time', async () => {
    const el = await withHistory();
    const seen = heard();
    await press(el, 'ArrowUp');
    await press(el, 'ArrowUp');
    await press(el, 'Enter');
    expect(seen).toEqual(['info Kp']);
    expect(input(el).value).toBe('');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('info Kp');
    await press(el, 'ArrowUp');
    expect(input(el).value).toBe('Kp = 5');
  });
});

describe('Escape', () => {
  it('empties the prompt, and keeps the key from the shell while it does', async () => {
    const el = await commandWindow();
    let reached = false;
    const onKey = () => (reached = true);
    document.addEventListener('keydown', onKey);
    try {
      type(el, 'Kp = ');
      await press(el, 'Escape');
      expect(input(el).value).toBe('');
      expect(reached).toBe(false);
    } finally {
      document.removeEventListener('keydown', onKey);
    }
  });

  it('lets the key go on from an empty prompt', async () => {
    // Nothing to empty: the shell may want it (to close the panel, say).
    const el = await commandWindow();
    let reached = false;
    const onKey = () => (reached = true);
    document.addEventListener('keydown', onKey);
    try {
      await press(el, 'Escape');
      expect(reached).toBe(true);
    } finally {
      document.removeEventListener('keydown', onKey);
    }
  });
});

describe('focus', () => {
  it('focusInput() gives the prompt the keyboard', async () => {
    const el = await commandWindow();
    el.focusInput();
    expect(el.shadowRoot!.activeElement).toBe(input(el));
  });

  it('a click in the output that selects nothing gives the prompt the keyboard', async () => {
    const el = await commandWindow();
    output(el).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(el.shadowRoot!.activeElement).toBe(input(el));
  });

  it('a click that ends a selection of the output leaves the selection be', async () => {
    // Copying a value out of the output is what the output is for: taking the focus would drop it.
    const el = await commandWindow();
    const range = document.createRange();
    range.selectNodeContents(output(el).querySelector('.line')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    output(el).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(el.shadowRoot!.activeElement).not.toBe(input(el));
    document.getSelection()!.removeAllRanges();
  });
});
