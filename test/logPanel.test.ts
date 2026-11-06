// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Log panel (<dex-log-panel>): what the app did and what went wrong, a line each, in
// the bottom panel. It is where a person looks after a toast has gone, so the lines must be
// there, in order, with their time and how much they matter, and the panel must not grow without
// end in a session that logs all day: a thousand lines, the oldest dropped. The level filter
// narrows what is shown and never what is kept. And the view follows the newest line until the
// person scrolls up to read an older one, when it holds still under them; happy-dom lays nothing
// out, so the scroll box's heights are given by hand, as a browser would measure them.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DexLogPanel,
  defineLogPanel,
  type LogEntry,
  type LogFilterChangedDetail,
} from '../src/widgets/app-shell/modules/dex-log-panel.js';

defineLogPanel();

let panel: DexLogPanel | null = null;

async function mount(): Promise<DexLogPanel> {
  panel = new DexLogPanel();
  document.body.appendChild(panel);
  await panel.updateComplete;
  return panel;
}

async function add(el: DexLogPanel, ...entries: LogEntry[]): Promise<void> {
  for (const entry of entries) el.appendEntry(entry);
  await el.updateComplete;
}

const region = (el: DexLogPanel): HTMLElement => el.shadowRoot!.querySelector<HTMLElement>('[role="log"]')!;
const lines = (el: DexLogPanel): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.line')];
const messages = (el: DexLogPanel): string[] => lines(el).map((l) => l.querySelector('.message')!.textContent!);
const note = (el: DexLogPanel): string | undefined => el.shadowRoot!.querySelector('.empty')?.textContent?.trim();
const segments = (el: DexLogPanel): HTMLButtonElement[] => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const segment = (el: DexLogPanel, label: string): HTMLButtonElement => segments(el).find((b) => b.textContent?.trim() === label)!;
const clearButton = (el: DexLogPanel): HTMLButtonElement => el.shadowRoot!.querySelector<HTMLButtonElement>('button.clear')!;

const at = (h: number, m: number, s: number): Date => new Date(2026, 10, 6, h, m, s);

// The scroll box as a browser would measure it: `content` px of lines in a box `box` px tall.
function measure(el: HTMLElement, content: number, box = 100): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box });
}

function scrollTo(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

afterEach(() => {
  panel?.remove();
  panel = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a line', () => {
  it('shows the time as HH:MM:SS, the level and the message', async () => {
    const el = await mount();
    await add(el, { level: 'warning', message: 'a.sldd has no Design Data.', at: at(9, 5, 7) });
    const [line] = lines(el);
    expect(line!.querySelector('.time')?.textContent).toBe('09:05:07');
    expect(line!.querySelector('.level')?.textContent).toBe('warning');
    expect(line!.querySelector('.message')?.textContent).toBe('a.sldd has no Design Data.');
    expect(line!.classList.contains('warning')).toBe(true);
  });

  it('gives the time as a machine reads it too', async () => {
    const el = await mount();
    const when = at(23, 59, 0);
    await add(el, { level: 'info', message: 'x', at: when });
    expect(lines(el)[0]!.querySelector('time')?.getAttribute('datetime')).toBe(when.toISOString());
  });

  it('takes the time of the append when the entry gives none, or gives one that is no date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(14, 30, 2));
    const el = await mount();
    await add(el, { level: 'info', message: 'now' }, { level: 'info', message: 'bad', at: new Date(NaN) });
    expect(lines(el).map((l) => l.querySelector('.time')?.textContent)).toEqual(['14:30:02', '14:30:02']);
  });

  it('marks each level apart, in words as well as colour', async () => {
    // A colour alone says nothing to a screen reader or to someone who cannot tell red from
    // orange: the level is written on the line.
    const el = await mount();
    await add(el, { level: 'info', message: 'i' }, { level: 'warning', message: 'w' }, { level: 'error', message: 'e' });
    expect(lines(el).map((l) => [l.className.replace('line', '').trim(), l.querySelector('.level')?.textContent])).toEqual([
      ['info', 'info'],
      ['warning', 'warning'],
      ['error', 'error'],
    ]);
  });

  it('reads a level it does not know as info', async () => {
    const el = await mount();
    await add(el, { level: 'debug' as LogEntry['level'], message: 'odd' });
    expect(lines(el)[0]!.classList.contains('info')).toBe(true);
    expect(lines(el)[0]!.querySelector('.level')?.textContent).toBe('info');
  });

  it('shows the message as text, not markup', async () => {
    // A message quotes a file's name or a source's reason, and both come from outside.
    const el = await mount();
    await add(el, { level: 'error', message: '<img src=x onerror=alert(1)>' });
    expect(el.shadowRoot!.querySelector('.line img')).toBeNull();
    expect(messages(el)).toEqual(['<img src=x onerror=alert(1)>']);
  });
});

