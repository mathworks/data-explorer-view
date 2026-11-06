// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The app shell's toasts: the workspace's notices (a file read in part, an edit refused, "Saved
// x") shown in the bottom-right corner over whatever the user is doing. Two halves are protected.
// A toast that only reports something ('status', 'info') must go by itself, or the corner fills
// with "Saved" after a day's work; one the user has to read ('warning', 'error') must stay until
// they close it, or a refusal flashes past while they look at the table. And whichever kind it
// is, it must never outlive what owns it: a timer left running after clear() or after the host
// left the page fires into nothing, or takes away a toast shown since. Around those: a toast the
// user is on waits for them, and a screen reader hears every toast, once, through two live
// regions that are there before any toast is.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { DexToastHost, defineToastHost, type Toast } from '../src/widgets/app-shell/dex-toast-host.js';
import type { Notice } from '../src/model/edit/hooks.js';

defineToastHost();

let host: DexToastHost | null = null;

async function makeHost(): Promise<DexToastHost> {
  host = new DexToastHost();
  document.body.appendChild(host);
  await host.updateComplete;
  return host;
}

async function show(el: DexToastHost, toast: Toast): Promise<void> {
  el.show(toast);
  await el.updateComplete;
}

function toasts(el: DexToastHost): HTMLElement[] {
  return [...el.shadowRoot!.querySelectorAll<HTMLElement>('.toast')];
}

function messages(el: DexToastHost): (string | null)[] {
  return toasts(el).map((t) => t.querySelector('.message')!.textContent);
}

function region(el: DexToastHost, role: 'status' | 'alert'): HTMLElement {
  return el.shadowRoot!.querySelector<HTMLElement>(`.live[role="${role}"]`)!;
}

function dismiss(toast: HTMLElement): HTMLButtonElement {
  return toast.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!;
}

// Fake timers, so "goes after 4 seconds" is a step of the clock and not a wait. Lit renders on
// microtasks, which the fake clock leaves alone, so updateComplete still settles.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.useRealTimers();
});

