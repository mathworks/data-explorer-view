// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The split editor, connected: the documents' area in two panes side by side, each with its row of
// tabs and the tab it shows, one of them focused. What it protects: the focused pane's tab is the
// active tab everything else follows (the toolbar, the location bar, the inspector, the status
// bar, the title, a save or a close); a tab dropped on a side of the documents makes a pane there
// (on the left for the left), one dropped on the other pane's row or documents moves there, and a
// pane whose last tab goes goes with it; a new file opens in the focused pane, a file already open
// in its tab wherever it is (one tab per file); each pane keeps its own preview tab; Root shows the
// graph over both; the divider stays where the user left it, kept with the layout; and the
// commands and chords: Split Right (Mod+\), Move to Other Pane, Mod+1 and Mod+2 to go to a pane,
// Ctrl+Tab round the focused pane's tabs alone.
import { describe, expect, it } from 'vitest';
import { sourceUri } from '../../src/model/source/sourceUri.js';
import { onMac } from '../../src/widgets/app-shell/connect/keys.js';
import type { DexDocTabs } from '../../src/widgets/app-shell/dex-doc-tabs.js';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { DexPropertyInspector } from '../../src/widgets/property-inspector/dex-property-inspector.js';
import {
  docsArea,
  edit,
  enabledItems,
  graphShown,
  locationBar,
  open,
  palette,
  rowOf,
  selectRow,
  settled,
  startPage,
  statusText,
  tableOf,
  until,
  type Page,
} from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'shadow_ws.slx': 'shadow_ws.slx' };

// --- The panes, as drawn ----------------------------------------------------------------------

