// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The in-page question a host with no native dialogs asks through (a browser page): "Save changes
// to x before closing? Save / Don't Save / Cancel", "x changed on disk: Reload / Keep My Edits".
// Its answer decides whether edits are written, thrown away or kept, so three things are held
// here. The promise always settles: every way out (a button, Escape, the backdrop, close(), a
// second question, the element leaving the page) answers it, or the close that awaits it hangs
// with the window half shut. A reflex Enter never throws work away: focus opens on the primary
// button and never on a danger one. And it is a modal a keyboard can get out of, with focus put
// back where the user was, as dex-error-dialog is (errorDialog.test.ts).
import { describe, it, expect, afterEach } from 'vitest';
import {
  DexConfirmDialog,
  defineConfirmDialog,
  type ConfirmOptions,
} from '../src/widgets/app-shell/dex-confirm-dialog.js';

defineConfirmDialog();

const CLOSE: ConfirmOptions = {
  title: 'Unsaved Changes',
  message: 'Save changes to a.sldd before closing?',
  detail: 'Your changes will be lost if you do not save them.',
  buttons: [
    { id: 'discard', label: "Don't Save", kind: 'danger' },
    { id: 'cancel', label: 'Cancel' },
    { id: 'save', label: 'Save', kind: 'primary' },
  ],
  cancelId: 'cancel',
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
let answer: Promise<string> | null = null;

// show() focuses a button from a continuation of the first render, so a test lets both the Lit
// update and that continuation settle before it looks at focus.
async function open(options: ConfirmOptions = CLOSE): Promise<DexConfirmDialog> {
  dialog = new DexConfirmDialog();
  document.body.appendChild(dialog);
  answer = dialog.show(options);
  await dialog.updateComplete;
  await Promise.resolve();
  return dialog;
}

function buttons(el: DexConfirmDialog): HTMLButtonElement[] {
  return [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')];
}

function buttonNamed(el: DexConfirmDialog, label: string): HTMLButtonElement {
  return buttons(el).find((b) => b.textContent?.trim() === label)!;
}

function focused(el: DexConfirmDialog): string | undefined {
  const active = el.shadowRoot!.activeElement as HTMLElement | null;
  return active?.tagName === 'BUTTON' ? active.textContent?.trim() : undefined;
}

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(ev);
  return ev;
}

function text(el: DexConfirmDialog, sel: string): string | undefined {
  return el.shadowRoot!.querySelector(sel)?.textContent ?? undefined;
}

afterEach(() => {
  // close() takes away the document key listener show() put there; a test that left it would
  // hand its Tab and Escape handler to the next test.
  dialog?.close();
  dialog?.remove();
  dialog = null;
  answer = null;
});

describe('what the dialog asks', () => {
  it('shows the title, the message and the detail', async () => {
    const el = await open();
    expect(text(el, '.title')).toBe('Unsaved Changes');
    expect(text(el, '.message')).toBe('Save changes to a.sldd before closing?');
    expect(text(el, '.detail')).toBe('Your changes will be lost if you do not save them.');
  });

  it('shows no detail when it is given none', async () => {
    const el = await open(RELOAD);
    expect(el.shadowRoot!.querySelector('.detail')).toBeNull();
  });

  it('shows the buttons in the order given, in the footer', async () => {
    // The host chooses the order (a platform's own: Don't Save on the left, Save on the right).
    const el = await open();
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(["Don't Save", 'Cancel', 'Save']);
    for (const b of buttons(el)) {
      expect(b.closest('.footer')).not.toBeNull();
      expect(b.getAttribute('type')).toBe('button');
    }
  });

  it('marks the primary and the danger buttons, and no other', async () => {
    const el = await open();
    expect(buttonNamed(el, 'Save').classList.contains('primary')).toBe(true);
    expect(buttonNamed(el, "Don't Save").classList.contains('danger')).toBe(true);
    expect([...buttonNamed(el, 'Cancel').classList]).toEqual([]);
  });

  it('announces itself as a modal alert dialog, named by its title', async () => {
    // Without these a screen reader never says a question is waiting: the modal is only seen.
    const el = await open();
    const d = el.shadowRoot!.querySelector('.dialog')!;
    expect(d.getAttribute('role')).toBe('alertdialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    const title = el.shadowRoot!.getElementById(d.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Unsaved Changes');
    const message = el.shadowRoot!.getElementById(d.getAttribute('aria-describedby')!);
    expect(message?.textContent).toBe('Save changes to a.sldd before closing?');
  });

  it('shows what it is given as text, not markup', async () => {
    // The message names a file, and a file's name comes off the disk.
    const el = await open({ ...CLOSE, message: '<img src=x onerror=alert(1)>', detail: '<b>x</b>' });
    expect(el.shadowRoot!.querySelector('.message img')).toBeNull();
    expect(el.shadowRoot!.querySelector('.detail b')).toBeNull();
    expect(text(el, '.message')).toBe('<img src=x onerror=alert(1)>');
  });

  it('renders nothing while closed', async () => {
    dialog = new DexConfirmDialog();
    document.body.appendChild(dialog);
    await dialog.updateComplete;
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(dialog.shadowRoot!.querySelector('.dialog')).toBeNull();
  });
});

describe('the answer', () => {
  it("is the clicked button's id, and the dialog closes", async () => {
    const el = await open();
    buttonNamed(el, "Don't Save").click();
    await expect(answer).resolves.toBe('discard');
    expect(el.hasAttribute('open')).toBe(false);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.dialog')).toBeNull();
  });

  it('is cancelId on Escape', async () => {
    const el = await open(RELOAD);
    key('Escape');
    await expect(answer).resolves.toBe('keep');
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('is cancelId on Escape even when focus has left the dialog', async () => {
    // As dex-error-dialog: Escape is heard on the document, so a modal is never left with no way
    // out by keyboard.
    await open();
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    key('Escape');
    await expect(answer).resolves.toBe('cancel');
    outside.remove();
  });

  it('is cancelId on a click on the backdrop', async () => {
    const el = await open();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(answer).resolves.toBe('cancel');
  });

  it('is not given by a click inside the dialog', async () => {
    // Selecting the file's name to copy it must not answer the question.
    const el = await open();
    el.shadowRoot!.querySelector('.message')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(el.hasAttribute('open')).toBe(true);
  });

  it('is cancelId on close()', async () => {
    const el = await open();
    el.close();
    await expect(answer).resolves.toBe('cancel');
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('close() on a closed dialog does nothing', async () => {
    const el = await open();
    buttonNamed(el, 'Save').click();
    await expect(answer).resolves.toBe('save');
    expect(() => el.close()).not.toThrow();
  });

  it("a second show() answers the first with the first's cancelId, and asks the second", async () => {
    // A reload question arriving while a close question is up must not leave the close awaiting
    // for good.
    const el = await open(CLOSE);
    const first = answer!;
    const second = el.show(RELOAD);
    await expect(first).resolves.toBe('cancel');
    await el.updateComplete;
    expect(text(el, '.message')).toBe('a.sldd changed on disk.');
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Keep My Edits', 'Reload']);
    buttonNamed(el, 'Reload').click();
    await expect(second).resolves.toBe('reload');
  });

  it('is cancelId when the dialog leaves the page while it is open', async () => {
    // Nothing could answer it any more, and the close that awaits it would hang.
    const el = await open();
    el.remove();
    await expect(answer).resolves.toBe('cancel');
    const ev = key('Tab');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('can be asked again once answered', async () => {
    // One element serves every question the shell asks.
    const el = await open(CLOSE);
    buttonNamed(el, 'Save').click();
    await answer;
    const again = el.show(RELOAD);
    await el.updateComplete;
    key('Escape');
    await expect(again).resolves.toBe('keep');
  });
});

describe('keyboard focus', () => {
  it('opens on the primary button', async () => {
    const el = await open();
    expect(focused(el)).toBe('Save');
  });

  it('never opens on a danger button, even the first one, when there is no primary', async () => {
    // A reflex Enter on an autofocused Reload or Don't Save throws the user's edits away.
    const el = await open(RELOAD);
    expect(focused(el)).toBe('Keep My Edits');
  });

  it('opens on the first button that is not a danger one when there is no primary', async () => {
    const el = await open({
      ...CLOSE,
      buttons: [
        { id: 'discard', label: "Don't Save", kind: 'danger' },
        { id: 'later', label: 'Later', kind: 'normal' },
        { id: 'cancel', label: 'Cancel' },
      ],
    });
    expect(focused(el)).toBe('Later');
  });

  it('opens on no button at all when every one is a danger one', async () => {
    const el = await open({ ...CLOSE, buttons: [{ id: 'discard', label: "Don't Save", kind: 'danger' }] });
    expect(focused(el)).toBeUndefined();
    // Still inside the dialog, so Tab goes on from there.
    expect(el.shadowRoot!.activeElement?.classList.contains('dialog')).toBe(true);
    key('Tab');
    expect(focused(el)).toBe("Don't Save");
  });

  it('Tab cycles among the buttons instead of leaving behind the backdrop', async () => {
    const el = await open();
    key('Tab');
    expect(focused(el)).toBe("Don't Save");
    key('Tab');
    expect(focused(el)).toBe('Cancel');
    key('Tab');
    expect(focused(el)).toBe('Save');
  });

  it('Shift+Tab cycles backwards', async () => {
    const el = await open();
    key('Tab', { shiftKey: true });
    expect(focused(el)).toBe('Cancel');
  });

  it('leaves keys other than Escape and Tab alone', async () => {
    // Heard on the document in capture: Enter has to reach the focused button, and Ctrl/Cmd+C
    // has to copy the file's name.
    const el = await open();
    for (const init of [{ key: 'Enter' }, { key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'ArrowLeft' }]) {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(el.hasAttribute('open')).toBe(true);
    }
  });

  it('stops trapping Tab once answered', async () => {
    const el = await open();
    buttonNamed(el, 'Cancel').click();
    await answer;
    expect(key('Tab').defaultPrevented).toBe(false);
  });

  it('returns focus where it was when it closes', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    buttonNamed(el, 'Save').click();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('returns focus inside another component shadow root', async () => {
    // The tab's close button lives in the doc tabs' shadow root: focus goes back to it, not to the
    // whole tab bar.
    const wrapper = document.createElement('div');
    wrapper.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    wrapper.shadowRoot!.appendChild(inner);
    document.body.appendChild(wrapper);
    inner.focus();
    const el = await open();
    key('Escape');
    expect(wrapper.shadowRoot!.activeElement).toBe(inner);
    expect(el.hasAttribute('open')).toBe(false);
    wrapper.remove();
  });

  it('returns focus where it was before the first question when a second one replaced it', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open(CLOSE);
    el.show(RELOAD);
    await el.updateComplete;
    await Promise.resolve();
    expect(focused(el)).toBe('Keep My Edits');
    key('Escape');
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('does not take focus when it was closed before its first render', async () => {
    // show() then close() in one task: the continuation that focuses a button must not then pull
    // focus into a closed dialog, away from where close() put it back.
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    dialog = new DexConfirmDialog();
    document.body.appendChild(dialog);
    answer = dialog.show(CLOSE);
    dialog.close();
    await dialog.updateComplete;
    await Promise.resolve();
    expect(document.activeElement).toBe(before);
    await expect(answer).resolves.toBe('cancel');
    before.remove();
  });

  it('does not throw when where focus was has left the page', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const el = await open();
    before.remove();
    expect(() => el.close()).not.toThrow();
    await expect(answer).resolves.toBe('cancel');
  });
});
