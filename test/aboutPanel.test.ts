// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's About popover, opened from the (i) button at the foot of an activity bar: a heading
// and the lines an app hands it (its version, the versions it is built on), some under a section's
// heading (Built on, Dependencies). The app's own words, drawn as text: a version string is data,
// and must never become markup.
//
// It opens and closes as the Settings popover does (settingsPanel.test.ts holds that behaviour in
// full): beside its button, closed by Escape or a press outside, with its document listeners gone
// once it is, and focus back on the button.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DexAboutPanel, defineAboutPanel } from '../src/widgets/app-shell/dex-about-panel.js';
import type { Rect } from '../src/model/shell/placement.js';

defineAboutPanel();

// An (i) button at the foot of a 48px left bar, in a 1024x768 window.
const INFO: Rect = { x: 0, y: 680, width: 48, height: 40 };
const LINES = [
  { label: 'Version', value: '1.0.0' },
  { label: 'data-explorer-core', value: '1.58.0' },
];

let panel: DexAboutPanel | null = null;
let opener: HTMLButtonElement | null = null;

async function open(lines = LINES, heading?: string): Promise<DexAboutPanel> {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  panel = new DexAboutPanel();
  if (heading !== undefined) panel.heading = heading;
  panel.lines = lines;
  const r = { x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 90, width: 200, height: 90 };
  panel.getBoundingClientRect = () => ({ ...r, toJSON: () => r }) as DOMRect;
  document.body.append(panel);
  panel.show(INFO);
  await panel.updateComplete;
  return panel;
}

function shownLines(el: DexAboutPanel): [string, string][] {
  return Array.from(el.shadowRoot!.querySelectorAll('.line')).map((line) => [
    line.querySelector('dt')!.textContent!.trim(),
    line.querySelector('dd')!.textContent!.trim(),
  ]);
}

function key(target: EventTarget, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));
}

function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: 500, clientY: 300 }));
}

afterEach(() => {
  panel?.close();
  panel?.remove();
  opener?.remove();
  panel = null;
  opener = null;
  vi.restoreAllMocks();
});

describe('what it shows', () => {
  it('the heading, then each line as a label and its value, in order', async () => {
    const el = await open(LINES, 'Data Explorer App');
    expect(el.shadowRoot!.querySelector('.title')!.textContent!.trim()).toBe('Data Explorer App');
    expect(shownLines(el)).toEqual([
      ['Version', '1.0.0'],
      ['data-explorer-core', '1.58.0'],
    ]);
  });

  it("'Data Explorer' when the app names nothing, and the heading attribute when it does", async () => {
    const el = await open();
    expect(el.shadowRoot!.querySelector('.title')!.textContent!.trim()).toBe('Data Explorer');
    el.setAttribute('heading', 'My App');
    await el.updateComplete;
    expect(el.heading).toBe('My App');
    expect(el.shadowRoot!.querySelector('.title')!.textContent!.trim()).toBe('My App');
  });

  it('a dialog named by its heading, which takes focus', async () => {
    const el = await open(LINES, 'Data Explorer App');
    const dialog = el.shadowRoot!.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Data Explorer App');
    expect(el.shadowRoot!.activeElement).toBe(dialog);
  });

  it('follows `lines` when the app sets them while it is open', async () => {
    const el = await open();
    el.lines = [{ label: 'Build', value: 'dev' }];
    await el.updateComplete;
    expect(shownLines(el)).toEqual([['Build', 'dev']]);
  });

  it('draws the lines as text, not markup', async () => {
    const el = await open([{ label: '<i>x</i>', value: '<img src=x onerror=alert(1)>' }]);
    expect(el.shadowRoot!.querySelector('.line i, .line img')).toBeNull();
    expect(shownLines(el)).toEqual([['<i>x</i>', '<img src=x onerror=alert(1)>']]);
  });

  it('nothing while closed, and the open attribute only while open', async () => {
    const el = await open();
    expect(el.hasAttribute('open')).toBe(true);
    el.close();
    await el.updateComplete;
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('sections', () => {
  // The popover's parts in order: the title, each section's heading, each line.
  function parts(el: DexAboutPanel): string[] {
    return Array.from(el.shadowRoot!.querySelectorAll('.title, .section, .line')).map((part) =>
      part.classList.contains('line') ? `line ${part.querySelector('dt')!.textContent!.trim()}` : `${part.className} ${part.textContent!.trim()}`,
    );
  }

  it("draws the lines with no section under the app's name, then each section under its heading", async () => {
    const el = await open([
      { label: 'Version', value: '1.0.0' },
      { label: 'data-explorer-view', value: '1.9.0', section: 'Built on' },
      { label: 'Build date', value: '2026-11-06' },
      { label: 'data-explorer-core', value: '1.58.0', section: 'Built on' },
    ], 'Data Explorer App');
    expect(parts(el)).toEqual([
      'title Data Explorer App',
      'line Version',
      'line Build date',
      'section Built on',
      'line data-explorer-view',
      'line data-explorer-core',
    ]);
    // Each section's lines are a list of their own, after its heading.
    const lists = el.shadowRoot!.querySelectorAll('dl.lines');
    expect(Array.from(lists, (dl) => dl.querySelectorAll('.line').length)).toEqual([2, 2]);
  });

  it('heads a section for a screen reader, under the dialog, and as text, not markup', async () => {
    const el = await open([{ label: 'Lit', value: '3.2', section: '<b>Dependencies</b>' }]);
    const heading = el.shadowRoot!.querySelector('.section')!;
    expect(heading.getAttribute('role')).toBe('heading');
    expect(heading.getAttribute('aria-level')).toBe('3');
    expect(heading.querySelector('b')).toBeNull();
    expect(heading.textContent!.trim()).toBe('<b>Dependencies</b>');
  });

  it('follows a section added while it is open', async () => {
    const el = await open();
    el.lines = [...LINES, { label: 'Lit', value: '3.2', section: 'Dependencies' }];
    await el.updateComplete;
    expect(parts(el).slice(-2)).toEqual(['section Dependencies', 'line Lit']);
  });
});

describe('opening and closing', () => {
  it('opens beside its button, bottoms in line', async () => {
    const el = await open();
    expect(el.style.left).toBe('52px');
    expect(el.style.top).toBe(`${720 - 90}px`);
  });

  it('closes on Escape, and gives focus back', async () => {
    const el = await open();
    key(el.shadowRoot!.activeElement!, 'Escape');
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a press outside, not on one inside', async () => {
    const el = await open();
    press(el.shadowRoot!.querySelector('.line')!);
    expect(el.open).toBe(true);
    press(document.body);
    expect(el.open).toBe(false);
  });

  it('removes the listeners it added when it closes', async () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const ours = (calls: unknown[][]) => calls.filter(([type]) => type === 'keydown' || type === 'pointerdown');
    const el = await open();
    expect(ours(added.mock.calls)).toHaveLength(2);
    el.close();
    expect(ours(removed.mock.calls)).toEqual(ours(added.mock.calls));
  });
});
