// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-search-panel>: the app shell's Search view, as the prototype's search panel works (a box,
// the matches under it, the arrows and Enter to pick one), over view's own search model. It
// searches nothing itself: what the user types goes out as `dex-search-query`, once they pause, and
// the app answers by setting `results` (searchEntries' items). So what is pinned here is the
// asking (when a query is sent, and when it is not), what the panel draws for the results it is
// given (grouped by file, a row's place in its file, the count, the empty and busy states), and
// what each key and click asks for: `dex-search-open` names the file and the name to reveal, which
// for a block is its key and not the label four blocks may share.
//
// The results are made by the model's own searchItem from hand-made name records, so the rows
// drawn are the ones an app's searchEntries would hand over.
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DexSearchPanel,
  defineSearchPanel,
  type SearchPanelEventMap,
} from '../src/widgets/app-shell/modules/dex-search-panel.js';
import { MAX_SEARCH_RESULTS, searchItem, type SearchItem } from '../src/model/search/searchItems.js';
import type { NameRecord } from '../src/model/search/nameExtract.js';

beforeAll(() => defineSearchPanel());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const dict = (name: string, file = 'params.sldd', dir = 'w'): NameRecord => ({
  name,
  sourceUri: `file:///${dir}/${file}`,
  sourceLabel: file,
  kind: 'sldd',
});
const mat = (name: string): NameRecord => ({ name, sourceUri: 'file:///w/plant.mat', sourceLabel: 'plant.mat', kind: 'mat' });
const block = (name: string, sid: string, path: string): NameRecord => ({
  name,
  sourceUri: 'file:///w/ctrl.slx',
  sourceLabel: 'ctrl.slx',
  kind: 'block',
  selectName: sid,
  blockPath: path,
});
const ws = (name: string): NameRecord => ({ name, sourceUri: 'file:///w/ctrl.slx', sourceLabel: 'ctrl.slx', kind: 'workspace' });

// A search for "k", as searchEntries orders it (by name, then file): the files interleave.
const RESULTS: SearchItem[] = [block('Gain', '7', 'Controller/Gain'), dict('Ki'), dict('Kp'), mat('Kp'), ws('k'), block('Kick', '9', 'Kick')].map(
  searchItem,
);

async function panel(props: Partial<Pick<DexSearchPanel, 'results' | 'query' | 'searching' | 'scope'>> = {}): Promise<DexSearchPanel> {
  const el = document.createElement('dex-search-panel');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const input = (el: DexSearchPanel): HTMLInputElement => el.shadowRoot!.querySelector('input')!;
const options = (el: DexSearchPanel): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
const groups = (el: DexSearchPanel): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="group"]')];
const text = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const status = (el: DexSearchPanel): string => text(el.shadowRoot!.querySelector('.status'));
// A row as the user reads it: its label, then where it is in its file.
const rowText = (row: HTMLElement): string => [text(row.querySelector('.label')), text(row.querySelector('.where'))].filter(Boolean).join(' | ');
const active = (el: DexSearchPanel): string => {
  const id = input(el).getAttribute('aria-activedescendant');
  const row = id ? el.shadowRoot!.getElementById(id) : null;
  return row ? rowText(row) : '';
};

