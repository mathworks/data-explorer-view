// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Folder view: the workspace folder in a left view of its own, beside the Explorer, which keeps
// the open files alone. What it protects:
//
// - The view is there for a host that shows folders, with its button, its chord and its palette
//   row, and before any folder it says there is none and offers Open Folder… and a drop.
// - A folder shown lists as a file browser does: its folders first, its data files (which open, and
//   expand to what they reference), and its other files dimmed, which open nothing.
// - The path bar re-roots through the host: ↑, a segment, a folded segment, a recent folder, a
//   folder row's Use as Folder. While the host answers, the bar is busy and a note says what is
//   read; a host that cannot open the folder leaves the folder shown as it was, and says why. A
//   host that cannot go up has no ↑; one that can only ask for a folder again picks it again.
// - Each row's menu (a right click, Shift+F10) offers what its kind of row can do.
// - The rows of a file open in a tab are marked as its tab stands, and the active tab's revealed.
// - Used By and the graph follow a re-root, as they follow a folder shown.
// - A host that lists no entries shows the tree the shell showed before: the hierarchy's.
//
// Over the shell harness: a folder on disk, served as main serves one, with `entries` (and once
// without), and the host's folder members (folderParent, openFolderAt, recentFolders) answered here.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContextMenuItem, ContextMenuShowOptions } from '../../src/widgets/context-menu/dex-context-menu.js';
import type { DexFolderBar } from '../../src/widgets/app-shell/dex-folder-bar.js';
import type { DexHierarchy } from '../../src/widgets/hierarchy/dex-hierarchy.js';
import type { ShellHost } from '../../src/widgets/app-shell/connect/types.js';
import { folderLabel, segmentsOf } from '../../src/widgets/app-shell/connect/folderNav.js';
import {
  docsArea,
  explorer,
  folderPart,
  palette,
  previewTabs,
  serveFolderTo,
  settled,
  startPage,
  tabNames,
  tempFolder,
  toastTexts,
  until,
  type Page,
  type ServeOptions,
} from './harness.js';

afterEach(() => Reflect.deleteProperty(navigator, 'platform'));

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

// --- The page -----------------------------------------------------------------------------------

/** The workspace: `work`, its data in `data`, its models in `models`, notes, and a folder of notes alone. */
function workFolder(): string {
  const work = tempFolder('work', {
    'data/params.sldd': 'params.sldd',
    'models/shadow_ws.slx': 'shadow_ws.slx',
    'models/shared_gain.slx': 'shared_gain.slx',
  });
  writeFileSync(path.join(work, 'notes.md'), '# notes\n');
  writeFileSync(path.join(work, 'models', 'gen.m'), 'disp(1)\n');
  return work;
}

interface FolderPage extends Page {
  /** The folders the host was asked to open (openFolderAt), in turn. */
  openedAt: string[];
  /** Show `dir`, as the host does once it serves it. */
  serve(dir: string): void;
  /** The top of the path the host gives: above it, no folder. */
  top: string;
}

/**
 * A page over the real files whose host shows folders and moves between them: its parent is the
 * folder above, up to the temporary folder the workspace is in; opening one serves it and shows it.
 */
function folderPage(dir: string, options: ServeOptions & { without?: (keyof ShellHost)[]; show?: boolean } = { entries: true }): FolderPage {
  const page = startPage({}, { without: options.without });
  page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
  // The temporary folder `work` is in: the host goes no higher.
  const top = dir.slice(0, dir.lastIndexOf(`${path.sep}work`));
  const openedAt: string[] = [];
  const served = { entries: options.entries };
  const serve = (to: string): void => {
    const folder = serveFolderTo(page, to, served);
    stops.push(folder.dispose);
  };
  page.host.folderParent = (p) => (p === top || !p.startsWith(top) ? null : path.dirname(p));
  page.host.openFolderAt = async (p) => {
    openedAt.push(p);
    serve(p);
    return true;
  };
  page.host.recentFolders = async () => [];
  page.host.revealIn = 'Finder';
  if (options.show !== false) serve(dir);
  return Object.assign(page, { openedAt, serve, top });
}

// --- Its parts ----------------------------------------------------------------------------------