/** The rows of tabs, left to right. */
const rows = () => [...document.querySelectorAll<DexDocTabs>('dex-doc-tabs')];
const tabEls = (row: DexDocTabs) => [...(row.shadowRoot?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
// A tab by its file's name: its subtitle, while its label names the section its selection is in.
const labelOf = (el: Element) => (el.querySelector('.subtitle') ?? el.querySelector('.label'))?.textContent ?? '';
/** Each row's tabs by their files' names, the one it shows marked with a *. */
const panes = () => rows().map((row) => tabEls(row).map((t) => `${labelOf(t)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`).join(' '));
/** The tab of `name`, in whichever row. */
const tabEl = (name: string) => rows().flatMap(tabEls).find((t) => labelOf(t) === name);
/** The id the shell's requests name the tab of `name` by. */
const idOf = (name: string) => rows().flatMap((r) => r.tabs).find((t) => (t.subtitle ?? t.label) === name)!.id;
/** The panel of `name`'s file, and the pane it is drawn in (0 the left, 1 the right), and whether it is on screen. */
const panelOf = (name: string) => document.querySelector<HTMLElement>(`.doc-panel[data-path="/work/${name}"]`)!;
const paneOfPanel = (name: string) => (panelOf(name).slot === 'pane-2' ? 1 : 0);
const shown = () => [...document.querySelectorAll<HTMLElement>('.doc-panel:not([hidden])')].map((p) => `${p.dataset.path!.slice(6)}@${p.slot === 'pane-2' ? 1 : 0}`);
const segments = () => locationBar().segments.map((s) => s.label);
const inspector = () => document.querySelector<DexPropertyInspector>('dex-property-inspector')!;
const inspectorRows = () => (inspector().groups[0]?.properties ?? []).map((p) => `${p.name}: ${p.value}`);

// A stand-in for DataTransfer (happy-dom's DragEvent keeps none), as docTabs.test.ts has it.
function transfer() {
  const store = new Map<string, string>();
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

/** Every row drawn as it is now, a few tasks on: what a browser has done by the time a drag's end comes after its drop. */
async function redrawn(): Promise<void> {
  await settled();
  await Promise.all([docsArea(), ...rows()].map((el) => el.updateComplete));
}

/**
 * The end of a drag of `tab`, as a browser sends it: once the drop's work is drawn, to the tab's
 * element, which a move to another row has taken out of the page by then (so the end reaches no
 * ancestor of it); and no overlay left over the documents either way.
 */
async function ended(tab: HTMLElement, dt: ReturnType<typeof transfer>): Promise<void> {
  await redrawn();
  drag(tab, 'dragend', dt);
  await docsArea().updateComplete;
  expect(docsArea().shadowRoot!.querySelector('.overlay'), 'the overlay outlived the drag').toBeNull();
}

/** Drag the tab of `name` onto the documents of `pane`, at `zone`, and drop it there, as the pointer does. */
async function dropOnDocs(name: string, pane: number, zone: 'left' | 'center' | 'right'): Promise<void> {
  const dt = transfer();
  const tab = tabEl(name)!;
  drag(tab, 'dragstart', dt);
  await docsArea().updateComplete;
  const target = docsArea().shadowRoot!.querySelector(`.pane[data-pane="${pane}"] .zone[data-zone="${zone}"]`);
  expect(target, `no ${zone} zone in pane ${pane}`).not.toBeNull();
  expect(drag(target!, 'dragover', dt).defaultPrevented).toBe(true);
  drag(target!, 'drop', dt);
  await ended(tab, dt);
}

/** Drag the tab of `name` onto the empty end of row `row`, and drop it there. */
async function dropOnRow(name: string, row: number): Promise<void> {
  const dt = transfer();
  const tab = tabEl(name)!;
  drag(tab, 'dragstart', dt);
  await docsArea().updateComplete;
  const strip = rows()[row]!.shadowRoot!.querySelector<HTMLElement>('[role="tablist"]')!;
  expect(drag(strip, 'dragover', dt).defaultPrevented).toBe(true);
  drag(strip, 'drop', dt);
  await ended(tab, dt);
}

/** A press in the panel of `name`'s file, as a click in its table starts. */
const pressIn = (name: string) => panelOf(name).dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

/** The page with FILES open, `shadow_ws.slx` active and last. */
async function opened(): Promise<Page> {
  const page = startPage(FILES);
  await open(page, 'params.sldd', 'ParamMat.mat', 'shadow_ws.slx');
  await until(() => panes().join() === 'params.sldd ParamMat.mat shadow_ws.slx*');
  return page;
}

describe('a split by a drop', () => {
  it('makes a pane of its own on the right for a tab dropped on the right of the documents, which everything follows', async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    expect(panes()).toEqual(['ParamMat.mat shadow_ws.slx*', 'params.sldd*']);
    expect(docsArea().split).toBe(true);
    expect(docsArea().focusedPane).toBe(1);
    // Each pane shows its tab, side by side.
    expect(shown()).toEqual(['params.sldd@1', 'shadow_ws.slx@0']);
    // The row of the pane the user is not in marks its tab dimmed.
    expect(rows().map((r) => r.unfocused)).toEqual([true, false]);
    // The focused pane's tab is the active one.
    await until(() => segments().at(-1) === 'params.sldd');
    expect(document.title).toBe('params.sldd — Data Explorer');
    expect(statusText()).toBe('Data dictionary');
    await until(() => inspectorRows().includes('Name: params.sldd'));
  });

  it('makes a pane on the left for a tab dropped on the left, the tabs there were moving right', async () => {
    await opened();
    await dropOnDocs('ParamMat.mat', 0, 'left');
    await until(() => panes().length === 2);
    expect(panes()).toEqual(['ParamMat.mat*', 'params.sldd shadow_ws.slx*']);
    expect(docsArea().focusedPane).toBe(0);
    expect(shown()).toEqual(['ParamMat.mat@0', 'shadow_ws.slx@1']);
    await until(() => segments().at(-1) === 'ParamMat.mat');
  });

  it('makes no pane of the only tab there is', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const dt = transfer();
    drag(tabEl('params.sldd')!, 'dragstart', dt);
    await docsArea().updateComplete;
    expect([...docsArea().shadowRoot!.querySelectorAll<HTMLElement>('.zone')].map((z) => z.dataset.zone)).toEqual(['center']);
    drag(tabEl('params.sldd')!, 'dragend', dt);
  });
});

describe('moves between the panes', () => {
  it("moves a tab dropped on the other row, or on the other pane's documents, into that pane, shown and focused there", async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    await dropOnRow('ParamMat.mat', 1);
    await until(() => panes()[1] === 'params.sldd ParamMat.mat*');
    expect(panes()[0]).toBe('shadow_ws.slx*');
    expect(paneOfPanel('ParamMat.mat')).toBe(1);
    await until(() => segments().at(-1) === 'ParamMat.mat');
    // The row's own request, as a drop on a tab of the other row sends it: the left of params.sldd.
    rows()[0]!.dispatchEvent(new CustomEvent('dex-tab-move', { detail: { id: idOf('params.sldd'), index: 0 }, bubbles: true, composed: true }));
    await until(() => panes()[0] === 'params.sldd* shadow_ws.slx');
    expect(docsArea().focusedPane).toBe(0);
    // The left pane's last tab but one moved to the right pane's documents.
    await dropOnDocs('shadow_ws.slx', 1, 'center');
    await until(() => panes()[1] === 'ParamMat.mat shadow_ws.slx*');
    // Its last moved out: the pane goes, and the other takes the whole area.
    await dropOnDocs('params.sldd', 1, 'center');
    await until(() => panes().length === 1);
    expect(panes()).toEqual(['ParamMat.mat shadow_ws.slx params.sldd*']);
    expect(docsArea().split).toBe(false);
    expect(shown()).toEqual(['params.sldd@0']);
  });

  it('reorders within a pane as before, the tab it shows kept', async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    rows()[0]!.dispatchEvent(new CustomEvent('dex-tab-move', { detail: { id: idOf('shadow_ws.slx'), index: 0 }, bubbles: true, composed: true }));
    await until(() => panes()[0] === 'shadow_ws.slx* ParamMat.mat');
    // Moved in the pane not focused: the focus stays where it was.
    expect(docsArea().focusedPane).toBe(1);
  });
});