function type(el: DexSearchPanel, value: string): void {
  input(el).value = value;
  input(el).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

function key(el: DexSearchPanel, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  input(el).dispatchEvent(e);
  return e;
}

/** The details of every `name` the panel sends from now on. */
function heard<K extends keyof SearchPanelEventMap>(el: DexSearchPanel, name: K): SearchPanelEventMap[K]['detail'][] {
  const seen: SearchPanelEventMap[K]['detail'][] = [];
  el.addEventListener(name, (e) => seen.push(e.detail));
  return seen;
}

describe('dex-search-panel: the box', () => {
  it('is a search field, with the placeholder and the scope under it', async () => {
    const el = await panel({ scope: 'Open files and the folder' });
    expect(input(el).type).toBe('search');
    // Names, and not values or types: the model matches entry names, files and block paths only.
    expect(input(el).placeholder).toBe('Search entry names');
    expect(input(el).getAttribute('aria-label')).toBe('Search');
    expect(text(el.shadowRoot!.querySelector('.scope'))).toBe('Open files and the folder');
  });

  it('draws no scope line without a scope', async () => {
    const el = await panel();
    expect(el.shadowRoot!.querySelector('.scope')).toBeNull();
  });

  it('has an attribute for each setting a page might write in markup', () => {
    const observed = (DexSearchPanel as unknown as { observedAttributes: string[] }).observedAttributes;
    expect([...observed].sort()).toEqual(['query', 'scope', 'searching']);
  });

  it('shows a query the app sets, and asks for nothing', async () => {
    vi.useFakeTimers();
    const el = await panel();
    const asked = heard(el, 'dex-search-query');
    el.query = 'Kp';
    await el.updateComplete;
    expect(input(el).value).toBe('Kp');
    vi.advanceTimersByTime(1000);
    expect(asked).toEqual([]);
  });

  it('focusInput() puts the focus in the box, its text selected to type over', async () => {
    const el = await panel({ query: 'Kp' });
    const select = vi.spyOn(input(el), 'select');
    el.focusInput();
    await el.updateComplete;
    expect(el.shadowRoot!.activeElement).toBe(input(el));
    expect(select).toHaveBeenCalled();
  });
});

describe('dex-search-panel: asking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('asks once the typing pauses for 150 ms, with what the box then holds', async () => {
    const el = await panel();
    const asked = heard(el, 'dex-search-query');
    type(el, 'K');
    vi.advanceTimersByTime(100);
    type(el, 'Kp');
    vi.advanceTimersByTime(149);
    expect(asked).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(asked).toEqual([{ query: 'Kp' }]);
    expect(el.query).toBe('Kp');
  });

  it('asks again for the empty box when the user deletes what they typed', async () => {
    const el = await panel();
    const asked = heard(el, 'dex-search-query');
    type(el, 'K');
    vi.advanceTimersByTime(150);
    type(el, '');
    vi.advanceTimersByTime(150);
    expect(asked).toEqual([{ query: 'K' }, { query: '' }]);
  });

  it('sends a request that bubbles out of the shadow root', async () => {
    const el = await panel();
    const events: CustomEvent[] = [];
    document.addEventListener('dex-search-query', (e) => events.push(e), { once: true });
    type(el, 'K');
    vi.advanceTimersByTime(150);
    expect(events[0]?.bubbles).toBe(true);
    expect(events[0]?.composed).toBe(true);
  });

  it('asks nothing after it leaves the page', async () => {
    const el = await panel();
    const asked = heard(el, 'dex-search-query');
    type(el, 'K');
    el.remove();
    vi.advanceTimersByTime(1000);
    expect(asked).toEqual([]);
  });

  it('clears on Escape: the box, the results, and at once, the empty query', async () => {
    const el = await panel({ query: 'K', results: RESULTS });
    const asked = heard(el, 'dex-search-query');
    type(el, 'Ki');
    const e = key(el, 'Escape');
    expect(asked).toEqual([{ query: '' }]);
    // The Ki that was still waiting is not sent after the clear.
    vi.advanceTimersByTime(1000);
    expect(asked).toEqual([{ query: '' }]);
    await el.updateComplete;
    expect(input(el).value).toBe('');
    expect(el.query).toBe('');
    expect(options(el)).toEqual([]);
    expect(e.defaultPrevented).toBe(true);
  });

  it('keeps the Escape that cleared the box to itself, and leaves the one on an empty box to the page', async () => {
    const el = await panel({ query: 'K', results: RESULTS });
    let outside = 0;
    const count = (): void => void outside++;
    document.addEventListener('keydown', count);
    onTestFinished(() => document.removeEventListener('keydown', count));
    key(el, 'Escape');
    expect(outside).toBe(0);
    await el.updateComplete;
    const asked = heard(el, 'dex-search-query');
    const e = key(el, 'Escape');
    expect(outside).toBe(1);
    expect(e.defaultPrevented).toBe(false);
    expect(asked).toEqual([]);
  });
});