const folderView = (page: Page) => page.shell.querySelector<HTMLElement>('dex-shell-view[view="folder"]');
const bar = () => document.querySelector<DexFolderBar>('dex-folder-bar')!;
const tree = () => document.querySelector<DexHierarchy>('dex-hierarchy')!;
const rows = () => [...(tree().shadowRoot?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
const labelOf = (row: HTMLElement) => row.querySelector('.label')?.textContent?.trim() ?? '';
const rowNamed = (label: string) => rows().find((r) => labelOf(r) === label);
/** The tree's rows as drawn: each its label, indented by its level, and `(dimmed)` for a file that opens nothing. */
const drawn = () =>
  rows().map((r) => `${'  '.repeat(Number(r.getAttribute('aria-level')) - 1)}${labelOf(r)}${r.classList.contains('dimmed') ? ' (dimmed)' : ''}`);
const segmentLabels = () => bar().segments.map((s) => s.label);
const statusLine = () => folderPart().shadowRoot?.querySelector('[role="status"]')?.textContent?.trim() ?? '';
const send = (type: string, detail: unknown = null) => bar().dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
const viewShown = (page: Page, side: 'left' | 'right' | 'bottom') => (page.shell.layout[side].open ? page.shell.layout[side].view : null);

/** A committed edit of row `row`'s Value in the table of the file at `file`, as the table sends one. */
async function editAt(file: string, row: string, value: string): Promise<void> {
  type Row = { ID: string; Name?: { label: string }; Value?: { text?: string } | string };
  const table = () => document.querySelector<HTMLElement & { rows: Row[] }>(`.doc-panel[data-path="${CSS.escape(file)}"] dex-tree-table`);
  await until(() => !!table()?.rows.find((r) => r.Name?.label === row));
  const r = table()!.rows.find((x) => x.Name?.label === row)!;
  const old = typeof r.Value === 'object' ? String(r.Value?.text ?? '') : String(r.Value ?? '');
  table()!.dispatchEvent(
    new CustomEvent('dex-edit-completed', { detail: { rowId: r.ID, columnId: 'Value', oldValue: old, newValue: value }, bubbles: true, composed: true }),
  );
}

/** Open the folder row `label` (its twisty), and wait for its rows. */
async function expand(label: string): Promise<void> {
  await until(() => !!rowNamed(label));
  const row = rowNamed(label)!;
  if (row.getAttribute('aria-expanded') !== 'true') row.querySelector<HTMLElement>('.twisty')!.click();
  await until(() => rowNamed(label)!.getAttribute('aria-expanded') === 'true' && rowNamed(label)!.getAttribute('aria-busy') !== 'true');
}

// The shared context menu's shows, recorded.
interface Shown {
  x: number;
  y: number;
  items: ContextMenuItem[];
  options?: ContextMenuShowOptions;
}
let menus: Shown[] = [];
function recordMenus(): void {
  menus = [];
  const menu = document.querySelector('dex-context-menu')!;
  const show = menu.show.bind(menu);
  menu.show = (x, y, items, options) => {
    menus.push({ x, y, items, ...(options ? { options } : {}) });
    show(x, y, items, options);
  };
}
const lastMenu = () => menus.at(-1)!;
const menuLabels = (m: Shown = lastMenu()) => m.items.map((i) => (i.separator ? '—' : i.label));
/** Choose the item `label` of the menu last shown, as a click on it does. */
function choose(label: string): void {
  const item = lastMenu().items.find((i) => i.label === label);
  expect(item, `${label} in ${menuLabels().join(', ')}`).toBeDefined();
  document.querySelector('dex-context-menu')!.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId: item!.id }, bubbles: true, composed: true }));
}
/**
 * A right click on the row `label`, as a browser sends one: the press (which closes a menu open
 * before, outside it), then the menu event.
 */
function rightClick(label: string): void {
  const row = rowNamed(label)!;
  row.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, composed: true }));
  row.dispatchEvent(new MouseEvent('contextmenu', { button: 2, clientX: 20, clientY: 30, bubbles: true, composed: true, cancelable: true }));
}

// --- The tests ----------------------------------------------------------------------------------

