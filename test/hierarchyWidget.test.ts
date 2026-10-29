// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-hierarchy>: the rows it draws for a folder's items, how they open (lazily, a level at a
// time, and again after the items are replaced), what a click, the twisty and the keyboard do, and
// what it tells the app. Over hand-made items, so each case shows the rows it is about; the rows a
// real folder makes are FolderHierarchy's (folderHierarchy.test.ts, goldens/hierarchy.test.ts).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineHierarchy, type DexHierarchy, type HierarchyItem, type HierarchySelectDetail } from '../src/widgets/hierarchy/index.js';

beforeAll(() => defineHierarchy());
afterEach(() => document.body.replaceChildren());

const item = (key: string, label: string, more: Partial<HierarchyItem> = {}): HierarchyItem => ({
  label,
  kind: 'sldd',
  collapsible: 'none',
  key,
  ...more,
});

// A folder `w` holding a model with a reference under it, and a dictionary.
const FOLDER = item('/w', 'w', { kind: 'group', groupKind: 'folder', collapsible: 'collapsed', icon: 'simulink_folder' });
const MODEL = item('/w/m', 'm.slx', { kind: 'model', id: 'file:///w/m.slx', health: null, collapsible: 'collapsed', icon: 'simulink' });
const DICT = item('/w/d', 'd.sldd', { id: 'file:///w/d.sldd', health: 'modified', icon: 'simulink_database' });
const GONE = item('/w/m/gone', 'gone.sldd', { kind: 'missing', description: 'unresolved reference' });
const CHILDREN: Record<string, HierarchyItem[]> = { '/w': [MODEL, DICT], '/w/m': [GONE] };

async function settle(el: DexHierarchy): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await el.updateComplete;
  }
}

async function tree(options: { asked?: string[]; children?: Record<string, HierarchyItem[]> } = {}): Promise<DexHierarchy> {
  const el = document.createElement('dex-hierarchy');
  el.loadChildren = async (it) => {
    options.asked?.push(it.key);
    return (options.children ?? CHILDREN)[it.key] ?? [];
  };
  el.items = [FOLDER];
  document.body.append(el);
  await settle(el);
  return el;
}

const rows = (el: DexHierarchy): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
const labels = (el: DexHierarchy): string[] => rows(el).map((r) => r.querySelector('.label')!.textContent!);
const rowOf = (el: DexHierarchy, label: string): HTMLElement => rows(el).find((r) => r.querySelector('.label')!.textContent === label)!;
const press = (el: DexHierarchy, key: string): void => {
  const focused = el.shadowRoot!.activeElement ?? rows(el)[0]!;
  focused.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
};

