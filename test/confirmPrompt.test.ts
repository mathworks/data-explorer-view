// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The in-page question with a line of text to type (`<dex-confirm-dialog>`'s prompt()), for a host
// with no prompt of its own: Open from URL asks for a web address in it. It holds what
// confirmDialog.test.ts holds for a question with buttons. The promise always settles: every way
// out (the primary button, Enter in the field, Cancel, Escape, the backdrop, close(), another
// question asked in its place, the element leaving the page) answers it, or what awaits it hangs.
// The text answered is what was typed, trimmed and never blank. And it is a modal a keyboard can
// use and get out of: it opens on the field, keeps Tab inside, lets no key through to the page
// behind it, and puts the focus back where it was.
import { afterEach, describe, expect, it } from 'vitest';
import { DexConfirmDialog, defineConfirmDialog, type ConfirmOptions, type PromptOptions } from '../src/widgets/app-shell/dex-confirm-dialog.js';

defineConfirmDialog();

const URL_PROMPT: PromptOptions = {
  title: 'Open from URL',
  message: 'The address of a data file on the web.',
  label: 'URL',
  value: 'https://x/plant.sldd',
  placeholder: 'https://',
  type: 'url',
  okLabel: 'Open',
};

const RELOAD: ConfirmOptions = {
  title: 'File Changed',
  message: 'a.sldd changed on disk.',
  buttons: [
    { id: 'keep', label: 'Keep My Edits' },
    { id: 'reload', label: 'Reload', kind: 'danger' },
  ],
  cancelId: 'keep',
};

let dialog: DexConfirmDialog | null = null;
let answer: Promise<string | null> | null = null;

// prompt() focuses the field from a continuation of the first render, as show() focuses a button.
async function open(options: PromptOptions = URL_PROMPT): Promise<DexConfirmDialog> {
  dialog = new DexConfirmDialog();
  document.body.appendChild(dialog);
  answer = dialog.prompt(options);
  await dialog.updateComplete;
  await Promise.resolve();
  return dialog;
}

const field = (el: DexConfirmDialog) => el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
const buttons = (el: DexConfirmDialog) => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')];
const buttonNamed = (el: DexConfirmDialog, label: string) => buttons(el).find((b) => b.textContent?.trim() === label)!;

/** What has the focus in the dialog: 'field', a button's text, or undefined. */
function focused(el: DexConfirmDialog): string | undefined {
  const active = el.shadowRoot!.activeElement as HTMLElement | null;
  if (active?.tagName === 'INPUT') return 'field';
  return active?.tagName === 'BUTTON' ? active.textContent?.trim() : undefined;
}

/** Type `text` into the field, as the browser does: its value, then an input event. */
async function type(el: DexConfirmDialog, text: string): Promise<void> {
  const input = field(el);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await el.updateComplete;
}

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(ev);
  return ev;
}

/** A key pressed in the field: it bubbles out of the dialog's shadow root, as a real key press does. */
function keyInField(el: DexConfirmDialog, k: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  field(el).dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  dialog?.close();
  dialog?.remove();
  dialog = null;
  answer = null;
});