describe('the focused pane', () => {
  it('is the one a press comes into: the toolbar, the location bar, the inspector and the status follow its tab', async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => segments().at(-1) === 'params.sldd');
    await edit('params.sldd', 'Kp', '7');
    await until(() => enabledItems().includes('save'));
    pressIn('shadow_ws.slx');
    await until(() => segments().at(-1) === 'shadow_ws.slx');
    expect(docsArea().focusedPane).toBe(0);
    expect(rows().map((r) => r.unfocused)).toEqual([false, true]);
    // The model's: it holds no edits, and its status says what it is.
    expect(enabledItems()).not.toContain('save');
    expect(statusText()).toBe('Simulink model');
    expect(document.title).toBe('shadow_ws.slx — Data Explorer');
    await until(() => inspectorRows().includes('Name: shadow_ws.slx'));
    // Back in the other pane, a row of its table clicked: the location bar and the inspector are its.
    pressIn('params.sldd');
    await until(() => docsArea().focusedPane === 1);
    const kp = await selectRow('params.sldd', 'Kp');
    await until(() => segments().at(-1) === 'Kp');
    expect(enabledItems()).toContain('save');
    expect(statusText()).toBe('Data dictionary · Modified');
    expect(tableOf('params.sldd')!.selectedRowIds).toEqual([kp.ID]);
  });

  it('stays the pane pressed while the variable editor it closes gives the keyboard back to the other pane', async () => {
    // The editor, opened from a table of the left pane, closes as the right pane's tab becomes the
    // active one, and gives the keyboard back to the glyph it was opened from: no press of the user's.
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    pressIn('shadow_ws.slx');
    await until(() => docsArea().focusedPane === 0);
    const editor = document.querySelector('dex-variable-editor')!;
    const close = editor.close.bind(editor);
    editor.close = () => {
      close();
      panelOf('shadow_ws.slx').dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    };
    pressIn('params.sldd');
    await until(() => segments().at(-1) === 'params.sldd');
    expect(docsArea().focusedPane).toBe(1);
  });

  it('saves and closes the tab of the focused pane', async () => {
    const page = await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    await edit('params.sldd', 'Kp', '7');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    pressIn('ParamMat.mat');
    await until(() => docsArea().focusedPane === 0);
    // shadow_ws.slx is the left pane's shown tab; ParamMat.mat is not shown: show it first.
    tabEl('ParamMat.mat')!.click();
    await until(() => segments().at(-1) === 'ParamMat.mat');
    page.command('save');
    await until(() => page.main.saves.length === 1);
    expect(page.main.saves[0]!.path).toBe('/work/ParamMat.mat');
    page.command('close-tab');
    await until(() => panes()[0] === 'shadow_ws.slx*');
    expect(panes()[1]).toBe('params.sldd*');
  });
});