describe('the lines', () => {
  it('are listed oldest first, as appended', async () => {
    const el = await mount();
    await add(el, { level: 'info', message: 'one' }, { level: 'error', message: 'two' }, { level: 'info', message: 'three' });
    expect(messages(el)).toEqual(['one', 'two', 'three']);
  });

  it('keep the latest thousand, dropping the oldest', async () => {
    const el = await mount();
    for (let i = 0; i < 1005; i++) el.appendEntry({ level: 'info', message: `#${i}` });
    await el.updateComplete;
    const shown = messages(el);
    expect(shown).toHaveLength(1000);
    expect(shown[0]).toBe('#5');
    expect(shown.at(-1)).toBe('#1004');
  });

  it("are added by appendEntry, which leaves the DOM's own append() as it is", async () => {
    // append(node) is every element's, and a log line is no node: taking the name would break
    // it for whatever library on the page calls it.
    const el = await mount();
    const child = document.createElement('span');
    el.append(child);
    expect(child.parentNode).toBe(el);
    expect(lines(el)).toEqual([]);
  });

  it('are in a log region a screen reader follows, which the keyboard can scroll', async () => {
    const el = await mount();
    const log = region(el);
    expect(log.getAttribute('aria-label')).toBe('Log');
    expect(log.getAttribute('tabindex')).toBe('0');
    await add(el, { level: 'info', message: 'x' });
    expect(log.contains(lines(el)[0]!)).toBe(true);
  });

  it('say there are none while the log is empty', async () => {
    const el = await mount();
    expect(lines(el)).toEqual([]);
    expect(note(el)).toBe('No log entries');
    await add(el, { level: 'info', message: 'x' });
    expect(note(el)).toBeUndefined();
  });
});

describe('clearing', () => {
  it('clear() takes every line away and sends nothing', async () => {
    const el = await mount();
    const heard: unknown[] = [];
    el.addEventListener('dex-log-cleared', (e) => heard.push(e.detail));
    await add(el, { level: 'info', message: 'a' }, { level: 'error', message: 'b' });
    el.clear();
    await el.updateComplete;
    expect(lines(el)).toEqual([]);
    expect(note(el)).toBe('No log entries');
    expect(heard).toEqual([]);
  });

  it('the Clear button takes every line away and sends dex-log-cleared, to the document', async () => {
    const el = await mount();
    await add(el, { level: 'info', message: 'a' });
    const heard: unknown[] = [];
    const listen = (e: CustomEvent<null>): void => {
      heard.push(e.detail);
    };
    document.addEventListener('dex-log-cleared', listen);
    clearButton(el).click();
    document.removeEventListener('dex-log-cleared', listen);
    await el.updateComplete;
    expect(lines(el)).toEqual([]);
    expect(heard).toEqual([null]);
  });

  it('the Clear button is a button that stays where the keyboard is', async () => {
    // Never disabled by an empty log: a button disabled while it has the focus drops the focus
    // to the page.
    const el = await mount();
    expect(clearButton(el).getAttribute('type')).toBe('button');
    expect(clearButton(el).textContent?.trim()).toBe('Clear');
    expect(clearButton(el).disabled).toBe(false);
  });

  it('lines appended after a clear are shown', async () => {
    const el = await mount();
    await add(el, { level: 'info', message: 'old' });
    el.clear();
    await add(el, { level: 'info', message: 'new' });
    expect(messages(el)).toEqual(['new']);
  });
});

