// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-project-page>: the VS Code extension's project page webview (its project-main.ts) as an
// element, and these are that webview's tests (its projectMain.test.ts) on the element, with its
// postMessage boundary become the `dex-project-open` event. projectPageRender.test.ts covers WHAT
// the page says; this covers what needs a document: the stylesheet, the delegated listeners, the
// filters kept across a repaint, and the links.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectPage } from 'data-explorer-core';
import {
  DexProjectPage,
  ROW_CAP,
  defineProjectPage,
  type ProjectOpenDetail,
  type ProjectPagePayload,
} from '../src/widgets/project-page/index.js';

function page(over: Partial<ProjectPage> = {}): ProjectPage {
  return {
    name: 'Monophonic',
    format: 'fixedPathV2',
    formatLabel: 'multiple XML files',
    memberCount: 12,
    labelledCount: 3,
    startup: [],
    shutdown: [],
    shortcuts: [],
    pathFolders: [],
    locations: [],
    categories: [],
    references: [],
    warnings: [],
    ...over,
  };
}

// Enough shortcuts to earn a filter box, with one whose name and path both hold 'gain'.
const SHORTCUTS = [
  { name: 'Open gain model', file: 'models/gain.slx', group: '' },
  ...Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, file: `s${i}.m`, group: '' })),
];

const ROOT = '/work/Monophonic';

let el: DexProjectPage;
const opened: ProjectOpenDetail[] = [];

async function show(over: Partial<ProjectPage> = {}, root = ROOT, more: Partial<ProjectPagePayload> = {}): Promise<void> {
  el.payload = { page: page(over), root, ...more };
  await el.updateComplete;
}

const pageEl = () => el.shadowRoot!.querySelector('.dex-page') as HTMLElement;
const errorEl = () => el.shadowRoot!.querySelector('[role="alert"]') as HTMLElement | null;
const filter = () => el.shadowRoot!.querySelector('input.filter[data-section="shortcuts"]') as HTMLInputElement;
const link = (path: string) => el.shadowRoot!.querySelector(`[data-open="${path}"]`) as HTMLElement;

function click(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

/** Types into a section's filter box the way a keystroke does: value, then `input`. */
async function type(input: HTMLInputElement, value: string, caret = value.length): Promise<void> {
  input.value = value;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await el.updateComplete;
}

beforeAll(() => defineProjectPage());

beforeEach(async () => {
  document.body.replaceChildren();
  el = document.createElement('dex-project-page');
  el.addEventListener('dex-project-open', (e) => opened.push(e.detail));
  document.body.append(el);
  await show({ shortcuts: SHORTCUTS });
  opened.length = 0;
});

describe('the project page', () => {
  it('draws in its own shadow root, with its stylesheet adopted rather than injected', () => {
    expect(pageEl()).not.toBeNull();
    expect(document.querySelector('.dex-page')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
    const css = DexProjectPage.styles.flat(Infinity).map((s: any) => s.cssText).join('');
    expect(css).toContain('.dex-page');
    expect(css).toContain(':host');
  });

  it('renders the project it is given', () => {
    expect(pageEl().innerHTML).toContain('Monophonic');
    expect(pageEl().innerHTML).toContain(ROOT);
  });

  it('draws nothing with no project', async () => {
    el.payload = null;
    await el.updateComplete;
    expect(pageEl().innerHTML).toBe('');
  });
});

describe('clicking a hyperlink', () => {
  it('asks the app to open the path, not the text on screen', () => {
    click(link('models/gain.slx'));
    expect(opened).toEqual([{ path: 'models/gain.slx' }]);
  });

  it('still sends the whole path when the click lands on a highlighted part of it', async () => {
    // As soon as a filter matches inside a link its text is wrapped in <mark>, and that
    // <mark> is what a click on the highlighted characters targets.
    await type(filter(), 'gain');
    const mark = pageEl().querySelector('a.link mark') as HTMLElement;
    expect(mark).not.toBeNull();
    click(mark);
    expect(opened).toEqual([{ path: 'models/gain.slx' }]);
  });

  it('answers Enter and Space, which an <a> without href does not', () => {
    for (const key of ['Enter', ' ']) {
      opened.length = 0;
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true });
      link('models/gain.slx').dispatchEvent(event);
      expect(opened, key).toEqual([{ path: 'models/gain.slx' }]);
      // Space scrolls by default, which is not what pressing it on a focused control means.
      expect(event.defaultPrevented, key).toBe(true);
    }
  });

  it('ignores a key that is not an activation', () => {
    link('models/gain.slx').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }));
    expect(opened).toEqual([]);
  });

  it('asks for nothing when the click misses every link', () => {
    click(pageEl().querySelector('.section') as Element);
    expect(opened).toEqual([]);
  });

  it('opens a location and a reference the same way', async () => {
    await show({
      locations: [{ key: 'SimulinkCacheFolder', label: 'Simulation cache', ref: 'work/cache' }],
      references: [{ name: 'Lib', path: '../Lib/Lib.prj' }],
    });
    click(link('work/cache'));
    click(link('../Lib/Lib.prj'));
    expect(opened).toEqual([{ path: 'work/cache' }, { path: '../Lib/Lib.prj' }]);
  });

  it('sends a bubbling, composed event the document hears', () => {
    const heard: string[] = [];
    document.addEventListener('dex-project-open', (e) => heard.push(e.detail.path), { once: true });
    click(link('models/gain.slx'));
    expect(heard).toEqual(['models/gain.slx']);
  });
});