describe('the rows', () => {
  it('draws the top level, closed, as a tree a screen reader can walk', async () => {
    const el = await tree();
    const root = el.shadowRoot!.querySelector('[role="tree"]')!;
    expect(root.getAttribute('aria-label')).toBe('Files');
    expect(labels(el)).toEqual(['w']);
    const [row] = rows(el);
    expect(row!.getAttribute('aria-level')).toBe('1');
    expect(row!.getAttribute('aria-setsize')).toBe('1');
    expect(row!.getAttribute('aria-posinset')).toBe('1');
    expect(row!.getAttribute('aria-expanded')).toBe('false');
    expect(row!.getAttribute('aria-selected')).toBe('false');
    expect(row!.getAttribute('tabindex')).toBe('0');
    expect(row!.querySelector('dex-icon')!.iconId).toBe('simulink_folder');
  });

  it('opens a row onto the rows loadChildren answers, once, a level deeper', async () => {
    const asked: string[] = [];
    const el = await tree({ asked });
    el.expandedKeys = ['/w', '/w/m'];
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'gone.sldd', 'd.sldd']);
    expect(asked).toEqual(['/w', '/w/m']);
    expect(rowOf(el, 'gone.sldd').getAttribute('aria-level')).toBe('3');
    expect(rowOf(el, 'd.sldd').getAttribute('aria-posinset')).toBe('2');
    expect(rowOf(el, 'd.sldd').getAttribute('aria-setsize')).toBe('2');
    // A row with nothing under it has no twisty, and says nothing of being open.
    expect(rowOf(el, 'd.sldd').hasAttribute('aria-expanded')).toBe(false);
    expect(rowOf(el, 'd.sldd').querySelector('.twisty.empty')).not.toBeNull();
    el.expandedKeys = ['/w'];
    await settle(el);
    el.expandedKeys = ['/w', '/w/m'];
    await settle(el);
    expect(asked).toEqual(['/w', '/w/m']);
  });

  it('draws a notice, the row that says only the first files are shown, with an information mark', async () => {
    const NOTICE = item('/notice%3Atruncated', 'Only the first 2 files are shown', { kind: 'notice', tooltip: 'More files.' });
    const el = await tree();
    el.items = [FOLDER, NOTICE];
    await settle(el);
    const row = rowOf(el, 'Only the first 2 files are shown');
    expect(row.classList.contains('notice')).toBe(true);
    expect(row.querySelector('svg.info')).not.toBeNull();
    expect(row.querySelector('svg.warning, dex-icon')).toBeNull();
    expect(row.getAttribute('aria-expanded')).toBeNull();
    expect(row.title).toBe('More files.');
    expect(rows(el).at(-1)).toBe(row);
  });

  it('marks an unresolved reference with a warning, and a file with unsaved changes with a badge', async () => {
    const el = await tree();
    el.expandedKeys = ['/w', '/w/m'];
    await settle(el);
    const gone = rowOf(el, 'gone.sldd');
    expect(gone.querySelector('svg.warning')).not.toBeNull();
    expect(gone.querySelector('dex-icon')).toBeNull();
    expect(gone.querySelector('.description')!.textContent).toBe('unresolved reference');
    const dict = rowOf(el, 'd.sldd');
    expect(dict.classList.contains('health-modified')).toBe(true);
    expect(dict.querySelector('.badge')!.textContent).toBe('●');
    expect(dict.querySelector('.badge')!.getAttribute('title')).toBe('Modified — unsaved changes in an open editor');
    expect(dict.querySelector('.sr-only')!.textContent).toBe('Modified — unsaved changes in an open editor');
    expect(rowOf(el, 'm.slx').querySelector('.badge')).toBeNull();
  });

  it('keeps open rows open across new items, asking again and showing the old rows meanwhile', async () => {
    const asked: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const el = await tree({ asked });
    el.expandedKeys = ['/w'];
    await settle(el);
    el.loadChildren = async (it) => {
      asked.push(it.key);
      await gate;
      return it.key === '/w' ? [DICT] : [];
    };
    el.items = [{ ...FOLDER }];
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
    expect(rowOf(el, 'w').getAttribute('aria-busy')).toBe('true');
    release();
    await settle(el);
    expect(labels(el)).toEqual(['w', 'd.sldd']);
    expect(rowOf(el, 'w').hasAttribute('aria-busy')).toBe(false);
    expect(asked).toEqual(['/w', '/w']);
  });

  it('opens a row whose read fails onto nothing', async () => {
    const el = await tree();
    el.loadChildren = async () => {
      throw new Error('unreadable');
    };
    el.expandedKeys = ['/w'];
    await settle(el);
    expect(labels(el)).toEqual(['w']);
    expect(rowOf(el, 'w').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('choosing a row', () => {
  it('a click selects it, says which file it opens, and opens or closes it', async () => {
    const el = await tree();
    const heard: HierarchySelectDetail[] = [];
    document.body.addEventListener('dex-hierarchy-select', (e) => heard.push(e.detail));
    rowOf(el, 'w').click();
    await settle(el);
    expect(heard.map((d) => [d.uri, d.key])).toEqual([[null, '/w']]);
    expect(el.selectedKey).toBe('/w');
    expect(el.expandedKeys).toEqual(['/w']);
    rowOf(el, 'm.slx').click();
    await settle(el);
    expect(heard.at(-1)!.uri).toBe('file:///w/m.slx');
    expect(heard.at(-1)!.item).toBe(MODEL);
    expect(rowOf(el, 'm.slx').getAttribute('aria-selected')).toBe('true');
    expect(rowOf(el, 'w').getAttribute('aria-selected')).toBe('false');
    rowOf(el, 'w').click();
    await settle(el);
    expect(labels(el)).toEqual(['w']);
  });

  it('the twisty opens and closes, and chooses nothing', async () => {
    const el = await tree();
    let heard = 0;
    el.addEventListener('dex-hierarchy-select', () => heard++);
    rowOf(el, 'w').querySelector<HTMLElement>('.twisty')!.click();
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
    expect(heard).toBe(0);
    expect(el.selectedKey).toBeNull();
  });

  it('setting selectedKey sends nothing', async () => {
    const el = await tree();
    let heard = 0;
    el.addEventListener('dex-hierarchy-select', () => heard++);
    el.selectedKey = '/w';
    await settle(el);
    expect(heard).toBe(0);
    expect(rowOf(el, 'w').getAttribute('aria-selected')).toBe('true');
  });
});

describe('the keyboard', () => {
  it('moves through the rows, opens with Right, goes in, out with Left, and to either end', async () => {
    const el = await tree();
    rows(el)[0]!.focus();
    const focused = (): string => el.shadowRoot!.activeElement?.querySelector('.label')?.textContent ?? '';
    press(el, 'ArrowRight');
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
    expect(focused()).toBe('w');
    press(el, 'ArrowRight');
    await settle(el);
    expect(focused()).toBe('m.slx');
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused()).toBe('d.sldd');
    press(el, 'ArrowUp');
    await settle(el);
    press(el, 'ArrowRight');
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'gone.sldd', 'd.sldd']);
    press(el, 'End');
    await settle(el);
    expect(focused()).toBe('d.sldd');
    press(el, 'Home');
    await settle(el);
    expect(focused()).toBe('w');
    press(el, 'ArrowDown');
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused()).toBe('gone.sldd');
    // Left on a row with nothing open goes to its parent; on an open row, closes it.
    press(el, 'ArrowLeft');
    await settle(el);
    expect(focused()).toBe('m.slx');
    press(el, 'ArrowLeft');
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
    expect(focused()).toBe('m.slx');
  });

  it('chooses with Enter', async () => {
    const el = await tree();
    const heard: (string | null)[] = [];
    el.addEventListener('dex-hierarchy-select', (e) => heard.push(e.detail.uri));
    rows(el)[0]!.focus();
    press(el, 'ArrowRight');
    await settle(el);
    press(el, 'ArrowDown');
    await settle(el);
    press(el, 'ArrowDown');
    await settle(el);
    press(el, 'Enter');
    await settle(el);
    expect(heard).toEqual(['file:///w/d.sldd']);
    expect(el.selectedKey).toBe('/w/d');
  });

  it('keeps one row in the Tab order: the one the keyboard is on', async () => {
    const el = await tree();
    el.expandedKeys = ['/w'];
    await settle(el);
    rows(el)[0]!.focus();
    press(el, 'ArrowDown');
    await settle(el);
    expect(rows(el).map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });
});