describe('the keyboard on a tab that moves', () => {
  // A press on a tab focuses it, so a drag of it begins with the keyboard on it; so does Mod+\
  // pressed on a tab. The tab leaves the row: the keyboard goes with it, to the pane it went to,
  // and the row it left takes it for no neighbour of its, which would focus the pane it left.
  const keyboardIn = (row: number) => rows()[row]?.shadowRoot?.activeElement ?? null;

  it('goes with a tab dropped on a side of the documents, or on the other row', async () => {
    await opened();
    tabEl('params.sldd')!.focus();
    expect(keyboardIn(0)).toBe(tabEl('params.sldd'));
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => keyboardIn(1) === tabEl('params.sldd'));
    expect(docsArea().focusedPane).toBe(1);
    expect(segments().at(-1)).toBe('params.sldd');
    tabEl('ParamMat.mat')!.focus();
    await until(() => docsArea().focusedPane === 0);
    await dropOnRow('ParamMat.mat', 1);
    await until(() => keyboardIn(1) === tabEl('ParamMat.mat'));
    await redrawn();
    expect(docsArea().focusedPane).toBe(1);
    expect(segments().at(-1)).toBe('ParamMat.mat');
  });

  it('goes with a tab Split Right moves, and to the one pane left when the panes join', async () => {
    const page = await opened();
    tabEl('shadow_ws.slx')!.focus();
    page.command('split-right');
    await until(() => keyboardIn(1) === tabEl('shadow_ws.slx'));
    await redrawn();
    expect(docsArea().focusedPane).toBe(1);
    page.command('move-to-other-pane');
    await until(() => rows().length === 1 && keyboardIn(0) === tabEl('shadow_ws.slx'));
    await redrawn();
    expect(segments().at(-1)).toBe('shadow_ws.slx');
  });
});

describe('closing', () => {
  it("takes a pane away with its last tab, the other taking the whole area and the focus", async () => {
    const page = await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    page.command('close-tab');
    await until(() => panes().length === 1);
    expect(panes()).toEqual(['ParamMat.mat shadow_ws.slx*']);
    expect(docsArea().split).toBe(false);
    expect(rows().map((r) => r.unfocused)).toEqual([false]);
    await until(() => segments().at(-1) === 'shadow_ws.slx');
    expect(shown()).toEqual(['shadow_ws.slx@0']);
  });

  it('leaves the focused pane focused when the other pane closes its last tab', async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'left');
    await until(() => panes().length === 2);
    pressIn('shadow_ws.slx');
    await until(() => docsArea().focusedPane === 1);
    rows()[0]!.dispatchEvent(new CustomEvent('dex-tab-close', { detail: { id: idOf('params.sldd') }, bubbles: true, composed: true }));
    await until(() => panes().length === 1);
    expect(panes()).toEqual(['ParamMat.mat shadow_ws.slx*']);
    expect(segments().at(-1)).toBe('shadow_ws.slx');
  });
});