describe('filtering a section', () => {
  it('narrows the rows without asking the app for anything', async () => {
    await type(filter(), 'gain');
    expect(pageEl().innerHTML).toContain('gain.slx');
    expect(pageEl().innerHTML).not.toContain('s3.m');
    expect(opened).toEqual([]);
  });

  it('keeps the focus and the caret across the repaint it causes', async () => {
    // The repaint replaces the input element, so both have to be restored by hand.
    await type(filter(), 'gain', 2);
    expect(el.shadowRoot!.activeElement).toBe(filter());
    expect(filter().selectionStart).toBe(2);
    expect(filter().value).toBe('gain');
  });

  it('expands a capped section when asked, and stays expanded', async () => {
    await show({ pathFolders: Array.from({ length: ROW_CAP + 1 }, (_, i) => `f${i}`) });
    const rows = () => pageEl().querySelectorAll('.row.single').length;
    expect(rows()).toBe(ROW_CAP);
    click(pageEl().querySelector('[data-expand="path"]') as Element);
    await el.updateComplete;
    expect(rows()).toBe(ROW_CAP + 1);
    expect(opened).toEqual([]);
  });
});

describe('a new page of the project on screen', () => {
  it('keeps the filter a user typed', async () => {
    // The page repaints when the store changes on disk. A user who has narrowed a section while
    // working is not asking for that to be undone because something saved.
    await type(filter(), 'gain');
    await show({ shortcuts: SHORTCUTS });
    expect(filter().value).toBe('gain');
  });

  it('starts clean when a different project arrives', async () => {
    await type(filter(), 'gain');
    await show({ shortcuts: SHORTCUTS }, '/work/Other');
    expect(filter().value).toBe('');
    expect(pageEl().innerHTML).toContain('/work/Other');
  });
});

describe('an error', () => {
  it('is shown, as an alert above the page', async () => {
    el.error = 'Could not read the project.';
    await el.updateComplete;
    expect(errorEl()?.textContent).toBe('Could not read the project.');
    expect(el.getAttribute('error')).toBeNull();
  });

  it('is cleared by the next project that does arrive', async () => {
    el.error = 'Could not read the project.';
    await el.updateComplete;
    await show({ shortcuts: SHORTCUTS });
    expect(el.error).toBe('');
    expect(errorEl()).toBeNull();
  });
});
