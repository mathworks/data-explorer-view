// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectShell's internal parts on their own: the documents' area (the tab row's slot, the panels
// stacked under it, the welcome, whose buttons ask what the toolbar's Open and Folder ask; split,
// a second pane beside the first, the divider between them, and where a tab dragged over it would
// land), the folder (its title, its search box and results made with it, the tree it is given, its
// note) and the quiet note a side shows. connectShell fills them; the tests beside this one see
// them filled.
import { afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { DexShellDocs, SECOND_PANE, defineShellDocs, type ShellDocsEventMap } from '../../src/widgets/app-shell/connect/dex-shell-docs.js';
import { DexDocTabs, defineDocTabs, type DocTab } from '../../src/widgets/app-shell/dex-doc-tabs.js';
import { DexShellFolder, defineShellFolder } from '../../src/widgets/app-shell/connect/dex-shell-folder.js';
import { DexShellNote, defineShellNote } from '../../src/widgets/app-shell/connect/dex-shell-note.js';

beforeAll(() => {
  defineDocTabs();
  defineShellDocs();
  defineShellFolder();
  defineShellNote();
});
afterEach(() => document.body.replaceChildren());

async function mount<T extends HTMLElement & { updateComplete: Promise<boolean> }>(el: T): Promise<T> {
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('<dex-shell-docs>', () => {
  it('slots the tab row above the panels, and shows the welcome over them while asked to', async () => {
    const docs = await mount(new DexShellDocs());
    const slots = [...docs.shadowRoot!.querySelectorAll('slot')].map((s) => s.name);
    expect(slots).toEqual(['tabs', '']);
    const welcome = docs.shadowRoot!.querySelector<HTMLElement>('.welcome')!;
    expect(welcome.hidden).toBe(false);
    expect(welcome.textContent).toContain('Open a data dictionary (.sldd), model (.slx, .mdl) or MAT-file (.mat).');
    expect(welcome.textContent).toContain('or drop files onto this window');
    docs.welcome = false;
    await docs.updateComplete;
    expect(welcome.hidden).toBe(true);
  });

  it('asks for Open File, and Open Folder only where the host can show one, as the toolbar asks', async () => {
    const docs = await mount(new DexShellDocs());
    const asked: string[] = [];
    document.addEventListener('dex-toolbar-action', (e) => asked.push(e.detail.actionId), { once: false });
    const buttons = () => [...docs.shadowRoot!.querySelectorAll<HTMLButtonElement>('.welcome button')];
    expect(buttons().map((b) => b.textContent)).toEqual(['Open File…']);
    docs.canOpenFolder = true;
    await docs.updateComplete;
    expect(buttons().map((b) => b.textContent)).toEqual(['Open File…', 'Open Folder…']);
    for (const b of buttons()) b.click();
    expect(asked).toEqual(['open-file', 'open-folder']);
  });
});

/** Every detail of `type` the documents' area sends from now on, heard on the document. */
function heard<K extends keyof ShellDocsEventMap>(type: K): ShellDocsEventMap[K]['detail'][] {
  const seen: ShellDocsEventMap[K]['detail'][] = [];
  const listener = (e: ShellDocsEventMap[K]): void => void seen.push(e.detail);
  document.addEventListener(type, listener);
  onTestFinished(() => document.removeEventListener(type, listener));
  return seen;
}

// A stand-in for DataTransfer (happy-dom's DragEvent keeps none), as docTabs.test.ts has it.
function transfer(data: Record<string, string> = {}) {
  const store = new Map(Object.entries(data));
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    get types(): string[] {
      return [...store.keys()];
    },
    setData: (type: string, value: string): void => void store.set(type, value),
    getData: (type: string): string => store.get(type) ?? '',
  };
}

function drag(target: Element, type: string, dt: ReturnType<typeof transfer>): Event {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  Object.assign(ev, { dataTransfer: dt, clientX: 0, clientY: 0, relatedTarget: null });
  target.dispatchEvent(ev);
  return ev;
}

/** The area split, or not, with a row of `tabs` in its first pane (and one of `second` in its second). */
async function area(tabs: DocTab[], second?: DocTab[]): Promise<{ docs: DexShellDocs; rows: DexDocTabs[] }> {
  const docs = new DexShellDocs();
  docs.welcome = false;
  const rows = [tabs, ...(second ? [second] : [])].map((list, i) => {
    const row = new DexDocTabs();
    row.slot = i === 0 ? 'tabs' : SECOND_PANE.tabs;
    row.tabs = list;
    row.active = list[0]!.id;
    docs.append(row);
    return row;
  });
  docs.split = !!second;
  await mount(docs);
  await Promise.all(rows.map((r) => r.updateComplete));
  return { docs, rows };
}

const tabIn = (row: DexDocTabs, id: string) => row.shadowRoot!.querySelector<HTMLElement>(`[role="tab"][data-id="${id}"]`)!;
const zones = (docs: DexShellDocs, pane: number) =>
  [...docs.shadowRoot!.querySelectorAll<HTMLElement>(`.pane[data-pane="${pane}"] .zone`)].map((z) => z.dataset.zone);
const zone = (docs: DexShellDocs, pane: number, at: string) => docs.shadowRoot!.querySelector<HTMLElement>(`.pane[data-pane="${pane}"] .zone[data-zone="${at}"]`)!;
const landing = (docs: DexShellDocs) => docs.shadowRoot!.querySelector<HTMLElement>('.landing');
const divider = (docs: DexShellDocs) => docs.shadowRoot!.querySelector<HTMLElement>('[role="separator"]');
const A: DocTab = { id: 'a', label: 'a.sldd' };
const B: DocTab = { id: 'b', label: 'b.mat' };
const C: DocTab = { id: 'c', label: 'c.slx' };

describe('<dex-shell-docs> split in two', () => {
  it("draws a second pane beside the first, with its row's and its panels' slots, and the divider between", async () => {
    const { docs } = await area([A], [B]);
    const slots = [...docs.shadowRoot!.querySelectorAll('slot')].map((s) => s.name);
    expect(slots).toEqual(['tabs', '', SECOND_PANE.tabs, SECOND_PANE.panels]);
    expect(SECOND_PANE).toEqual({ tabs: 'tabs-2', panels: 'pane-2' });
    const sep = divider(docs)!;
    expect([sep.getAttribute('aria-orientation'), sep.getAttribute('aria-valuenow'), sep.getAttribute('aria-valuemin'), sep.getAttribute('aria-valuemax')]).toEqual([
      'vertical',
      '50',
      '20',
      '80',
    ]);
    expect(sep.tabIndex).toBe(0);
    expect(sep.getAttribute('aria-valuetext')).toBe('Left pane 50%');
    // One pane again: the second's slots, and the divider, go.
    docs.split = false;
    await docs.updateComplete;
    expect([...docs.shadowRoot!.querySelectorAll('slot')].map((s) => s.name)).toEqual(['tabs', '']);
    expect(divider(docs)).toBeNull();
  });

  it('gives each pane its share of the width, and marks the focused one', async () => {
    const { docs } = await area([A], [B]);
    docs.ratio = 0.3;
    docs.focusedPane = 1;
    await docs.updateComplete;
    const panes = [...docs.shadowRoot!.querySelectorAll<HTMLElement>('.pane')];
    expect(panes.map((p) => p.style.flexGrow)).toEqual(['0.3', '0.7']);
    expect(panes.map((p) => p.classList.contains('focused'))).toEqual([false, true]);
    expect(divider(docs)!.getAttribute('aria-valuetext')).toBe('Left pane 30%');
  });

  it('asks to focus the pane a press or the focus comes into, and not the one focused already', async () => {
    const { docs, rows } = await area([A], [B]);
    const panel = document.createElement('section');
    panel.slot = SECOND_PANE.panels;
    docs.append(panel);
    await docs.updateComplete;
    const asked = heard('dex-pane-focus');
    panel.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    tabIn(rows[0]!, 'a').dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    tabIn(rows[1]!, 'b').dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(asked).toEqual([{ pane: 1 }, { pane: 1 }]);
    docs.focusedPane = 1;
    await docs.updateComplete;
    tabIn(rows[0]!, 'a').dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(asked).toEqual([{ pane: 1 }, { pane: 1 }, { pane: 0 }]);
  });

  it('moves the divider by the arrow keys, held to a fifth either way, saying each step', async () => {
    const { docs } = await area([A], [B]);
    const said = heard('dex-panes-resized');
    const key = (k: string) => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
      divider(docs)!.dispatchEvent(ev);
      return ev;
    };
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(docs.ratio).toBe(0.55);
    for (let i = 0; i < 10; i++) key('ArrowRight');
    expect(docs.ratio).toBe(0.8);
    key('ArrowLeft');
    expect(docs.ratio).toBe(0.75);
    expect(key('ArrowUp').defaultPrevented).toBe(false);
    // Each step that moved it, once.
    expect(said.map((d) => d.ratio)).toEqual([0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.75]);
    await docs.updateComplete;
    expect(divider(docs)!.getAttribute('aria-valuenow')).toBe('75');
  });

  it('moves the divider with a drag, the pointer held, and says where it ended once', async () => {
    const { docs } = await area([A], [B]);
    const said = heard('dex-panes-resized');
    const panes = docs.shadowRoot!.querySelector<HTMLElement>('.panes')!;
    panes.getBoundingClientRect = () => ({ left: 100, right: 1100, width: 1000, top: 0, bottom: 600, height: 600, x: 100, y: 0, toJSON: () => ({}) });
    const sep = divider(docs)!;
    const pointer = (type: string, clientX: number) =>
      sep.dispatchEvent(Object.assign(new Event(type, { bubbles: true, composed: true, cancelable: true }), { pointerId: 1, button: 0, clientX }));
    pointer('pointerdown', 600);
    pointer('pointermove', 400);
    expect(docs.ratio).toBe(0.3);
    pointer('pointermove', 1090);
    expect(docs.ratio).toBe(0.8);
    expect(said).toEqual([]);
    pointer('pointermove', 350);
    pointer('pointerup', 350);
    expect(said).toEqual([{ ratio: 0.25 }]);
    // A move after the drag is over moves nothing.
    pointer('pointermove', 900);
    expect(docs.ratio).toBe(0.25);
  });

  it("shows where a tab dragged from its row lands, the left or the right of the documents or among them, and asks for it there", async () => {
    const { docs, rows } = await area([A, B, C]);
    const dropped = heard('dex-pane-drop');
    const dt = transfer();
    drag(tabIn(rows[0]!, 'b'), 'dragstart', dt);
    await docs.updateComplete;
    expect(zones(docs, 0)).toEqual(['left', 'center', 'right']);
    expect(landing(docs)).toBeNull();
    expect(drag(zone(docs, 0, 'right'), 'dragover', dt).defaultPrevented).toBe(true);
    await docs.updateComplete;
    expect(landing(docs)!.dataset.at).toBe('right');
    drag(zone(docs, 0, 'left'), 'dragover', dt);
    await docs.updateComplete;
    expect(landing(docs)!.dataset.at).toBe('left');
    expect(drag(zone(docs, 0, 'left'), 'drop', dt).defaultPrevented).toBe(true);
    await docs.updateComplete;
    // The overlay goes with the drop, whether or not the row hears the end of its drag.
    expect(zones(docs, 0)).toEqual([]);
    expect(dropped).toEqual([{ id: 'b', pane: 0, side: 'left' }]);
    drag(tabIn(rows[0]!, 'b'), 'dragend', dt);
    const again = transfer();
    drag(tabIn(rows[0]!, 'c'), 'dragstart', again);
    await docs.updateComplete;
    drag(zone(docs, 0, 'center'), 'dragover', again);
    drag(zone(docs, 0, 'center'), 'drop', again);
    expect(dropped.at(-1)).toEqual({ id: 'c', pane: 0 });
  });

  it("offers no side to a pane's only tab, and with two panes, each pane's documents only", async () => {
    const one = await area([A]);
    drag(tabIn(one.rows[0]!, 'a'), 'dragstart', transfer());
    await one.docs.updateComplete;
    expect(zones(one.docs, 0)).toEqual(['center']);
    document.body.replaceChildren();
    const two = await area([A, B], [C]);
    const dropped = heard('dex-pane-drop');
    const dt = transfer();
    drag(tabIn(two.rows[0]!, 'a'), 'dragstart', dt);
    await two.docs.updateComplete;
    expect([zones(two.docs, 0), zones(two.docs, 1)]).toEqual([['center'], ['center']]);
    drag(zone(two.docs, 1, 'center'), 'dragover', dt);
    await two.docs.updateComplete;
    expect(landing(two.docs)!.dataset.at).toBe('center');
    drag(zone(two.docs, 1, 'center'), 'drop', dt);
    expect(dropped).toEqual([{ id: 'a', pane: 1 }]);
  });

  it("ends the drag at any drop in the area, a row's own included, and at a drop or a drag's end anywhere in the page", async () => {
    // A tab dropped on the other row moves there, and its element leaves the row it was dragged
    // from before the drag's end comes: the end reaches the element alone, out of the page.
    const { docs, rows } = await area([A, B], [C]);
    const overlay = () => docs.shadowRoot!.querySelector('.overlay');
    const start = async () => {
      drag(tabIn(rows[0]!, 'a'), 'dragstart', transfer());
      await docs.updateComplete;
      expect(overlay()).not.toBeNull();
    };
    await start();
    drag(tabIn(rows[1]!, 'c'), 'drop', transfer());
    await docs.updateComplete;
    expect(overlay()).toBeNull();
    for (const [type, at] of [['drop', document.body], ['dragend', document.body], ['drop', document]] as const) {
      await start();
      drag(at as Element, type, transfer());
      await docs.updateComplete;
      expect(overlay(), `${type} on ${at === document ? 'the document' : 'the body'}`).toBeNull();
    }
  });

  it('takes no drag but a tab of its own rows, and ends with the drag, however it ends', async () => {
    const { docs, rows } = await area([A, B]);
    const dropped = heard('dex-pane-drop');
    // Files are the page's to open, even with a tab beside them; a drag out of a table's rows,
    // even one naming a tab, is nothing of the rows'.
    drag(tabIn(rows[0]!, 'a'), 'dragstart', transfer({ Files: '' }));
    await docs.updateComplete;
    expect(zones(docs, 0)).toEqual([]);
    const panel = document.createElement('section');
    docs.append(panel);
    drag(panel, 'dragstart', transfer({ 'application/x-dex-tab': 'a' }));
    await docs.updateComplete;
    expect(zones(docs, 0)).toEqual([]);
    const dt = transfer();
    drag(tabIn(rows[0]!, 'a'), 'dragstart', dt);
    await docs.updateComplete;
    expect(zones(docs, 0)).toHaveLength(3);
    // A drop that names another tab than the one dragged moves nothing.
    dt.setData('application/x-dex-tab', 'b');
    drag(zone(docs, 0, 'right'), 'dragover', dt);
    drag(zone(docs, 0, 'right'), 'drop', dt);
    expect(dropped).toEqual([]);
    drag(tabIn(rows[0]!, 'a'), 'dragstart', transfer());
    await docs.updateComplete;
    drag(tabIn(rows[0]!, 'a'), 'dragend', transfer());
    await docs.updateComplete;
    expect(zones(docs, 0)).toEqual([]);
  });
});