describe('opening', () => {
  it('opens a new file in the focused pane, and a file already open in its tab, wherever it is', async () => {
    const page = startPage({ ...FILES, 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'ParamMat.mat', 'shadow_ws.slx');
    await dropOnDocs('shadow_ws.slx', 0, 'right');
    await until(() => panes().length === 2);
    pressIn('ParamMat.mat');
    await until(() => docsArea().focusedPane === 0);
    await open(page, 'rt_bin.sldd');
    await until(() => panes()[0] === 'params.sldd ParamMat.mat rt_bin.sldd*');
    expect(paneOfPanel('rt_bin.sldd')).toBe(0);
    // One tab per file: the model is open in the right pane, which is focused for it.
    void page.handle.openPaths(['/work/shadow_ws.slx']);
    await until(() => docsArea().focusedPane === 1);
    expect(panes()).toEqual(['params.sldd ParamMat.mat rt_bin.sldd*', 'shadow_ws.slx*']);
    expect(document.querySelectorAll('.doc-panel').length).toBe(4);
  });

  it('replaces the preview tab of the focused pane, and leaves the other pane its own', async () => {
    const page = startPage({ ...FILES, 'rt_bin.sldd': 'rt_bin.sldd', 'shared_gain.slx': 'shared_gain.slx' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await dropOnDocs('ParamMat.mat', 0, 'right');
    await until(() => panes().length === 2);
    // A link's preview, in the right pane, focused.
    const search = document.querySelector('dex-search-panel')!;
    const preview = (name: string) =>
      search.dispatchEvent(new CustomEvent('dex-search-open', { detail: { sourceUri: sourceUri(`/work/${name}`), revealName: '' }, bubbles: true, composed: true }));
    preview('shadow_ws.slx');
    await until(() => panes()[1] === 'ParamMat.mat shadow_ws.slx*');
    pressIn('params.sldd');
    await until(() => docsArea().focusedPane === 0);
    // The left pane's own preview: the right pane's stays.
    preview('rt_bin.sldd');
    await until(() => panes()[0] === 'params.sldd rt_bin.sldd*');
    expect(panes()[1]).toBe('ParamMat.mat shadow_ws.slx*');
    preview('shared_gain.slx');
    await until(() => panes()[0] === 'params.sldd shared_gain.slx*');
    expect(panes()[1]).toBe('ParamMat.mat shadow_ws.slx*');
    expect(page.main.closedFiles).toContain('/work/rt_bin.sldd');
  });
});

describe('Root', () => {
  it('shows the graph over both panes, and both panes again after', async () => {
    const page = await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    page.command('show-graph');
    await until(() => graphShown());
    expect(docsArea().split).toBe(false);
    expect(rows().every((r) => r.hidden)).toBe(true);
    expect(shown()).toEqual([]);
    // Back to the documents by a tab of the left pane: both panes, each its tab, the left one focused.
    page.command('back');
    await until(() => docsArea().split);
    expect(shown()).toEqual(['params.sldd@1', 'shadow_ws.slx@0']);
    expect(docsArea().focusedPane).toBe(1);
    expect(graphShown()).toBe(false);
  });
});

describe('the divider', () => {
  const dividerOf = () => docsArea().shadowRoot!.querySelector<HTMLElement>('[role="separator"]')!;

  it('moves by the arrow keys, held to a fifth either way, and is kept with the layout for the next start', async () => {
    const page = await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => !!docsArea().shadowRoot!.querySelector('[role="separator"]'));
    for (let i = 0; i < 8; i++) dividerOf().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true }));
    expect(docsArea().ratio).toBe(0.8);
    const kept = JSON.parse(localStorage.getItem('dex-shell:layout')!);
    expect(kept.split).toBe(0.8);
    // The shell's own write of its sides keeps it.
    page.shell.toggleView('explorer');
    expect(JSON.parse(localStorage.getItem('dex-shell:layout')!).split).toBe(0.8);
    expect(JSON.parse(localStorage.getItem('dex-shell:layout')!).left.open).toBe(false);
    // The next start draws it so, once it splits; which tabs are in which pane is not kept.
    page.handle.dispose();
    document.body.replaceChildren();
    const next = startPage(FILES);
    expect(docsArea().ratio).toBe(0.8);
    await open(next, 'params.sldd', 'ParamMat.mat');
    expect(panes()).toEqual(['params.sldd ParamMat.mat*']);
  });

  it('reads a ratio kept out of bounds, or none, as the bounds and the half', async () => {
    localStorage.setItem('own:layout', JSON.stringify({ split: 0.05 }));
    startPage({}, { shellStorageKey: 'own:layout' });
    expect(docsArea().ratio).toBe(0.2);
    document.body.replaceChildren();
    localStorage.clear();
    startPage();
    expect(docsArea().ratio).toBe(0.5);
  });

  it('is kept at the end of a drag', async () => {
    await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => !!docsArea().shadowRoot!.querySelector('[role="separator"]'));
    docsArea().ratio = 0.35;
    docsArea().dispatchEvent(new CustomEvent('dex-panes-resized', { detail: { ratio: 0.35 }, bubbles: true, composed: true }));
    expect(JSON.parse(localStorage.getItem('dex-shell:layout')!).split).toBe(0.35);
  });
});