describe('what the prompt asks', () => {
  it('shows the title, the message and the labelled field, focused, its value selected', async () => {
    const el = await open();
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')?.textContent).toBe('Open from URL');
    expect(root.querySelector('.message')?.textContent).toBe('The address of a data file on the web.');
    expect(root.querySelector('label[for=field]')?.textContent?.trim()).toBe('URL');
    const input = field(el);
    expect(input.id).toBe('field');
    expect(input.placeholder).toBe('https://');
    expect(input.value).toBe('https://x/plant.sldd');
    expect(focused(el)).toBe('field');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'https://x/plant.sldd'.length]);
  });

  it('announces itself as a modal dialog, named by its title and described by its message', async () => {
    // A dialog, not an alert dialog: it asks for something, and nothing has gone wrong.
    const el = await open();
    const d = el.shadowRoot!.querySelector('.dialog')!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(el.shadowRoot!.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Open from URL');
    expect(el.shadowRoot!.getElementById(d.getAttribute('aria-describedby')!)?.textContent).toBe('The address of a data file on the web.');
  });

  it("gives an address field a phone's address keyboard, and no spelling or autofill", async () => {
    const el = await open();
    const input = el.shadowRoot!.querySelector('input[type=url]')!;
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('is a plain text field by default, empty, with Cancel beside the primary button', async () => {
    const el = await open({ title: 'Rename', message: 'A new name.', label: 'Name', okLabel: 'Rename' });
    expect(field(el).type).toBe('text');
    expect(field(el).value).toBe('');
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Rename', 'Cancel']);
    expect(buttonNamed(el, 'Rename').classList.contains('primary')).toBe(true);
  });

  it('names Cancel as it is asked to', async () => {
    const el = await open({ ...URL_PROMPT, cancelLabel: 'Not Now' });
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Open', 'Not Now']);
  });
});

describe('the answer', () => {
  it('is the text typed, trimmed, on Enter in the field', async () => {
    const el = await open();
    await type(el, '  https://x/a.sldd  ');
    const ev = keyInField(el, 'Enter');
    expect(ev.defaultPrevented).toBe(true);
    await expect(answer).resolves.toBe('https://x/a.sldd');
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('is the text typed, trimmed, on the primary button', async () => {
    const el = await open();
    await type(el, '  https://x/a.sldd  ');
    buttonNamed(el, 'Open').click();
    await expect(answer).resolves.toBe('https://x/a.sldd');
  });

  it('is never blank: the primary button is disabled, and Enter does nothing, while the field is', async () => {
    const el = await open();
    expect(buttonNamed(el, 'Open').disabled).toBe(false);
    for (const blank of ['', '   ']) {
      await type(el, blank);
      expect(buttonNamed(el, 'Open').disabled).toBe(true);
      keyInField(el, 'Enter');
      expect(el.hasAttribute('open')).toBe(true);
    }
    await type(el, 'x');
    expect(buttonNamed(el, 'Open').disabled).toBe(false);
  });

  it('is null on Cancel', async () => {
    const el = await open();
    buttonNamed(el, 'Cancel').click();
    await expect(answer).resolves.toBeNull();
  });

  it('is null on Escape', async () => {
    await open();
    key('Escape');
    await expect(answer).resolves.toBeNull();
  });

  it('is null on a press and a click on the backdrop', async () => {
    const el = await open();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(answer).resolves.toBeNull();
  });

  it('is null on close()', async () => {
    const el = await open();
    el.close();
    await expect(answer).resolves.toBeNull();
  });

  it('is null when the element leaves the page, and at once when it is not on the page', async () => {
    const el = await open();
    el.remove();
    await expect(answer).resolves.toBeNull();
    expect(key('Tab').defaultPrevented).toBe(false);
    await expect(new DexConfirmDialog().prompt(URL_PROMPT)).resolves.toBeNull();
  });

  it('is null when a show() is asked in its place, which then shows', async () => {
    const el = await open();
    const shown = el.show(RELOAD);
    await expect(answer).resolves.toBeNull();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('input')).toBeNull();
    expect(el.shadowRoot!.querySelector('.dialog')?.getAttribute('role')).toBe('alertdialog');
    buttonNamed(el, 'Reload').click();
    await expect(shown).resolves.toBe('reload');
  });

  it("answers a show() still open with its cancelId when a prompt is asked in its place", async () => {
    dialog = new DexConfirmDialog();
    document.body.appendChild(dialog);
    const shown = dialog.show(RELOAD);
    await dialog.updateComplete;
    answer = dialog.prompt(URL_PROMPT);
    await expect(shown).resolves.toBe('keep');
    await dialog.updateComplete;
    await Promise.resolve();
    expect(focused(dialog)).toBe('field');
    await type(dialog, 'https://x/b.sldd');
    keyInField(dialog, 'Enter');
    await expect(answer).resolves.toBe('https://x/b.sldd');
  });

  it('opens with the value it is given each time, not what was typed before', async () => {
    const el = await open();
    await type(el, 'typed');
    el.close();
    const again = el.prompt({ ...URL_PROMPT, value: undefined });
    await el.updateComplete;
    expect(field(el).value).toBe('');
    el.close();
    await expect(again).resolves.toBeNull();
  });
});

describe('keyboard focus', () => {
  it('Tab goes from the field to the primary button, to Cancel and back to the field; Shift+Tab the other way', async () => {
    const el = await open();
    key('Tab');
    expect(focused(el)).toBe('Open');
    key('Tab');
    expect(focused(el)).toBe('Cancel');
    key('Tab');
    expect(focused(el)).toBe('field');
    key('Tab', { shiftKey: true });
    expect(focused(el)).toBe('Cancel');
    key('Tab', { shiftKey: true });
    expect(focused(el)).toBe('Open');
    key('Tab', { shiftKey: true });
    expect(focused(el)).toBe('field');
  });

  it('passes over the primary button while it is disabled', async () => {
    const el = await open();
    await type(el, '');
    key('Tab');
    expect(focused(el)).toBe('Cancel');
  });

  it('returns focus where it was when it closes', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    expect(focused(el)).toBe('field');
    key('Escape');
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('lets no key pressed in the field reach the page behind it', async () => {
    // Enter typed in the field answers the prompt; reaching the page, it would also act there (a
    // table's Enter, a menu's).
    const el = await open();
    const heard: string[] = [];
    const listen = (e: KeyboardEvent) => heard.push(e.key);
    document.addEventListener('keydown', listen);
    try {
      for (const k of ['a', 'ArrowLeft', 'Enter']) keyInField(el, k);
      expect(heard).toEqual([]);
      await expect(answer).resolves.toBe('https://x/plant.sldd');
    } finally {
      document.removeEventListener('keydown', listen);
    }
  });
});