describe('<dex-shell-folder>', () => {
  it("titles itself with the folder's name, its path the tooltip, a trailing separator or not", async () => {
    const folder = await mount(new DexShellFolder());
    const title = () => folder.shadowRoot!.querySelector<HTMLElement>('.title')!;
    folder.root = '/work/plant/';
    await folder.updateComplete;
    expect([title().textContent, title().title]).toEqual(['plant', '/work/plant/']);
    folder.root = 'C:\\work\\Data';
    await folder.updateComplete;
    expect(title().textContent).toBe('Data');
  });

  it('draws its title, then the tree it is given, and no search box of its own: the Search view searches its names', async () => {
    const folder = new DexShellFolder();
    folder.append(document.createElement('div'));
    await mount(folder);
    const parts = [...folder.shadowRoot!.children].map((el) => el.localName + (el.className ? `.${el.className}` : ''));
    expect(parts).toEqual(['header.title', 'slot']);
  });

  it('shows its note under the tree, and none while it has none', async () => {
    const folder = await mount(new DexShellFolder());
    const note = () => folder.shadowRoot!.querySelector('.note');
    expect(note()).toBeNull();
    folder.note = 'No data files in this folder.';
    await folder.updateComplete;
    expect(note()!.textContent).toBe('No data files in this folder.');
  });
});

describe('<dex-shell-note>', () => {
  it('shows its text, through its slot (hiddenAttribute.test.ts pins its hidden rule)', async () => {
    const note = new DexShellNote();
    note.textContent = 'Select an entry to view its properties.';
    await mount(note);
    expect(note.shadowRoot!.querySelector('slot')).not.toBeNull();
    expect(note.textContent).toBe('Select an entry to view its properties.');
  });
});