describe('expandTopLevel', () => {
  it('opens each top-level row the first time it is shown, then keeps what the user does with it', async () => {
    const el = document.createElement('dex-hierarchy');
    el.expandTopLevel = true;
    el.loadChildren = async (it) => CHILDREN[it.key] ?? [];
    document.body.append(el);
    // No rows yet: nothing of the user's to keep, nothing opened.
    el.items = [];
    await settle(el);
    el.items = [FOLDER, DICT];
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd', 'd.sldd']);
    expect(el.expandedKeys).toEqual(['/w']);
    rowOf(el, 'w').querySelector<HTMLElement>('.twisty')!.click();
    await settle(el);
    el.items = [{ ...FOLDER }, DICT];
    await settle(el);
    expect(labels(el)).toEqual(['w', 'd.sldd']);
    // Another folder's row is a row the tree has not shown: it opens.
    const OTHER = { ...FOLDER, key: '/v', label: 'v' };
    el.loadChildren = async (it) => (it.key === '/v' ? [DICT] : (CHILDREN[it.key] ?? []));
    el.items = [OTHER];
    await settle(el);
    expect(labels(el)).toEqual(['v', 'd.sldd']);
  });

  it('is off by default: a folder opens closed', async () => {
    const el = await tree();
    expect(el.expandTopLevel).toBe(false);
    expect(labels(el)).toEqual(['w']);
  });

  it('is the expand-top-level attribute', async () => {
    const el = document.createElement('dex-hierarchy');
    el.setAttribute('expand-top-level', '');
    el.loadChildren = async (it) => CHILDREN[it.key] ?? [];
    el.items = [FOLDER];
    document.body.append(el);
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
  });
});