describe('the Folder view', () => {
  it('is a left view of its own, second, with its chord and its palette row; the Explorer keeps the open files alone', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const page = folderPage(workFolder(), { entries: true, show: false });
    await settled();
    const view = folderView(page)!;
    expect([view.getAttribute('side'), view.getAttribute('label'), view.getAttribute('icon'), view.getAttribute('shortcut')]).toEqual([
      'left',
      'Folder',
      'folder',
      'Mod+Shift+K',
    ]);
    const left = [...page.shell.querySelectorAll('dex-shell-view[side="left"]')].map((v) => v.getAttribute('view'));
    expect(left.slice(0, 2)).toEqual(['explorer', 'folder']);
    expect([...view.children].map((c) => c.localName)).toEqual(['dex-shell-folder']);
    expect([...folderPart().children].map((c) => c.localName)).toEqual(['dex-folder-bar', 'dex-hierarchy']);
    expect([...explorer().parentElement!.children].map((c) => c.localName)).toEqual(['dex-explorer']);
    // Its chord shows it.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await until(() => viewShown(page, 'left') === 'folder');
    // And the palette's Show Folder, with the chord.
    let offered: { id: string; label: string; shortcut?: string; disabled?: boolean }[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((offered = commands), show(commands));
    page.command('palette');
    expect(offered.find((c) => c.id === 'show-folder')).toMatchObject({ label: 'Show Folder', shortcut: 'Ctrl+Shift+K' });
    expect(offered.filter((c) => c.id.startsWith('folder-')).map((c) => [c.id, c.label, !!c.disabled])).toEqual([
      ['folder-up', 'Folder: Up One Level', true],
      ['folder-refresh', 'Folder: Read Again', true],
    ]);
  });

  it('is not there for a host that shows no folders, nor its palette rows', () => {
    const page = startPage({}, { without: ['pickFolder'] });
    expect(folderView(page)).toBeNull();
    let offered: { id: string }[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((offered = commands), show(commands));
    page.command('palette');
    expect(offered.filter((c) => c.id === 'show-folder' || c.id.startsWith('folder-'))).toEqual([]);
  });

  it('says no folder is open, and offers Open Folder… and a drop, until one is shown', async () => {
    const page = folderPage(workFolder(), { entries: true, show: false });
    await until(() => !!folderPart().shadowRoot?.querySelector('.welcome'));
    const welcome = folderPart().shadowRoot!.querySelector<HTMLElement>('.welcome')!;
    expect(welcome.textContent).toContain('No folder is open.');
    expect(welcome.textContent).toContain('or drop a folder onto this window');
    // The bar and the tree are not drawn meanwhile.
    expect(folderPart().shadowRoot!.querySelector('slot')).toBeNull();
    welcome.querySelector<HTMLButtonElement>('button')!.click();
    await until(() => page.main.folderPicks === 1);
  });

  it('lists a folder as a file browser does: folders first, data files that expand, other files dimmed', async () => {
    const work = workFolder();
    folderPage(work);
    await until(() => drawn().length > 1);
    expect(drawn()).toEqual(['work', '  data', '  models', '  notes.md (dimmed)']);
    await expand('models');
    expect(drawn()).toEqual(['work', '  data', '  models', '    gen.m (dimmed)', '    shadow_ws.slx', '    shared_gain.slx', '  notes.md (dimmed)']);
    // A model expands to what it references.
    expect(rowNamed('shadow_ws.slx')!.hasAttribute('aria-expanded')).toBe(true);
    // A file the app does not open: Enter on it opens nothing.
    const notes = rowNamed('notes.md')!;
    notes.focus();
    notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    notes.click();
    await settled();
    expect(tabNames()).toEqual([]);
    // A data file opens, in a preview tab.
    rowNamed('shared_gain.slx')!.click();
    await until(() => tabNames().length === 1);
    expect(previewTabs()).toEqual(['shared_gain.slx']);
  });

  it('shows the tree the shell showed before for a host whose served folder lists no entries', async () => {
    folderPage(workFolder(), { entries: false });
    await until(() => rows().length > 1);
    expect(rows().filter((r) => r.classList.contains('dimmed'))).toEqual([]);
    expect(drawn()).not.toContain('  notes.md (dimmed)');
    // The hierarchy's: a group for each folder that holds data files.
    expect(drawn().filter((l) => !l.startsWith(' '))).toEqual(['data', 'models']);
  });

  it('stays behind the left view the kept layout shows when the first folder comes, as at a launch that reopens it', async () => {
    localStorage.setItem('dex-shell:layout', JSON.stringify({ left: { view: 'search', open: true, size: 220 } }));
    const work = workFolder();
    const page = folderPage(work, { entries: true, show: false });
    await settled();
    expect(viewShown(page, 'left')).toBe('search');
    page.serve(work);
    await until(() => segmentLabels().at(-1) === 'work');
    await settled();
    expect(viewShown(page, 'left')).toBe('search');
  });

  it('feeds Used By from a folder shown by a host with no Folder view', async () => {
    const work = workFolder();
    const page = folderPage(work, { entries: true, without: ['pickFolder'] });
    expect(folderView(page)).toBeNull();
    const dict = path.join(work, 'data', 'params.sldd');
    void page.handle.openPaths([dict]);
    const usedBy = () => {
      const table = document.querySelector<HTMLElement & { rows: { Name?: { label: string }; UsedBy?: { blockLinks?: { blockName: string }[] } }[] }>(
        `.doc-panel[data-path="${CSS.escape(dict)}"] dex-tree-table`,
      );
      return (table?.rows.find((r) => r.Name?.label === 'Kp')?.UsedBy?.blockLinks ?? []).map((b) => b.blockName);
    };
    await until(() => usedBy().includes('PlantGain'), 5000);
  });

  it('is brought forward the first time a folder is shown, and not again as the folder changes', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'), { entries: true, show: false });
    await settled();
    expect(viewShown(page, 'left')).toBe('explorer');
    page.serve(path.join(work, 'data'));
    await until(() => viewShown(page, 'left') === 'folder');
    page.command('show-explorer');
    await until(() => viewShown(page, 'left') === 'explorer');
    send('dex-folder-up');
    await until(() => segmentLabels().at(-1) === 'work');
    await settled();
    expect(viewShown(page, 'left')).toBe('explorer');
  });
});