describe('dex-search-panel: the results', () => {
  it('groups the results by file, in the order the files first come, each row under its file', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    expect(groups(el).map((g) => text(g.querySelector('.file-name')))).toEqual(['ctrl.slx', 'params.sldd', 'plant.mat']);
    expect(groups(el).map((g) => g.getAttribute('aria-label'))).toEqual(['ctrl.slx', 'params.sldd', 'plant.mat']);
    expect(groups(el).map((g) => [...g.querySelectorAll<HTMLElement>('[role="option"]')].map(rowText))).toEqual([
      ['Gain | Controller/Gain', 'k', 'Kick'],
      ['Ki', 'Kp'],
      ['Kp'],
    ]);
    expect(groups(el).map((g) => text(g.querySelector('.file-count')))).toEqual(['3', '2', '1']);
  });

  it('keeps apart two files of the same name in two folders', async () => {
    const el = await panel({ query: 'k', results: [dict('Kp', 'params.sldd', 'a'), dict('Kp', 'params.sldd', 'b')].map(searchItem) });
    expect(groups(el).map((g) => text(g.querySelector('.file-name')))).toEqual(['params.sldd', 'params.sldd']);
    expect(groups(el).map((g) => g.querySelector<HTMLElement>('.file')!.title)).toEqual(['file:///a/params.sldd', 'file:///b/params.sldd']);
  });

  it("draws each row's icon, and its whole description as its tooltip", async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const icons = options(el).map((row) => (row.querySelector('dex-icon') as unknown as { iconId: string }).iconId);
    expect(icons).toEqual(['wsSignal', 'wsParameters', 'wsSignal', 'wsDefault', 'wsDefault', 'wsNumeric']);
    expect(options(el)[0]!.title).toBe('Controller/Gain · ctrl.slx');
    expect(options(el)[3]!.title).toBe('params.sldd');
  });

  it("heads each file with its kind's icon, and every one ships in icons/", async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const icons = groups(el).map((g) => (g.querySelector('dex-icon') as unknown as { iconId: string }).iconId);
    expect(icons).toEqual(['simulink', 'simulink_database', 'matlabWorkspaceFile']);
    for (const id of icons) expect(existsSync(join(process.cwd(), 'icons', `${id}.svg`)), id).toBe(true);
  });

  it('marks where the query matches in each name', async () => {
    const el = await panel({ query: 'ic', results: [dict('Kick'), dict('Pick'), dict('Other')].map(searchItem) });
    expect(options(el).map((row) => text(row.querySelector('mark')))).toEqual(['ic', 'ic', '']);
    expect(text(options(el)[0]!.querySelector('.label'))).toBe('Kick');
  });

  it('shows no results for an empty box, whatever it was last given', async () => {
    const el = await panel({ query: '', results: RESULTS });
    expect(options(el)).toEqual([]);
    expect(status(el)).toBe('');
  });

  it('counts the results, and says when the list stops at its cap', async () => {
    const el = await panel({ query: 'k', results: RESULTS.slice(0, 1) });
    expect(status(el)).toBe('1 result');
    el.results = RESULTS;
    await el.updateComplete;
    expect(status(el)).toBe('6 results');
    el.results = Array.from({ length: MAX_SEARCH_RESULTS }, (_, i) => searchItem(dict(`k${i}`)));
    await el.updateComplete;
    expect(status(el)).toBe(`${MAX_SEARCH_RESULTS}+ results, first ${MAX_SEARCH_RESULTS} shown`);
  });

  it('says No matches when a query has none', async () => {
    const el = await panel({ query: 'zzz', results: [] });
    expect(status(el)).toBe('No matches');
  });

  it('says it is searching while the app says so, and marks the list busy', async () => {
    const el = await panel({ query: 'k', results: [], searching: true });
    expect(status(el)).toBe('Searching…');
    expect(el.shadowRoot!.querySelector('[role="listbox"]')!.getAttribute('aria-busy')).toBe('true');
    el.searching = false;
    await el.updateComplete;
    expect(status(el)).toBe('No matches');
    expect(el.shadowRoot!.querySelector('[role="listbox"]')!.getAttribute('aria-busy')).toBe('false');
  });

  it('reads the count out, as a status', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    expect(el.shadowRoot!.querySelector('.status')!.getAttribute('role')).toBe('status');
  });
});