describe('one tab per file', () => {
  it('holds across the panes: a row of each file, a panel of each file', async () => {
    const page = await opened();
    await dropOnDocs('params.sldd', 0, 'right');
    await until(() => panes().length === 2);
    await rowOf('params.sldd', 'Kp');
    for (const name of Object.keys(FILES)) void page.handle.openPaths([`/work/${name}`]);
    await until(() => docsArea().focusedPane === 0);
    const names = rows().flatMap((r) => r.tabs.map((t) => t.subtitle ?? t.label)).sort();
    expect(names).toEqual(['ParamMat.mat', 'params.sldd', 'shadow_ws.slx']);
    expect(document.querySelectorAll('.doc-panel').length).toBe(3);
  });
});

describe('the commands and chords', () => {
  /** A chord pressed where the focus is (the body by default), Mod as the platform has it. */
  function chord(key: string, from: EventTarget = document.body, mod = true): boolean {
    const mac = onMac();
    const e = new KeyboardEvent('keydown', { key, metaKey: mod && mac, ctrlKey: !mod || !mac, bubbles: true, composed: true, cancelable: true });
    from.dispatchEvent(e);
    return e.defaultPrevented;
  }
  // The commands the palette was last shown with.
  let offered: PaletteCommand[] = [];
  const watchPalette = () => {
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((offered = commands), show(commands));
  };
  const paletteRow = (id: string) => offered.find((c) => c.id === id)!;

  it('Split Right moves the active tab into a new pane on the right; from the left pane of two, into the right one', async () => {
    const page = await opened();
    page.command('split-right');
    await until(() => panes().length === 2);
    expect(panes()).toEqual(['params.sldd ParamMat.mat*', 'shadow_ws.slx*']);
    expect(docsArea().focusedPane).toBe(1);
    // From the right pane, nothing is to its right.
    page.command('split-right');
    await until(() => segments().at(-1) === 'shadow_ws.slx');
    expect(panes()).toEqual(['params.sldd ParamMat.mat*', 'shadow_ws.slx*']);
    pressIn('ParamMat.mat');
    await until(() => docsArea().focusedPane === 0);
    expect(chord('\\')).toBe(true);
    await until(() => panes()[1] === 'shadow_ws.slx ParamMat.mat*');
    expect(panes()[0]).toBe('params.sldd*');
  });

  it("makes no pane of a lone pane's only tab", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.command('split-right');
    page.command('move-to-other-pane');
    await until(() => segments().at(-1) === 'params.sldd');
    expect(panes()).toEqual(['params.sldd*']);
    expect(docsArea().split).toBe(false);
  });

  it('Move to Other Pane moves the active tab across, making the other pane from a lone one, and joins them from a pane of one tab', async () => {
    const page = await opened();
    page.command('move-to-other-pane');
    await until(() => panes().length === 2);
    expect(panes()).toEqual(['params.sldd ParamMat.mat*', 'shadow_ws.slx*']);
    pressIn('ParamMat.mat');
    await until(() => docsArea().focusedPane === 0);
    page.command('move-to-other-pane');
    await until(() => panes()[1] === 'shadow_ws.slx ParamMat.mat*');
    // The right pane's tab, back to the left one: its pane keeps the other tab.
    page.command('move-to-other-pane');
    await until(() => panes()[0] === 'params.sldd ParamMat.mat*');
    expect(panes()[1]).toBe('shadow_ws.slx*');
    // The right pane's only tab: the panes join.
    pressIn('shadow_ws.slx');
    await until(() => docsArea().focusedPane === 1);
    page.command('move-to-other-pane');
    await until(() => panes().length === 1);
    expect(panes()).toEqual(['params.sldd ParamMat.mat shadow_ws.slx*']);
  });

  it('Mod+1 and Mod+2 go to each pane, the keyboard on its tab, from Root too', async () => {
    const page = await opened();
    page.command('split-right');
    await until(() => panes().length === 2);
    expect(chord('1')).toBe(true);
    await until(() => docsArea().focusedPane === 0);
    await until(() => rows()[0]!.shadowRoot!.activeElement === tabEl('ParamMat.mat'));
    expect(segments().at(-1)).toBe('ParamMat.mat');
    chord('2');
    await until(() => rows()[1]!.shadowRoot!.activeElement === tabEl('shadow_ws.slx'));
    expect(docsArea().focusedPane).toBe(1);
    page.command('show-graph');
    await until(() => graphShown());
    chord('1');
    await until(() => docsArea().split && docsArea().focusedPane === 0);
    expect(shown()).toEqual(['ParamMat.mat@0', 'shadow_ws.slx@1']);
    // The right pane's only tab moved to the left one: with one pane, Mod+1 and Mod+2 are the
    // browser's, which switches its own tabs by them.
    chord('2');
    await until(() => docsArea().focusedPane === 1);
    page.command('move-to-other-pane');
    await until(() => panes().length === 1);
    expect(chord('1')).toBe(false);
    expect(chord('2')).toBe(false);
    expect(docsArea().focusedPane).toBe(0);
  });

  it('leaves Mod+1 and Mod+2 to the browser until the documents are split, and spends Mod+\\ always', async () => {
    const page = startPage(FILES);
    expect([chord('1'), chord('2')]).toEqual([false, false]);
    await open(page, 'params.sldd', 'ParamMat.mat');
    expect([chord('1'), chord('2')]).toEqual([false, false]);
    expect(chord('\\')).toBe(true);
    await until(() => panes().length === 2);
    expect([chord('1'), chord('2')]).toEqual([true, true]);
  });

  it("Ctrl+Tab goes round the focused pane's tabs alone", async () => {
    const page = startPage({ ...FILES, 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'ParamMat.mat', 'shadow_ws.slx', 'rt_bin.sldd');
    page.command('split-right');
    await until(() => panes().length === 2);
    pressIn('shadow_ws.slx');
    await until(() => docsArea().focusedPane === 0 && segments().at(-1) === 'shadow_ws.slx');
    const order: string[] = [];
    let last = 'shadow_ws.slx';
    for (let i = 0; i < 3; i++) {
      chord('Tab', document.body, false);
      await until(() => segments().at(-1) !== last);
      last = segments().at(-1)!;
      order.push(last);
    }
    expect(order).toEqual(['params.sldd', 'ParamMat.mat', 'shadow_ws.slx']);
    expect(panes()[1]).toBe('rt_bin.sldd*');
    expect(docsArea().focusedPane).toBe(0);
  });

  it("lists the panes' commands in the palette, each enabled as it would act now", async () => {
    const page = await opened();
    watchPalette();
    page.command('palette');
    await until(() => offered.length > 0);
    expect(['split-right', 'move-to-other-pane', 'focus-pane-1', 'focus-pane-2'].map((id) => !paletteRow(id).disabled)).toEqual([true, true, true, false]);
    palette().close();
    page.command('split-right');
    await until(() => panes().length === 2);
    offered = [];
    page.command('palette');
    await until(() => offered.length > 0);
    expect(paletteRow('focus-pane-2').disabled).toBeFalsy();
    // The right pane's tab is active: nothing is to its right.
    expect(paletteRow('split-right').disabled).toBe(true);
    expect(paletteRow('move-to-other-pane').disabled).toBeFalsy();
    palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id: 'focus-pane-1' }, bubbles: true, composed: true }));
    await until(() => docsArea().focusedPane === 0);
  });
});