describe('the path bar', () => {
  it("names the folder's path as the host walks it up, and ↑ re-roots to the folder above", async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    expect(segmentLabels()).toEqual([path.basename(page.top), 'work', 'data']);
    expect(bar().segments.map((s) => s.path)).toEqual([page.top, work, path.join(work, 'data')]);
    expect([bar().canUp, bar().refresh, bar().busy]).toEqual([true, 'read', false]);
    send('dex-folder-up');
    await until(() => segmentLabels().at(-1) === 'work');
    expect(page.openedAt).toEqual([work]);
    expect(bar().busy).toBe(false);
    await until(() => drawn()[0] === 'work');
    // A segment re-roots there; the top has no folder above it.
    send('dex-folder-go', { path: page.top });
    await until(() => segmentLabels().length === 1);
    expect(page.openedAt).toEqual([work, page.top]);
    expect(bar().canUp).toBe(false);
  });

  it('is busy, and says what it reads, while the host opens the folder', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    let release!: () => void;
    page.host.openFolderAt = async (p) => {
      page.openedAt.push(p);
      await new Promise<void>((done) => (release = done));
      page.serve(p);
      return true;
    };
    send('dex-folder-up');
    await until(() => bar().busy && statusLine() === 'Reading work…');
    release();
    await until(() => segmentLabels().at(-1) === 'work');
    expect(bar().busy).toBe(false);
    expect(statusLine()).toBe('');
  });

  it('keeps the folder shown, and says why, when the host cannot open the one asked for', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    page.host.openFolderAt = async () => false;
    send('dex-folder-up');
    await until(() => toastTexts().some((t) => t.startsWith('Could not open work')));
    expect(segmentLabels()).toEqual([path.basename(page.top), 'work', 'data']);
    expect(bar().busy).toBe(false);
    expect(statusLine()).toBe('');
    page.host.openFolderAt = async () => {
      throw new Error("EACCES: permission denied, scandir 'work'");
    };
    send('dex-folder-go', { path: work });
    await until(() => toastTexts().includes("Could not open work: EACCES: permission denied, scandir 'work'"));
    expect(bar().busy).toBe(false);
  });

  it('offers no ↑ where the host gives the folder itself as the one above, as a drive is its own top', async () => {
    const work = workFolder();
    const page = folderPage(work);
    await until(() => segmentLabels().length > 0);
    page.host.folderParent = (p) => p;
    page.serve(path.join(work, 'models'));
    await until(() => segmentLabels().join() === 'models');
    expect(bar().canUp).toBe(false);
    page.command('folder-up');
    await settled();
    expect(page.openedAt).toEqual([]);
  });

  it('offers no ↑ for a host that cannot go up, and Pick Again for one that can only ask for the folder again', async () => {
    const work = workFolder();
    const page = folderPage(work);
    await until(() => segmentLabels().length > 0);
    delete page.host.folderParent;
    page.host.folderRefresh = 'pick';
    page.serve(path.join(work, 'models'));
    await until(() => segmentLabels().join() === 'models');
    expect([bar().canUp, bar().refresh]).toEqual([false, 'pick']);
    send('dex-folder-refresh');
    await until(() => page.main.folderPicks === 1);
  });

  it('reads the folder again on ⟳, a file written into it a row of its own', async () => {
    const work = workFolder();
    folderPage(work);
    await until(() => drawn().includes('  notes.md (dimmed)'));
    writeFileSync(path.join(work, 'todo.txt'), 'x\n');
    send('dex-folder-refresh');
    await until(() => drawn().includes('  todo.txt (dimmed)'));
  });

  it('lists Open Folder…, the recent folders and Reveal on ⋯, each doing what it says', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    recordMenus();
    page.host.recentFolders = async () => [path.join(work, 'data'), path.join(work, 'models'), work];
    send('dex-folder-menu', { anchor: { x: 100, y: 10, width: 24, height: 24 } });
    await until(() => menus.length === 1);
    // The current folder is not among the recent ones.
    expect(menuLabels()).toEqual(['Open Folder…', 'models', 'work', '—', 'Reveal in Finder']);
    expect([lastMenu().x, lastMenu().y]).toEqual([100, 34]);
    choose('models');
    await until(() => segmentLabels().at(-1) === 'models');
    expect(page.openedAt).toEqual([path.join(work, 'models')]);
    send('dex-folder-menu', { anchor: { x: 100, y: 10, width: 24, height: 24 } });
    await until(() => menus.length === 2);
    choose('Reveal in Finder');
    await until(() => page.main.revealed.length === 1);
    expect(page.main.revealed).toEqual([path.join(work, 'models')]);
    send('dex-folder-menu', { anchor: { x: 100, y: 10, width: 24, height: 24 } });
    await until(() => menus.length === 3);
    choose('Open Folder…');
    await until(() => page.main.folderPicks === 1);
  });

  it('opens either menu with the keyboard on its first item when Enter or Space pressed its button', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    recordMenus();
    page.host.recentFolders = async () => [work];
    send('dex-folder-menu', { anchor: { x: 100, y: 10, width: 24, height: 24 }, keyboard: true });
    await until(() => menus.length === 1);
    expect(lastMenu().options?.focusFirst).toBe(true);
    send('dex-folder-menu', { anchor: { x: 40, y: 10, width: 20, height: 24 }, segments: [{ label: 'work', path: work }], keyboard: true });
    await until(() => menus.length === 2);
    expect(menuLabels()).toEqual(['work']);
    expect(lastMenu().options?.focusFirst).toBe(true);
    // A pointer's press: the keyboard stays where it is.
    send('dex-folder-menu', { anchor: { x: 100, y: 10, width: 24, height: 24 } });
    await until(() => menus.length === 3);
    expect(lastMenu().options?.focusFirst).toBeFalsy();
  });

  it('leaves out the recent folders with none, and Reveal for a host that shows nothing in a file manager', async () => {
    const work = workFolder();
    const page = folderPage(work, { entries: true, without: ['reveal'] });
    await until(() => segmentLabels().length > 0);
    recordMenus();
    send('dex-folder-menu', { anchor: { x: 0, y: 0, width: 24, height: 24 } });
    await until(() => menus.length === 1);
    expect(menuLabels()).toEqual(['Open Folder…']);
  });

  it('lists the folders a long path folded away, and re-roots to the one chosen', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    recordMenus();
    send('dex-folder-menu', { anchor: { x: 40, y: 10, width: 20, height: 24 }, segments: [{ label: 'work', path: work }] });
    await until(() => menus.length === 1);
    expect(menuLabels()).toEqual(['work']);
    choose('work');
    await until(() => segmentLabels().at(-1) === 'work');
    expect(page.openedAt).toEqual([work]);
  });

  it('carries out Up One Level and Read Again from the palette, Up only where there is a folder above', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    await until(() => segmentLabels().length === 3);
    let offered: { id: string; disabled?: boolean }[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((offered = commands), show(commands));
    page.command('palette');
    expect(offered.filter((c) => c.id.startsWith('folder-')).map((c) => [c.id, !!c.disabled])).toEqual([
      ['folder-up', false],
      ['folder-refresh', false],
    ]);
    palette().close();
    palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id: 'folder-up' }, bubbles: true, composed: true }));
    await until(() => segmentLabels().at(-1) === 'work');
    expect(page.openedAt).toEqual([work]);
  });
});