describe('a toast that only reports something goes by itself', () => {
  it('a status toast goes after its ms, and not before', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'Saved a.sldd', ms: 1500 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(messages(el)).toEqual(['Saved a.sldd']);
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts(el)).toEqual([]);
  });

  it('a status toast with no ms goes after four seconds', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'Saved a.sldd' });
    await vi.advanceTimersByTimeAsync(3999);
    expect(toasts(el).length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts(el)).toEqual([]);
  });

  it("an info toast (the shell's own: a file opened) goes by itself too", async () => {
    const el = await makeHost();
    await show(el, { level: 'info', message: 'Opened a.sldd' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(toasts(el)).toEqual([]);
  });

  it("takes a workspace Notice as it stands", async () => {
    // connectShell hands the workspace's notify() straight here: no mapping in between.
    const el = await makeHost();
    const notice: Notice = { level: 'status', message: 'Pasted 3 entries', ms: 2000 };
    await show(el, notice);
    expect(messages(el)).toEqual(['Pasted 3 entries']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(toasts(el)).toEqual([]);
  });
});

describe('a toast the user has to read stays until they close it', () => {
  it.each(['warning', 'error'] as const)('a %s toast stays, whatever ms it was given', async (level) => {
    // A Notice's ms is for status; a refusal that went by itself would be missed by anyone
    // looking at the table when it came.
    const el = await makeHost();
    await show(el, { level, message: 'Cannot paste here', ms: 100 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(messages(el)).toEqual(['Cannot paste here']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('× closes it', async () => {
    const el = await makeHost();
    await show(el, { level: 'error', message: 'Could not save a.sldd' });
    dismiss(toasts(el)[0]!).click();
    await el.updateComplete;
    expect(toasts(el)).toEqual([]);
  });

  it('× closes only the toast it is on', async () => {
    const el = await makeHost();
    await show(el, { level: 'error', message: 'first' });
    await show(el, { level: 'warning', message: 'second' });
    dismiss(toasts(el)[0]!).click();
    await el.updateComplete;
    expect(messages(el)).toEqual(['second']);
  });
});

describe('every toast', () => {
  it.each(['info', 'status', 'warning', 'error'] as const)('a %s toast has a × named Dismiss', async (level) => {
    // Even the ones that go by themselves: four seconds is long when the toast covers the cell
    // the user wants to click.
    const el = await makeHost();
    await show(el, { level, message: 'x' });
    const button = dismiss(toasts(el)[0]!);
    expect(button).not.toBeNull();
    expect(button.getAttribute('type')).toBe('button');
  });

  it('× on a toast that would go by itself closes it and stops its timer', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'Saved' });
    expect(vi.getTimerCount()).toBe(1);
    dismiss(toasts(el)[0]!).click();
    await el.updateComplete;
    expect(toasts(el)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is drawn with no live role of its own', async () => {
    // The live regions below announce it; a toast that was a live region too would be read twice,
    // and read again whenever the stack around it changed.
    const el = await makeHost();
    await show(el, { level: 'error', message: 'x' });
    await show(el, { level: 'status', message: 'y' });
    for (const toast of toasts(el)) {
      expect(toast.getAttribute('role')).toBeNull();
      expect(toast.getAttribute('aria-live')).toBeNull();
    }
  });

  it('shows the message as text, not markup', async () => {
    // A notice quotes a file's name and the reason a source gave, both out of files on disk.
    const el = await makeHost();
    await show(el, { level: 'error', message: '<img src=x onerror=alert(1)>' });
    expect(toasts(el)[0]!.querySelector('img')).toBeNull();
    expect(messages(el)).toEqual(['<img src=x onerror=alert(1)>']);
    expect(region(el, 'alert').querySelector('img')).toBeNull();
    expect(region(el, 'alert').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps its message to as many lines as it takes, with no scroll box', async () => {
    // A box that scrolled could not be reached by keyboard: nothing in it takes focus.
    const el = await makeHost();
    await show(el, { level: 'error', message: 'x' });
    const style = getComputedStyle(toasts(el)[0]!.querySelector('.message')!);
    // happy-dom reports a max-height nobody set as '' where a browser says 'none'.
    expect(['none', '']).toContain(style.maxHeight);
    expect(['visible', '']).toContain(style.overflow);
  });
});

describe('what a screen reader hears', () => {
  // A live region is heard when its content CHANGES; one inserted with its text already in it,
  // as each toast was, is not reliably read at all. So the host keeps two regions from its first
  // render, empty, and writes each toast's message into the one for its level.

  it('has a status region and an alert region before any toast is shown', async () => {
    const el = await makeHost();
    expect(region(el, 'status').textContent).toBe('');
    expect(region(el, 'alert').textContent).toBe('');
  });

  it.each([
    ['status', 'status'],
    ['info', 'status'],
    ['warning', 'alert'],
    ['error', 'alert'],
  ] as const)('a %s toast is read out through the %s region', async (level, role) => {
    // A status is said politely, when the reader is next idle, and an alert at once: a refusal
    // must interrupt, a "Saved" must not.
    const el = await makeHost();
    await show(el, { level, message: 'Could not save a.sldd' });
    expect(region(el, role).textContent).toBe('Could not save a.sldd');
    expect(region(el, role === 'status' ? 'alert' : 'status').textContent).toBe('');
  });

  it('reads the same message twice when it is shown twice', async () => {
    // "Saved a.sldd" after each save: the second write must be a change, or the second save is
    // never heard. Each message is a new line of its own, whatever it says.
    const el = await makeHost();
    await show(el, { level: 'status', message: 'Saved a.sldd' });
    const first = region(el, 'status').firstElementChild;
    await show(el, { level: 'status', message: 'Saved a.sldd' });
    const lines = [...region(el, 'status').children];
    expect(lines.map((line) => line.textContent)).toEqual(['Saved a.sldd', 'Saved a.sldd']);
    expect(lines[0]).toBe(first);
    expect(lines[1]).not.toBe(first);
  });

  it('reads both of two toasts of one level shown in the same task', async () => {
    // A paste refused on two counts says two warnings at once. Had the second replaced the first
    // before the reader looked, the first would never be heard: the lines are added, and the
    // regions are not atomic, so each addition is read as itself and not with the whole region.
    const el = await makeHost();
    el.show({ level: 'warning', message: 'first' });
    el.show({ level: 'warning', message: 'second' });
    await el.updateComplete;
    expect([...region(el, 'alert').children].map((line) => line.textContent)).toEqual(['first', 'second']);
    for (const role of ['status', 'alert'] as const) expect(region(el, role).getAttribute('aria-atomic')).toBe('false');
  });

  it('keeps the last three lines in each region', async () => {
    // As many as there are toasts on screen: the region does not grow for the whole session.
    const el = await makeHost();
    for (const message of ['a', 'b', 'c', 'd']) el.show({ level: 'status', message });
    await el.updateComplete;
    expect([...region(el, 'status').children].map((line) => line.textContent)).toEqual(['b', 'c', 'd']);
  });

  it('reads a toast shown before the host first rendered', async () => {
    // The shell may show a notice in the same task that put the host on the page.
    host = new DexToastHost();
    document.body.appendChild(host);
    host.show({ level: 'error', message: 'early' });
    await host.updateComplete;
    await Promise.resolve();
    expect(region(host, 'alert').textContent).toBe('early');
    expect(messages(host)).toEqual(['early']);
  });

  it('clear() empties both regions', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    await show(el, { level: 'error', message: 'b' });
    el.clear();
    expect(region(el, 'status').textContent).toBe('');
    expect(region(el, 'alert').textContent).toBe('');
  });
});

describe('a toast the user is on stays while they are', () => {
  // WCAG 2.2.1: a time limit the user can stop. A toast that left while the pointer was on its ×,
  // or while its × had focus, would take the click or the Enter meant for it to whatever lay
  // under it.

  it('waits while the pointer is on it, and goes its full time after the pointer leaves', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a', ms: 1000 });
    const toast = toasts(el)[0]!;
    await vi.advanceTimersByTimeAsync(500);
    toast.dispatchEvent(new PointerEvent('pointerenter'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(messages(el)).toEqual(['a']);
    toast.dispatchEvent(new PointerEvent('pointerleave'));
    await vi.advanceTimersByTimeAsync(999);
    expect(messages(el)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts(el)).toEqual([]);
  });

  it('waits while its × has focus, and goes its full time after focus leaves', async () => {
    const el = await makeHost();
    await show(el, { level: 'info', message: 'a', ms: 1000 });
    const button = dismiss(toasts(el)[0]!);
    button.focus();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(messages(el)).toEqual(['a']);
    button.blur();
    await vi.advanceTimersByTimeAsync(999);
    expect(messages(el)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts(el)).toEqual([]);
  });

  it('waits until both the pointer and focus have left', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a', ms: 1000 });
    const toast = toasts(el)[0]!;
    const button = dismiss(toast);
    toast.dispatchEvent(new PointerEvent('pointerenter'));
    button.focus();
    toast.dispatchEvent(new PointerEvent('pointerleave'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(messages(el)).toEqual(['a']);
    button.blur();
    await vi.advanceTimersByTimeAsync(1000);
    expect(toasts(el)).toEqual([]);
  });

  it('holds only the toast the user is on', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a', ms: 1000 });
    await show(el, { level: 'status', message: 'b', ms: 1000 });
    toasts(el)[1]!.dispatchEvent(new PointerEvent('pointerenter'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(messages(el)).toEqual(['b']);
  });

  it('starts no timer for a warning or an error when the pointer leaves it', async () => {
    const el = await makeHost();
    await show(el, { level: 'error', message: 'a' });
    const toast = toasts(el)[0]!;
    toast.dispatchEvent(new PointerEvent('pointerenter'));
    toast.dispatchEvent(new PointerEvent('pointerleave'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets go of a hold when the host leaves the page, and times the toast again when it is back', async () => {
    // A browser does not reliably send pointerleave or focusout for a node taken off the page, so
    // a hold kept across that would never be let go, and the toast would stay for good.
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a', ms: 1000 });
    toasts(el)[0]!.dispatchEvent(new PointerEvent('pointerenter'));
    dismiss(toasts(el)[0]!).focus();
    el.remove();
    document.body.appendChild(el);
    await el.updateComplete;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(toasts(el)).toEqual([]);
  });
});

describe('the stack', () => {
  it('stacks the newest at the bottom', async () => {
    // The host sits in the bottom-right corner and grows upwards: the newest toast is the one
    // nearest the corner, where the eye already is.
    const el = await makeHost();
    await show(el, { level: 'error', message: 'a' });
    await show(el, { level: 'error', message: 'b' });
    expect(messages(el)).toEqual(['a', 'b']);
  });

  it('shows at most three: a fourth takes the oldest away', async () => {
    const el = await makeHost();
    for (const message of ['a', 'b', 'c', 'd']) await show(el, { level: 'error', message });
    expect(messages(el)).toEqual(['b', 'c', 'd']);
  });

  it("stops the timer of the toast a fourth one takes away", async () => {
    // Otherwise it would fire later for a toast that is gone, and four "Saved" toasts would
    // leave a stray timer each.
    const el = await makeHost();
    for (const message of ['a', 'b', 'c', 'd']) await show(el, { level: 'status', message });
    expect(vi.getTimerCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(toasts(el)).toEqual([]);
  });

  it('keeps each toast in its own element while the ones above it go', async () => {
    // Drawn by position, the top toast going would write each toast below into the element above
    // it: a focused × would move onto another toast, and a hovered one hand its hold to another.
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a', ms: 1000 });
    await show(el, { level: 'error', message: 'b' });
    const b = toasts(el)[1]!;
    await vi.advanceTimersByTimeAsync(1000);
    // toBe, not toEqual: toEqual compares elements by their markup, which the bug keeps.
    expect(toasts(el).length).toBe(1);
    expect(toasts(el)[0]).toBe(b);
    expect(b.querySelector('.message')!.textContent).toBe('b');
  });

  it('times each toast from when it was shown', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    await vi.advanceTimersByTimeAsync(3000);
    await show(el, { level: 'status', message: 'b' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(messages(el)).toEqual(['b']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(toasts(el)).toEqual([]);
  });
});

describe('clear() and leaving the page', () => {
  it('clear() takes every toast away and stops every timer', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    await show(el, { level: 'info', message: 'b' });
    await show(el, { level: 'error', message: 'c' });
    el.clear();
    await el.updateComplete;
    expect(toasts(el)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a toast shown after clear() goes after its own time', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    el.clear();
    await show(el, { level: 'status', message: 'b', ms: 6000 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(messages(el)).toEqual(['b']);
  });

  it('stops every timer when the host leaves the page', async () => {
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    await show(el, { level: 'info', message: 'b' });
    el.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('put back on the page, a toast that goes by itself still goes', async () => {
    // A shell that moves the host (a re-render that re-parents it) disconnects and reconnects it:
    // a status toast must not then stay for good.
    const el = await makeHost();
    await show(el, { level: 'status', message: 'a' });
    await show(el, { level: 'error', message: 'b' });
    el.remove();
    document.body.appendChild(el);
    await el.updateComplete;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(messages(el)).toEqual(['b']);
  });
});