describe('dex-search-panel: picking a result', () => {
  it('is a combobox over a listbox, its first result active once the results arrive', async () => {
    const el = await panel({ query: 'k' });
    const box = input(el);
    expect(box.getAttribute('role')).toBe('combobox');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
    el.results = RESULTS;
    await el.updateComplete;
    const list = el.shadowRoot!.querySelector('[role="listbox"]')!;
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(active(el)).toBe('Gain | Controller/Gain');
    expect(options(el).map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
  });

  it('walks the rows as drawn with the arrows, across the files, stopping at both ends', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const walked: string[] = [];
    for (let i = 0; i < 7; i++) {
      expect(key(el, 'ArrowDown').defaultPrevented).toBe(true);
      await el.updateComplete;
      walked.push(active(el));
    }
    expect(walked).toEqual(['k', 'Kick', 'Ki', 'Kp', 'Kp', 'Kp', 'Kp']);
    expect(groups(el)[2]!.querySelector('[aria-selected="true"]')).not.toBeNull();
    key(el, 'ArrowUp');
    await el.updateComplete;
    expect(active(el)).toBe('Kp');
    expect(groups(el)[1]!.querySelector('[aria-selected="true"]')).not.toBeNull();
    for (let i = 0; i < 9; i++) key(el, 'ArrowUp');
    await el.updateComplete;
    expect(active(el)).toBe('Gain | Controller/Gain');
  });

  it('opens the active result on Enter: its file and the name it is revealed by', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const opened = heard(el, 'dex-search-open');
    expect(key(el, 'Enter').defaultPrevented).toBe(true);
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'Enter');
    // A block by its key, and not the label four blocks may share.
    expect(opened).toEqual([
      { sourceUri: 'file:///w/ctrl.slx', revealName: '7' },
      { sourceUri: 'file:///w/params.sldd', revealName: 'Ki' },
    ]);
  });

  it('opens a result that is clicked, and makes it the active one', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const opened = heard(el, 'dex-search-open');
    options(el)[5]!.click();
    await el.updateComplete;
    expect(opened).toEqual([{ sourceUri: 'file:///w/plant.mat', revealName: 'Kp' }]);
    expect(input(el).getAttribute('aria-activedescendant')).toBe(options(el)[5]!.id);
  });

  it('keeps the focus in the box when a row is pressed', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const down = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true });
    options(el)[1]!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('starts again from the first result when the results change', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    el.results = RESULTS.slice(3);
    await el.updateComplete;
    expect(active(el)).toBe('Kp');
    expect(options(el)[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('opens nothing on Enter with no results, and lets the arrows be', async () => {
    const el = await panel({ query: 'zzz', results: [] });
    const opened = heard(el, 'dex-search-open');
    key(el, 'Enter');
    key(el, 'ArrowDown');
    expect(opened).toEqual([]);
    expect(input(el).hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('on Enter before the results of what was typed, asks for them at once and opens nothing', async () => {
    vi.useFakeTimers();
    const el = await panel({ query: 'k', results: RESULTS });
    const asked = heard(el, 'dex-search-query');
    const opened = heard(el, 'dex-search-open');
    type(el, 'ki');
    key(el, 'Enter');
    expect(asked).toEqual([{ query: 'ki' }]);
    expect(opened).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(asked).toEqual([{ query: 'ki' }]);
  });

  it('leaves a chord to the app: a modified arrow or Enter moves and opens nothing', async () => {
    const el = await panel({ query: 'k', results: RESULTS });
    const opened = heard(el, 'dex-search-open');
    expect(key(el, 'ArrowDown', { altKey: true }).defaultPrevented).toBe(false);
    key(el, 'Enter', { metaKey: true });
    key(el, 'Enter', { ctrlKey: true });
    await el.updateComplete;
    expect(active(el)).toBe('Gain | Controller/Gain');
    expect(opened).toEqual([]);
  });
});

describe('defineSearchPanel', () => {
  it('registers the panel and the icon its rows draw', () => {
    expect(customElements.get('dex-search-panel')).toBe(DexSearchPanel);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