describe("a row's menu", () => {
  it('opens on a right click and on Shift+F10, with what the row can do', async () => {
    const work = workFolder();
    folderPage(work);
    recordMenus();
    await expand('models');
    rightClick('shared_gain.slx');
    await until(() => menus.length === 1);
    expect(menuLabels()).toEqual(['Open', 'Open to the Side', '—', 'Reveal in Finder', 'Copy Path']);
    expect(lastMenu().options?.focusFirst).toBeFalsy();
    // The keyboard's: the focused row's menu, which takes the keyboard.
    const row = rowNamed('notes.md')!;
    row.focus();
    row.click();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, composed: true, cancelable: true }));
    await until(() => menus.length === 2);
    expect(menuLabels()).toEqual(['Reveal in Finder', 'Copy Path']);
    expect(lastMenu().options?.focusFirst).toBe(true);
    rightClick('data');
    await until(() => menus.length === 3);
    expect(menuLabels()).toEqual(['Use as Folder', '—', 'Reveal in Finder', 'Copy Path']);
    // The root's row is the workspace folder already.
    rightClick('work');
    await until(() => menus.length === 4);
    expect(menuLabels()).toEqual(['Reveal in Finder', 'Copy Path']);
  });

  it("does what a data file's items say: Open keeps a tab, Open to the Side puts it beside, Close closes it", async () => {
    const work = workFolder();
    const page = folderPage(work);
    recordMenus();
    await expand('models');
    rightClick('shared_gain.slx');
    await until(() => menus.length === 1);
    choose('Open');
    await until(() => tabNames().includes('shared_gain.slx'));
    expect(previewTabs()).toEqual([]);
    rightClick('shared_gain.slx');
    await until(() => menus.length === 2);
    expect(menuLabels()).toEqual(['Open', 'Open to the Side', 'Close', '—', 'Reveal in Finder', 'Copy Path']);
    rightClick('shadow_ws.slx');
    await until(() => menus.length === 3);
    choose('Open to the Side');
    // In a pane on the right, with a tab row of its own.
    const secondRow = () => [...(document.querySelectorAll('dex-doc-tabs')[1]?.shadowRoot?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.textContent ?? '');
    await until(() => docsArea().split && secondRow().some((t) => t.includes('shadow_ws.slx')));
    expect(tabNames()).toEqual(['shared_gain.slx']);
    rightClick('shared_gain.slx');
    await until(() => menus.length === 4);
    choose('Close');
    await until(() => !tabNames().includes('shared_gain.slx'));
    expect(page.main.closedFiles).toContain(path.join(work, 'models', 'shared_gain.slx'));
  });

  it("reveals a row's file or folder, copies its path, and makes a folder the workspace folder", async () => {
    const work = workFolder();
    const page = folderPage(work);
    recordMenus();
    await until(() => !!rowNamed('notes.md'));
    rightClick('notes.md');
    await until(() => menus.length === 1);
    choose('Copy Path');
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual([path.join(work, 'notes.md')]);
    rightClick('notes.md');
    await until(() => menus.length === 2);
    choose('Reveal in Finder');
    await until(() => page.main.revealed.length === 1);
    expect(page.main.revealed).toEqual([path.join(work, 'notes.md')]);
    rightClick('models');
    await until(() => menus.length === 3);
    choose('Use as Folder');
    await until(() => segmentLabels().at(-1) === 'models');
    expect(page.openedAt).toEqual([path.join(work, 'models')]);
  });

  it('copies a reference row its file, as that file is named on disk', async () => {
    const work = workFolder();
    const page = folderPage(work);
    recordMenus();
    await expand('models');
    await expand('shadow_ws.slx');
    await expand('External Data');
    rightClick('params.sldd');
    await until(() => menus.length === 1);
    choose('Copy Path');
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual([path.join(work, 'data', 'params.sldd')]);
  });
});

