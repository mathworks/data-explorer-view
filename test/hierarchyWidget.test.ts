// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-hierarchy>: the rows it draws for a folder's items, how they open (lazily, a level at a
// time, and again after the items are replaced), what a click, the twisty and the keyboard do, and
// what it tells the app. Over hand-made items, so each case shows the rows it is about; the rows a
// real folder makes are FolderHierarchy's (folderHierarchy.test.ts, goldens/hierarchy.test.ts).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DexHierarchy as HierarchyClass,
  defineHierarchy,
  type DexHierarchy,
  type HierarchyItem,
  type HierarchyMenuDetail,
  type HierarchySelectedDetail,
  type RowMark,
} from '../src/widgets/hierarchy/index.js';
import { THEME_SETS } from './tools/cssTokens.js';

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
    const heard: HierarchySelectedDetail[] = [];
    document.body.addEventListener('dex-hierarchy-selected', (e) => heard.push(e.detail));
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
    el.addEventListener('dex-hierarchy-selected', () => heard++);
    rowOf(el, 'w').querySelector<HTMLElement>('.twisty')!.click();
    await settle(el);
    expect(labels(el)).toEqual(['w', 'm.slx', 'd.sldd']);
    expect(heard).toBe(0);
    expect(el.selectedKey).toBeNull();
  });

  it('setting selectedKey sends nothing', async () => {
    const el = await tree();
    let heard = 0;
    el.addEventListener('dex-hierarchy-selected', () => heard++);
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
    el.addEventListener('dex-hierarchy-selected', (e) => heard.push(e.detail.uri));
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
    el.addEventListener('dex-hierarchy-selected', (e) => sent.push(e.detail));
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

  it('sends dex-hierarchy-selected for the row when asked to choose it, and opens or closes nothing', async () => {
    const el = await tree();
    const sent: HierarchySelectedDetail[] = [];
    el.addEventListener('dex-hierarchy-selected', (e) => sent.push(e.detail));
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

// The Folder view's rows (FolderTree's): files the app does not open, what a reference is, how a
// row's file stands in the tabs, and the menu a row asks for. All off unless a row or the app says.
describe('rows of the Folder view', () => {
  const NOTES = item('/w/notes', 'notes.md', { kind: 'other', dimmed: true, icon: 'documentList', path: '/w/notes.md' });
  const REF = item('/w/m/p', 'params.sldd', { id: 'file:///w/params.sldd', health: null, relation: 'data dictionary', icon: 'simulink_database' });
  const GONE_REF = item('/w/m/g', 'gone.slx', { kind: 'missing', description: 'unresolved reference', relation: 'model reference' });
  // params.sldd is a row of its own folder, and a reference row under m.slx: one file, two rows.
  const PARAMS = item('/w/params', 'params.sldd', { id: 'file:///w/params.sldd', health: null, icon: 'simulink_database', path: '/w/params.sldd' });
  const FOLDER_ROWS: Record<string, HierarchyItem[]> = { '/w': [MODEL, DICT, NOTES, PARAMS], '/w/m': [REF, GONE_REF] };
  const rowAt = (el: DexHierarchy, key: string): HTMLElement => rows(el).find((r) => r.dataset.key === key)!;

  async function folder(marks?: ReadonlyMap<string, RowMark>, options: { rowMenu?: boolean } = { rowMenu: true }): Promise<DexHierarchy> {
    const el = await tree({ children: FOLDER_ROWS });
    if (marks) el.marks = marks;
    if (options.rowMenu) el.rowMenu = true;
    el.expandedKeys = ['/w', '/w/m'];
    await settle(el);
    return el;
  }

  it('draws another file dimmed and disabled for a screen reader, and opens nothing when it is chosen', async () => {
    const el = await folder();
    const notes = rowOf(el, 'notes.md');
    expect(notes.classList.contains('dimmed')).toBe(true);
    expect(notes.getAttribute('aria-disabled')).toBe('true');
    expect(rowOf(el, 'd.sldd').classList.contains('dimmed')).toBe(false);
    expect(rowOf(el, 'd.sldd').hasAttribute('aria-disabled')).toBe(false);
    const sent: HierarchySelectedDetail[] = [];
    el.addEventListener('dex-hierarchy-selected', (e) => sent.push(e.detail));
    notes.click();
    await settle(el);
    expect(sent).toEqual([{ uri: null, key: '/w/notes', item: NOTES }]);
    expect(el.selectedKey).toBe('/w/notes');
    press(el, 'Enter');
    expect(sent.map((d) => d.uri)).toEqual([null, null]);
    // Even a dimmed row that names a file opens nothing.
    const named = { ...NOTES, id: 'file:///w/notes.md' };
    el.items = [named];
    await settle(el);
    rowOf(el, 'notes.md').click();
    expect(sent.at(-1)!.uri).toBeNull();
  });

  it('says what a reference is after its name, in the muted ink, and after its description when it has one', async () => {
    const el = await folder();
    const ref = rowAt(el, '/w/m/p');
    expect([...ref.querySelectorAll('.description')].map((d) => d.textContent)).toEqual(['data dictionary']);
    const gone = rowOf(el, 'gone.slx');
    expect([...gone.querySelectorAll('.description')].map((d) => d.textContent)).toEqual(['unresolved reference', 'model reference']);
    // A row with no relation draws no more than it did.
    expect(rowOf(el, 'd.sldd').querySelectorAll('.description')).toHaveLength(0);
  });

  it("marks a file's rows by how it stands in the tabs: open, the active tab, unsaved, a preview", async () => {
    const marks = new Map<string, RowMark>([
      ['file:///w/m.slx', { open: true, active: true }],
      ['file:///w/params.sldd', { open: true, unsaved: true, preview: true }],
    ]);
    const el = await folder(marks);
    const model = rowOf(el, 'm.slx');
    expect(model.classList.contains('open')).toBe(true);
    expect(model.classList.contains('active')).toBe(true);
    expect(model.getAttribute('aria-current')).toBe('true');
    // The active tab is no selection: the tree's own stays as it is.
    expect(model.getAttribute('aria-selected')).toBe('false');
    const ref = rowAt(el, '/w/m/p');
    expect(ref.classList.contains('open')).toBe(true);
    expect(ref.classList.contains('preview')).toBe(true);
    expect(ref.hasAttribute('aria-current')).toBe(false);
    expect(ref.querySelectorAll('.badge')).toHaveLength(1);
    expect(ref.querySelector('.badge')!.textContent).toBe('●');
    expect(ref.querySelector('.sr-only')!.textContent).toContain('unsaved');
    // A row of no file in the tabs is marked nothing.
    const plain = rowOf(el, 'notes.md');
    expect(['open', 'active', 'preview'].filter((c) => plain.classList.contains(c))).toEqual([]);
    // New marks redraw the rows, and none marks none.
    el.marks = new Map();
    await settle(el);
    expect(rowOf(el, 'm.slx').classList.contains('open')).toBe(false);
    expect(rowOf(el, 'm.slx').hasAttribute('aria-current')).toBe(false);
    expect(rowAt(el, '/w/m/p').querySelectorAll('.badge')).toHaveLength(0);
  });

  it('marks every row of a file alike: its own row in its folder, and a reference row of it', async () => {
    const el = await folder(new Map([['file:///w/params.sldd', { open: true, active: true, unsaved: true }]]));
    for (const key of ['/w/params', '/w/m/p']) {
      const row = rowAt(el, key);
      expect(['open', 'active'].map((c) => row.classList.contains(c)), key).toEqual([true, true]);
      expect(row.getAttribute('aria-current'), key).toBe('true');
      expect(row.querySelectorAll('.badge'), key).toHaveLength(1);
    }
  });

  it('draws the active tab\'s row unselected when the selection is another row, and selected when it is the row', async () => {
    const el = await folder(new Map([['file:///w/m.slx', { active: true }]]));
    rowOf(el, 'notes.md').click();
    await settle(el);
    const model = rowOf(el, 'm.slx');
    expect(model.classList.contains('active')).toBe(true);
    expect(model.getAttribute('aria-selected')).toBe('false');
    expect(rowOf(el, 'notes.md').getAttribute('aria-selected')).toBe('true');
    model.click();
    await settle(el);
    expect(model.getAttribute('aria-selected')).toBe('true');
  });

  it("draws one badge for a file the index marks unsaved and the tabs do too, and a cycle's before it", async () => {
    // d.sldd's row is `modified` already (the index's own mark).
    const el = await folder(new Map([['file:///w/d.sldd', { unsaved: true }]]));
    expect(rowOf(el, 'd.sldd').querySelectorAll('.badge')).toHaveLength(1);
    const CYCLE = item('/w/c', 'c.sldd', { id: 'file:///w/c.sldd', health: 'cycle', description: '↻ circular reference' });
    el.items = [CYCLE];
    el.marks = new Map([['file:///w/c.sldd', { unsaved: true }]]);
    await settle(el);
    const badges = rowOf(el, 'c.sldd').querySelectorAll('.badge');
    expect([...badges].map((b) => b.textContent)).toEqual(['↻']);
  });

  it('asks for a row\'s menu on a right click, with the pointer where it is, and keeps the browser\'s own', async () => {
    const el = await folder();
    const asked: HierarchyMenuDetail[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    const ref = rowAt(el, '/w/m/p');
    ref.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, composed: true }));
    const right = new MouseEvent('contextmenu', { clientX: 40, clientY: 90, bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(asked).toEqual([{ item: REF, x: 40, y: 90 }]);
    expect(el.shadowRoot!.querySelector('[role="tree"]')!.getAttribute('aria-keyshortcuts')).toBe('Shift+F10 ContextMenu');
  });

  it("asks for a dimmed row's menu too: Reveal and Copy Path are a file's the app does not open", async () => {
    const el = await folder();
    const asked: HierarchyMenuDetail[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    rowOf(el, 'notes.md').dispatchEvent(new MouseEvent('contextmenu', { clientX: 1, clientY: 2, bubbles: true, composed: true, cancelable: true }));
    expect(asked).toEqual([{ item: NOTES, x: 1, y: 2 }]);
  });

  it('leaves the right click and both keys to the browser without rowMenu, the default', async () => {
    const el = await folder(undefined, {});
    expect(el.rowMenu).toBe(false);
    expect(el.shadowRoot!.querySelector('[role="tree"]')!.hasAttribute('aria-keyshortcuts')).toBe(false);
    const asked: unknown[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    const ref = rowAt(el, '/w/m/p');
    const right = new MouseEvent('contextmenu', { clientX: 40, clientY: 90, bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);
    ref.focus();
    for (const key of [{ key: 'F10', shiftKey: true }, { key: 'ContextMenu' }]) {
      const down = new KeyboardEvent('keydown', { ...key, bubbles: true, composed: true, cancelable: true });
      ref.dispatchEvent(down);
      const up = new KeyboardEvent('keyup', { ...key, bubbles: true, composed: true, cancelable: true });
      ref.dispatchEvent(up);
      expect([down.defaultPrevented, up.defaultPrevented], key.key).toEqual([false, false]);
    }
    expect(asked).toEqual([]);
    // The attribute turns it on.
    el.setAttribute('row-menu', '');
    await settle(el);
    expect(el.rowMenu).toBe(true);
    rowAt(el, '/w/m/p').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true }));
    expect(asked).toHaveLength(1);
  });

  it.each([
    ['Ctrl+Shift+F10', { key: 'F10', shiftKey: true, ctrlKey: true }],
    ['Alt+Shift+F10', { key: 'F10', shiftKey: true, altKey: true }],
    ['Meta+ContextMenu', { key: 'ContextMenu', metaKey: true }],
    ['Shift+ContextMenu', { key: 'ContextMenu', shiftKey: true }],
  ])('leaves %s to the browser, as the table does', async (_name, key) => {
    const el = await folder();
    const asked: unknown[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    const ref = rowAt(el, '/w/m/p');
    ref.focus();
    ref.click();
    const down = new KeyboardEvent('keydown', { ...key, bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(asked).toEqual([]);
  });

  it("hears a contextmenu with no pointer a moment after the key's keyup as an ask of its own", async () => {
    // An assistive technology's "show menu" sends one, with no pointer and no key.
    const el = await folder();
    const asked: HierarchyMenuDetail[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    const ref = rowAt(el, '/w/m/p');
    ref.focus();
    ref.click();
    ref.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, composed: true, cancelable: true }));
    ref.dispatchEvent(new KeyboardEvent('keyup', { key: 'ContextMenu', bubbles: true, composed: true, cancelable: true }));
    await new Promise((done) => setTimeout(done, 0));
    const later = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(later);
    expect(asked.map((d) => d.keyboard ?? false)).toEqual([true, false]);
    expect(later.defaultPrevented).toBe(true);
  });

  it.each([
    ['Shift+F10', { key: 'F10', shiftKey: true }],
    ['the ContextMenu key', { key: 'ContextMenu' }],
  ])('asks for the focused row\'s menu on %s, at the row\'s lower left, once', async (_name, key) => {
    const el = await folder();
    const asked: HierarchyMenuDetail[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    const ref = rowAt(el, '/w/m/p');
    ref.getBoundingClientRect = () => ({ left: 12, bottom: 140, top: 112, right: 300, width: 288, height: 28, x: 12, y: 112, toJSON: () => ({}) });
    ref.focus();
    ref.click();
    const down = new KeyboardEvent('keydown', { ...key, bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    // The browser's own contextmenu event, which the key also sends: no second menu, and no native one.
    const native = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(true);
    expect(asked).toEqual([{ item: REF, x: 12, y: 140, keyboard: true }]);
    // The key's keyup is spent too, where a browser opens its own menu on it.
    const up = new KeyboardEvent('keyup', { ...key, bubbles: true, composed: true, cancelable: true });
    ref.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    // A right click after it is a menu of its own.
    ref.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, composed: true }));
    ref.dispatchEvent(new MouseEvent('contextmenu', { clientX: 5, clientY: 6, bubbles: true, composed: true, cancelable: true }));
    expect(asked).toHaveLength(2);
  });

  it('asks for no menu on F10 alone, and moves nothing', async () => {
    const el = await folder();
    const asked: unknown[] = [];
    el.addEventListener('dex-hierarchy-menu', (e) => asked.push(e.detail));
    rowOf(el, 'w').focus();
    press(el, 'F10');
    expect(asked).toEqual([]);
  });
});

// WCAG's contrast ratio of two colours written #rgb or #rrggbb.
function contrast(a: string, b: string): number {
  const luminance = (colour: string): number => {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)![1]!;
    const parts = (hex.length === 3 ? [...hex].map((h) => h + h) : hex.match(/../g)!).map((h) => parseInt(h, 16));
    const [r, g, bl] = parts.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the look of the marks', () => {
  // The rules as text (happy-dom matches no media query), comments taken out.
  const sheets = (): string =>
    [HierarchyClass.styles].flat(Infinity).map((s) => (s as { cssText: string }).cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')).join('\n');
  const rule = (selector: string, within = sheets()): string => {
    for (const [, selectors, body] of within.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectors!.split(',').some((one) => one.trim() === selector)) return body!;
    }
    throw new Error(`no rule for ${selector}`);
  };
  const forced = (): string => /@media \(forced-colors: active\) \{([\s\S]*)\}\s*$/.exec(sheets())![1]!;

  it('draws another file in the muted ink, at full opacity, readable in every theme', () => {
    const dimmed = rule('.row.dimmed');
    expect(dimmed).toContain('color: var(--dex-color-text-muted, #666)');
    expect(dimmed).not.toContain('opacity');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      expect(contrast(tokens.get('--dex-color-text-muted')!, tokens.get('--dex-bg-primary')!), set).toBeGreaterThanOrEqual(4.5);
    }
    // Selected, it reads in the selection's ink: the selected row's rule comes after it.
    const all = sheets();
    expect(all.indexOf(".row[aria-selected='true']")).toBeGreaterThan(all.indexOf('.row.dimmed'));
  });

  it("draws an open file's bar in the accent, the focus ring beside it, and as a border in forced colours", () => {
    expect(rule('.row.open')).toContain('box-shadow: inset 2px 0 0 var(--dex-color-accent, #0078d4)');
    expect(rule('.row.open:focus-visible')).toContain(
      'box-shadow: inset 2px 0 0 var(--dex-color-accent, #0078d4), inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4))',
    );
    expect(rule('.row.open', forced())).toContain('border-left: 2px solid Highlight');
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      expect(contrast(tokens.get('--dex-color-accent')!, tokens.get('--dex-bg-primary')!), set).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws the active tab's row a fill lighter than the selection's, the selected row over it, a preview's name in italics", () => {
    expect(rule('.row.active')).toContain('background: var(--dex-bg-hover, #e8e8e8)');
    expect(rule('.row.active')).toContain('color: var(--dex-selection-fg, #333)');
    expect(rule('.row.active:hover')).toContain('background: var(--dex-bg-active, #e0e0e0)');
    const all = sheets();
    expect(all.indexOf(".row[aria-selected='true'] {")).toBeGreaterThan(all.indexOf('.row.active:hover'));
    expect(rule('.preview .label')).toContain('font-style: italic');
  });

  it("sets an active or selected row's name and description in the selection's ink, readable on its fill in every theme", () => {
    for (const selector of ['.row.active .label', '.row.active .description', ".row[aria-selected='true'] .label", ".row[aria-selected='true'] .description"]) {
      expect(rule(selector), selector).toContain('color: var(--dex-selection-fg, #333)');
    }
    for (const [set, tokens] of Object.entries(THEME_SETS)) {
      for (const fill of ['--dex-color-accent-bg', '--dex-bg-hover', '--dex-bg-active']) {
        // Text: 4.5:1. The badges keep their colours, marks that need 3:1.
        expect(contrast(tokens.get('--dex-selection-fg')!, tokens.get(fill)!), `${set} ink on ${fill}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.get('--dex-color-modified')!, tokens.get(fill)!), `${set} ● on ${fill}`).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens.get('--dex-color-warning')!, tokens.get(fill)!), `${set} ↻ on ${fill}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('in forced colours, reads a selected dimmed row in HighlightText, outlines the active row, and draws the open border apart from the selection', () => {
    const block = forced();
    expect(rule('.row.dimmed', block)).toContain('color: GrayText');
    expect(block.indexOf(".row[aria-selected='true'] {")).toBeGreaterThan(block.indexOf('.row.dimmed'));
    expect(rule(".row[aria-selected='true']", block)).toContain('background: Highlight');
    expect(rule(".row[aria-selected='true'] .label", block)).toContain('color: HighlightText');
    expect(rule('.row.active', block)).toContain('outline: 1px solid Highlight');
    expect(rule('.row.active', block)).not.toContain('background');
    expect(rule(".row.open[aria-selected='true']", block)).toContain('border-left-color: HighlightText');
  });
});