describe('the level filter', () => {
  const MIXED: LogEntry[] = [
    { level: 'info', message: 'opened' },
    { level: 'warning', message: 'slow' },
    { level: 'error', message: 'failed' },
    { level: 'info', message: 'saved' },
  ];

  it('is a radio group of All, Warnings and Errors, on All at first', async () => {
    const el = await mount();
    const group = el.shadowRoot!.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Show');
    expect(segments(el).map((b) => b.textContent?.trim())).toEqual(['All', 'Warnings', 'Errors']);
    expect(segments(el).map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    // The checked segment is the group's one Tab stop.
    expect(segments(el).map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(el.filter).toBe('all');
  });

  it('Warnings shows warnings and errors; Errors shows errors alone; All shows every line', async () => {
    const el = await mount();
    await add(el, ...MIXED);
    segment(el, 'Warnings').click();
    await el.updateComplete;
    expect(messages(el)).toEqual(['slow', 'failed']);
    segment(el, 'Errors').click();
    await el.updateComplete;
    expect(messages(el)).toEqual(['failed']);
    segment(el, 'All').click();
    await el.updateComplete;
    expect(messages(el)).toEqual(['opened', 'slow', 'failed', 'saved']);
  });

  it('narrows what is shown, never what is kept', async () => {
    const el = await mount();
    segment(el, 'Errors').click();
    await add(el, ...MIXED);
    expect(messages(el)).toEqual(['failed']);
    segment(el, 'All').click();
    await el.updateComplete;
    expect(messages(el)).toHaveLength(4);
  });

  it('sends dex-log-filter-changed with the filter chosen, and reflects it', async () => {
    const el = await mount();
    const heard: LogFilterChangedDetail[] = [];
    const listen = (e: CustomEvent<LogFilterChangedDetail>): void => {
      heard.push(e.detail);
    };
    document.addEventListener('dex-log-filter-changed', listen);
    segment(el, 'Errors').click();
    await el.updateComplete;
    document.removeEventListener('dex-log-filter-changed', listen);
    expect(heard).toEqual([{ filter: 'error' }]);
    expect(el.filter).toBe('error');
    expect(el.getAttribute('filter')).toBe('error');
    expect(segment(el, 'Errors').getAttribute('aria-checked')).toBe('true');
    // The segment already checked changes nothing, so it says nothing.
    const again: unknown[] = [];
    el.addEventListener('dex-log-filter-changed', (e) => again.push(e.detail));
    segment(el, 'Errors').click();
    expect(again).toEqual([]);
  });

  it('is set by the app through the property or the attribute, sending nothing', async () => {
    const el = await mount();
    const heard: unknown[] = [];
    el.addEventListener('dex-log-filter-changed', (e) => heard.push(e.detail));
    await add(el, ...MIXED);
    el.filter = 'warning';
    await el.updateComplete;
    expect(messages(el)).toEqual(['slow', 'failed']);
    el.setAttribute('filter', 'error');
    await el.updateComplete;
    expect(messages(el)).toEqual(['failed']);
    expect(heard).toEqual([]);
  });

  it('reads a filter it does not know as All', async () => {
    const el = await mount();
    await add(el, ...MIXED);
    el.setAttribute('filter', 'verbose');
    await el.updateComplete;
    expect(messages(el)).toHaveLength(4);
    expect(segment(el, 'All').getAttribute('aria-checked')).toBe('true');
  });

  it('moves and chooses with the arrow keys, wrapping, as a radio group does', async () => {
    const el = await mount();
    const key = (k: string, init: KeyboardEventInit = {}): void => {
      (el.shadowRoot!.activeElement as HTMLElement ?? segments(el)[0]!).dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }),
      );
    };
    segment(el, 'All').focus();
    key('ArrowRight');
    await el.updateComplete;
    expect(el.filter).toBe('warning');
    expect(el.shadowRoot!.activeElement?.textContent?.trim()).toBe('Warnings');
    key('ArrowLeft');
    key('ArrowLeft');
    await el.updateComplete;
    expect(el.filter).toBe('error');
    // With a modifier the key is a chord of the shell's, and left alone.
    key('ArrowRight', { metaKey: true });
    await el.updateComplete;
    expect(el.filter).toBe('error');
  });

  it('says when no line is at the level chosen', async () => {
    const el = await mount();
    await add(el, { level: 'info', message: 'opened' });
    segment(el, 'Warnings').click();
    await el.updateComplete;
    expect(note(el)).toBe('No warnings or errors');
    segment(el, 'Errors').click();
    await el.updateComplete;
    expect(note(el)).toBe('No errors');
  });
});