describe('revealRow', () => {
  it('opens the rows above, selects the row and scrolls it into view once drawn, and sends nothing', async () => {
    const el = await tree();
    const sent: unknown[] = [];
    el.addEventListener('dex-hierarchy-select', (e) => sent.push(e.detail));
    const scrolled: string[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.dataset.key ?? '');
    });
    try {
      el.revealRow([FOLDER, MODEL, GONE]);
      await settle(el);
      expect(labels(el)).toEqual(['w', 'm.slx', 'gone.sldd', 'd.sldd']);
      expect(el.selectedKey).toBe('/w/m/gone');
      expect(rowOf(el, 'gone.sldd').getAttribute('aria-selected')).toBe('true');
      expect(scrolled).toEqual(['/w/m/gone']);
      // The keyboard goes on from it, and the focus stays where it was.
      expect(rowOf(el, 'gone.sldd').tabIndex).toBe(0);
      expect(el.shadowRoot!.activeElement).toBeNull();
      expect(sent).toEqual([]);
      // Scrolled once: a later draw leaves the view where the user puts it.
      el.items = [{ ...FOLDER }];
      await settle(el);
      expect(scrolled).toEqual(['/w/m/gone']);
    } finally {
      scroll.mockRestore();
    }
  });

  it('sends dex-hierarchy-select for the row when asked to choose it, and opens or closes nothing', async () => {
    const el = await tree();
    const sent: HierarchySelectDetail[] = [];
    el.addEventListener('dex-hierarchy-select', (e) => sent.push(e.detail));
    el.revealRow([FOLDER, MODEL], { choose: true });
    await settle(el);
    expect(sent).toEqual([{ uri: 'file:///w/m.slx', key: '/w/m', item: MODEL }]);
    expect(el.expandedKeys).toEqual(['/w']);
    expect(el.selectedKey).toBe('/w/m');
  });

  it('keeps the rows the user opened, and leaves the scroll undone once the user chooses', async () => {
    const el = await tree();
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    try {
      el.expandedKeys = ['/elsewhere'];
      let release!: (items: HierarchyItem[]) => void;
      el.loadChildren = (it) => (it.key === '/w/m' ? new Promise((done) => (release = done)) : Promise.resolve(CHILDREN[it.key] ?? []));
      el.revealRow([FOLDER, MODEL, GONE]);
      await settle(el);
      expect(el.expandedKeys).toEqual(['/elsewhere', '/w', '/w/m']);
      rowOf(el, 'd.sldd').click();
      release([GONE]);
      await settle(el);
      expect(el.selectedKey).toBe('/w/d');
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
    }
  });
});

describe('an empty tree', () => {
  it('draws no rows, and takes no keys', async () => {
    const el = document.createElement('dex-hierarchy');
    el.label = 'Simulink data';
    document.body.append(el);
    await settle(el);
    expect(rows(el)).toEqual([]);
    expect(el.shadowRoot!.querySelector('[role="tree"]')!.getAttribute('aria-label')).toBe('Simulink data');
    el.shadowRoot!.querySelector('[role="tree"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
});