describe('the marks', () => {
  it("mark a file's rows as its tab stands: open, the active one, unsaved, a preview; and the active tab's row is revealed", async () => {
    const work = workFolder();
    const page = folderPage(work);
    await expand('data');
    const params = () => rowNamed('params.sldd')!;
    params().click();
    await until(() => tabNames().includes('params.sldd'));
    await until(() => ['open', 'active', 'preview'].every((c) => params().classList.contains(c)));
    expect(params().getAttribute('aria-current')).toBe('true');
    // An edit: unsaved, and kept, no longer a preview.
    await editAt(path.join(work, 'data', 'params.sldd'), 'Kp', '5');
    await until(() => params().querySelectorAll('.badge').length === 1 && !params().classList.contains('preview'));
    page.command('save');
    await until(() => params().querySelectorAll('.badge').length === 0);
    // Another file active: this one open, not active; and that one's row marked active.
    await expand('models');
    rowNamed('shared_gain.slx')!.click();
    await until(() => tabNames().includes('shared_gain.slx'));
    await until(() => !params().classList.contains('active') && rowNamed('shared_gain.slx')!.classList.contains('active'));
    expect(params().classList.contains('open')).toBe(true);
    // Closed: no mark.
    page.command('close-tab');
    await until(() => !tabNames().includes('shared_gain.slx'));
    await until(() => !rowNamed('shared_gain.slx')!.classList.contains('open'));
    // The Explorer's Root: no tab active, no row marked active.
    page.command('show-graph');
    await until(() => !rows().some((r) => r.classList.contains('active')));
    expect(params().classList.contains('open')).toBe(true);
  });

  it("reveal the active tab's row when a tab is activated, in a folder not yet opened", async () => {
    const work = workFolder();
    const page = folderPage(work);
    await until(() => drawn().length > 1);
    void page.handle.openPaths([path.join(work, 'data', 'params.sldd')]);
    await until(() => tabNames().includes('params.sldd'));
    await until(() => !!rowNamed('params.sldd') && rowNamed('params.sldd')!.getAttribute('aria-selected') === 'true');
    expect(rowNamed('data')!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('a re-root', () => {
  it('moves Used By and the graph to the new workspace folder', async () => {
    const work = workFolder();
    const page = folderPage(path.join(work, 'data'));
    const dict = path.join(work, 'data', 'params.sldd');
    void page.handle.openPaths([dict]);
    const usedBy = (name: string) => {
      const table = document.querySelector<HTMLElement & { rows: { Name?: { label: string }; UsedBy?: { blockLinks?: { blockName: string }[] } }[] }>(
        `.doc-panel[data-path="${CSS.escape(dict)}"] dex-tree-table`,
      );
      return (table?.rows.find((r) => r.Name?.label === name)?.UsedBy?.blockLinks ?? []).map((b) => b.blockName);
    };
    await until(() => tabNames().length === 1 && segmentLabels().length === 3);
    await settled(100);
    expect(usedBy('Kp')).toEqual([]);
    send('dex-folder-up');
    await until(() => usedBy('Kp').includes('PlantGain'), 5000);
    // The graph, at Root: the new folder's models are boxes of it.
    page.command('show-graph');
    const boxes = () => (document.querySelector<HTMLElement & { graph?: { boxes: { label: string }[] } }>('dex-relationship-graph')?.graph?.boxes ?? []).map((b) => b.label);
    await until(() => boxes().includes('shared_gain.slx') && boxes().includes('shadow_ws.slx'), 5000);
  });
});

describe('the path, as segments', () => {
  it("labels each folder by its name, the top of a path by itself", () => {
    expect(['/', '/work/plant', '/work/plant/', 'C:\\', 'C:\\work\\Data', 'C:', '\\\\server\\share', 'complex_dataflow'].map(folderLabel)).toEqual([
      '/',
      'plant',
      'plant',
      'C:',
      'Data',
      'C:',
      'share',
      'complex_dataflow',
    ]);
  });

  it('walks the host up from the folder to the top, outermost first, at most 64 folders', () => {
    const parent = (p: string) => (p === '/' ? null : path.posix.dirname(p));
    expect(segmentsOf('/work/plant', parent)).toEqual([
      { label: '/', path: '/' },
      { label: 'work', path: '/work' },
      { label: 'plant', path: '/work/plant' },
    ]);
    expect(segmentsOf('/work/plant', undefined)).toEqual([{ label: 'plant', path: '/work/plant' }]);
    // A host whose parents never end, or come back to the folder itself: cut short.
    let n = 0;
    expect(segmentsOf('/x', () => `/up${++n}`)).toHaveLength(65);
    expect(segmentsOf('/x', (p) => p)).toEqual([{ label: 'x', path: '/x' }]);
  });
});