describe('following the newest line', () => {
  it('scrolls to the newest line as lines are appended', async () => {
    const el = await mount();
    measure(region(el), 500);
    await add(el, { level: 'info', message: 'a' });
    expect(region(el).scrollTop).toBe(500);
    measure(region(el), 520);
    await add(el, { level: 'info', message: 'b' });
    expect(region(el).scrollTop).toBe(520);
  });

  it('holds still once the user has scrolled up, and follows again back at the bottom', async () => {
    const el = await mount();
    const log = region(el);
    measure(log, 500);
    await add(el, { level: 'info', message: 'a' });
    scrollTo(log, 120);
    measure(log, 520);
    await add(el, { level: 'info', message: 'b' });
    expect(log.scrollTop).toBe(120);
    // Back to the bottom: 520 of lines in a box of 100, scrolled to 420.
    scrollTo(log, 420);
    measure(log, 540);
    await add(el, { level: 'info', message: 'c' });
    expect(log.scrollTop).toBe(540);
  });

  it('counts a few pixels short of the bottom as the bottom', async () => {
    // A zoomed page scrolls in fractions of a pixel, and the last one is not always reached.
    const el = await mount();
    const log = region(el);
    measure(log, 500);
    scrollTo(log, 398);
    measure(log, 520);
    await add(el, { level: 'info', message: 'x' });
    expect(log.scrollTop).toBe(520);
  });

  it('follows again after a clear and after a change of filter', async () => {
    const el = await mount();
    const log = region(el);
    measure(log, 500);
    await add(el, { level: 'info', message: 'a' });
    scrollTo(log, 0);
    el.clear();
    await add(el, { level: 'info', message: 'b' });
    expect(log.scrollTop).toBe(500);
    scrollTo(log, 0);
    segment(el, 'Errors').click();
    await el.updateComplete;
    expect(log.scrollTop).toBe(500);
  });

  it('scrolls to the newest line when its box changes size, as when the panel is shown again', async () => {
    // Hidden, the panel has no box to scroll, and the lines appended meanwhile are below the fold
    // when it is shown: the resize that showing it makes brings the newest line back.
    let report: (() => void) | null = null;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) {
        report = callback;
      }
      observe(): void {}
      disconnect(): void {}
    });
    const el = await mount();
    const log = region(el);
    measure(log, 0, 0);
    await add(el, { level: 'info', message: 'a' }, { level: 'info', message: 'b' });
    measure(log, 300);
    expect(report).not.toBeNull();
    report!();
    expect(log.scrollTop).toBe(300);
    // But not while the user is reading further up.
    scrollTo(log, 50);
    measure(log, 400);
    report!();
    expect(log.scrollTop).toBe(50);
  });

  it('lets go of its resize observer when it leaves the page', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      disconnect = disconnect;
    });
    const el = await mount();
    el.remove();
    expect(disconnect).toHaveBeenCalled();
  });
});
