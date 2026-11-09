// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-explorer>: the shell's list of open files, as the prototype's Workspace tree draws it
// (Root, then each kind of file under a heading of its own, each file with its sections under a
// twisty), and the requests it sends. It decides nothing: which file a row is, what opening one
// means and which row is current are the app's, so what is pinned here is what it draws for the
// files and the selection it is given, and what each click, double-click, right-click and key
// asks for. Over hand-made files, so each case shows the rows it is about.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DexExplorer,
  defineExplorer,
  type ExplorerFile,
  type ExplorerMenuDetail,
  type ExplorerOpenDetail,
} from '../src/widgets/app-shell/dex-explorer.js';

beforeAll(() => defineExplorer());
afterEach(() => document.body.replaceChildren());

// A dictionary with its four sections, as the prototype shows one, and one file of each other kind.
const DD: ExplorerFile = {
  id: 'file:///w/dd.sldd',
  label: 'dd.sldd',
  icon: 'simulink_database',
  group: 'sldd',
  title: '/w/dd.sldd',
  sections: [
    { id: 'design', label: 'Design Data', icon: 'databaseFolderDesign' },
    { id: 'arch', label: 'Architectural Data', icon: 'databaseFolderArchitecture' },
    { id: 'configs', label: 'Configurations', icon: 'databaseFolderConfiguration' },
    { id: 'other', label: 'Other Data', icon: 'folder' },
  ],
};
const BASE: ExplorerFile = { id: 'file:///w/base.sldd', label: 'base.sldd', group: 'sldd', sections: [{ id: 'design', label: 'Design Data' }] };
const MODEL: ExplorerFile = { id: 'file:///w/m.slx', label: 'm.slx', icon: 'simulink', group: 'model' };
const MAT: ExplorerFile = { id: 'file:///w/v.mat', label: 'v.mat', group: 'mat', sections: [] };
const PRJ: ExplorerFile = { id: 'file:///w/p.prj', label: 'p.prj', group: 'project' };
const TXT: ExplorerFile = { id: 'file:///w/notes.json', label: 'notes.json', group: 'other' };

async function explorer(files: ExplorerFile[]): Promise<DexExplorer> {
  const el = document.createElement('dex-explorer');
  el.files = files;
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const cssOf = (styles: unknown): string =>
  [styles]
    .flat(Infinity)
    .map((sheet) => (sheet as { cssText: string }).cssText)
    .join('\n')
    .replace(/\s+/g, ' ');

async function settle(el: DexExplorer): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await el.updateComplete;
  }
}

const rows = (el: DexExplorer): HTMLElement[] => [...el.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
// A row's name, with its unsaved mark after it as the user reads it ("dd.sldd *").
const labelOf = (row: Element): string => {
  const mark = row.querySelector('.dirty');
  return row.querySelector('.label')!.textContent! + (mark ? ` ${mark.textContent}` : '');
};
const labels = (el: DexExplorer): string[] => rows(el).map(labelOf);
const rowOf = (el: DexExplorer, label: string): HTMLElement => rows(el).find((r) => labelOf(r) === label)!;
// Everything drawn, in order: a heading as `[heading]`, a row as its label.
const drawn = (el: DexExplorer): string[] =>
  [...el.shadowRoot!.querySelectorAll('.heading, [role="treeitem"]')].map((r) =>
    r.classList.contains('heading') ? `[${labelOf(r)}]` : labelOf(r),
  );
const twisty = (row: HTMLElement): HTMLElement => row.querySelector<HTMLElement>('.twisty')!;
const focused = (el: DexExplorer): string => {
  const active = el.shadowRoot!.activeElement;
  return active ? labelOf(active) : '';
};
const press = (el: DexExplorer, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  (el.shadowRoot!.activeElement ?? rows(el)[0]!).dispatchEvent(event);
  return event;
};

// The requests, as the document hears them: they bubble out of the element to the app. Each
// test's listeners are taken off after it.
const unlisten: (() => void)[] = [];
afterEach(() => unlisten.splice(0).forEach((off) => off()));

function heard(): { open: ExplorerOpenDetail[]; menu: ExplorerMenuDetail[] } {
  const out = { open: [] as ExplorerOpenDetail[], menu: [] as ExplorerMenuDetail[] };
  const onOpen = (e: CustomEvent<ExplorerOpenDetail>) => out.open.push(e.detail);
  const onMenu = (e: CustomEvent<ExplorerMenuDetail>) => out.menu.push(e.detail);
  document.addEventListener('dex-explorer-open', onOpen);
  document.addEventListener('dex-explorer-menu', onMenu);
  unlisten.push(
    () => document.removeEventListener('dex-explorer-open', onOpen),
    () => document.removeEventListener('dex-explorer-menu', onMenu),
  );
  return out;
}

describe('the rows', () => {
  it('draws Root, then each kind of file under its heading, in a fixed order, and no heading for a kind with none', async () => {
    const el = await explorer([MAT, DD, MODEL, BASE]);
    expect(drawn(el)).toEqual(['Root', '[Simulink Models]', 'm.slx', '[Data Dictionaries]', 'dd.sldd', 'base.sldd', '[MAT-Files]', 'v.mat']);
    el.files = [TXT, PRJ, MAT, DD, MODEL];
    await el.updateComplete;
    expect(drawn(el)).toEqual([
      'Root',
      '[Simulink Models]',
      'm.slx',
      '[Data Dictionaries]',
      'dd.sldd',
      '[MAT-Files]',
      'v.mat',
      '[Projects]',
      'p.prj',
      '[Other]',
      'notes.json',
    ]);
    el.files = [];
    await el.updateComplete;
    expect(drawn(el)).toEqual(['Root']);
  });

  it('lists a file of a kind it does not know under Other, rather than dropping it', async () => {
    // From an app that is not type-checked: the file is still open, and still has to be reachable.
    const el = await explorer([{ ...TXT, group: 'zip' as ExplorerFile['group'] }, MODEL]);
    expect(drawn(el)).toEqual(['Root', '[Simulink Models]', 'm.slx', '[Other]', 'notes.json']);
  });

  it('draws a tree a screen reader walks: the headings name groups and are no rows of their own', async () => {
    const el = await explorer([DD, MODEL]);
    expect(el.shadowRoot!.querySelector('[role="tree"]')!.getAttribute('aria-label')).toBe('Open files');
    expect(labels(el)).toEqual(['Root', 'm.slx', 'dd.sldd']);
    const groups = [...el.shadowRoot!.querySelectorAll('[role="group"]')];
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Simulink Models', 'Data Dictionaries']);
    expect([...groups[1]!.querySelectorAll('[role="treeitem"]')].map(labelOf)).toEqual(['dd.sldd']);
    for (const heading of el.shadowRoot!.querySelectorAll('.heading')) expect(heading.getAttribute('aria-hidden')).toBe('true');
    const root = rowOf(el, 'Root');
    expect(root.getAttribute('aria-level')).toBe('1');
    expect(root.querySelector('dex-icon')!.iconId).toBe('simulink_folder');
    const dd = rowOf(el, 'dd.sldd');
    expect(dd.getAttribute('aria-level')).toBe('1');
    expect(dd.getAttribute('aria-selected')).toBe('false');
    expect(dd.querySelector('dex-icon')!.iconId).toBe('simulink_database');
    expect(dd.title).toBe('/w/dd.sldd');
  });

  it('names Root as rootLabel says, the root-label attribute', async () => {
    const el = document.createElement('dex-explorer');
    el.setAttribute('root-label', 'Workspace');
    document.body.append(el);
    await el.updateComplete;
    expect(el.rootLabel).toBe('Workspace');
    expect(labels(el)).toEqual(['Workspace']);
  });

  it('marks a file with unsaved changes, as the prototype shows "dd.sldd *", and says so to a screen reader', async () => {
    const el = await explorer([{ ...DD, dirty: true }, MODEL]);
    expect(labels(el)).toEqual(['Root', 'm.slx', 'dd.sldd *']);
    const dd = rowOf(el, 'dd.sldd *');
    // The mark is a part of its own after the name, not in it: a name too long for the sidebar
    // is cut short with an ellipsis, and the mark is still drawn after it.
    const name = dd.querySelector('.label')!;
    expect(name.textContent).toBe('dd.sldd');
    const mark = name.nextElementSibling!;
    expect(mark.classList.contains('dirty')).toBe(true);
    expect(mark.textContent).toBe('*');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(cssOf(DexExplorer.styles)).toContain('.dirty { flex-shrink: 0; }');
    expect(dd.querySelector('.sr-only')!.textContent).toBe('(unsaved changes)');
    expect(rowOf(el, 'm.slx').querySelector('.dirty, .sr-only')).toBeNull();
  });

  it('lines a heading up with the icons of the files under it, as the prototype does', async () => {
    // Laid out as a row is: the same zero-width indent and empty twisty before the words, each
    // taking the same gap, so the words start where a file's icon does.
    const el = await explorer([DD]);
    const heading = el.shadowRoot!.querySelector('.heading')!;
    const row = rowOf(el, 'dd.sldd');
    const lead = (e: Element): string[] => [...e.children].slice(0, 2).map((c) => c.className.trim());
    expect(lead(heading)).toEqual(['indent', 'twisty empty']);
    expect(lead(row)).toEqual(['indent', 'twisty']);
    expect(row.querySelector<HTMLElement>('.indent')!.style.width).toBe('0px');
  });

  it('gives a twisty only to a file with sections', async () => {
    const el = await explorer([DD, MODEL, MAT]);
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('false');
    expect(twisty(rowOf(el, 'dd.sldd')).classList.contains('empty')).toBe(false);
    // No sections, or an empty list of them: nothing to open.
    for (const label of ['Root', 'm.slx', 'v.mat']) {
      expect(rowOf(el, label).hasAttribute('aria-expanded'), label).toBe(false);
      expect(twisty(rowOf(el, label)).classList.contains('empty'), label).toBe(true);
    }
  });

  it('opens a file onto its sections, a level deeper and indented, with the twisty, and sends nothing', async () => {
    const el = await explorer([DD, MAT]);
    const sent = heard();
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    expect(drawn(el)).toEqual([
      'Root',
      '[Data Dictionaries]',
      'dd.sldd',
      'Design Data',
      'Architectural Data',
      'Configurations',
      'Other Data',
      '[MAT-Files]',
      'v.mat',
    ]);
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('true');
    const design = rowOf(el, 'Design Data');
    expect(design.getAttribute('aria-level')).toBe('2');
    expect(design.getAttribute('aria-posinset')).toBe('1');
    expect(design.getAttribute('aria-setsize')).toBe('4');
    expect(design.querySelector('dex-icon')!.iconId).toBe('databaseFolderDesign');
    expect(design.querySelector<HTMLElement>('.indent')!.style.width).toBe('16px');
    expect(rowOf(el, 'dd.sldd').querySelector<HTMLElement>('.indent')!.style.width).toBe('0px');
    // The sections are in the file's group, after it.
    const group = el.shadowRoot!.querySelector('[role="group"][aria-label="Data Dictionaries"]')!;
    expect([...group.querySelectorAll('[role="treeitem"]')].map(labelOf)).toEqual([
      'dd.sldd',
      'Design Data',
      'Architectural Data',
      'Configurations',
      'Other Data',
    ]);
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'v.mat']);
    // A double-click on the twisty is two clicks, so two toggles, then the dblclick: it ends
    // closed, as it began, and asks for nothing.
    for (const type of ['click', 'click', 'dblclick']) {
      twisty(rowOf(el, 'dd.sldd')).dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
      await el.updateComplete;
    }
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'v.mat']);
    expect(sent).toEqual({ open: [], menu: [] });
  });
});

describe('what a click asks for', () => {
  it('a click on a file, a section or Root asks to open it, unpinned', async () => {
    const el = await explorer([DD]);
    const sent = heard();
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    rowOf(el, 'dd.sldd').click();
    rowOf(el, 'Configurations').click();
    rowOf(el, 'Root').click();
    expect(sent.open).toEqual([
      { fileId: DD.id, pin: false },
      { fileId: DD.id, sectionId: 'configs', pin: false },
      { fileId: null, pin: false },
    ]);
    // A file's own request names no section, and Root's no file.
    expect(Object.keys(sent.open[0]!)).toEqual(['fileId', 'pin']);
    expect(Object.keys(sent.open[2]!)).toEqual(['fileId', 'pin']);
  });

  it('a click opens or closes nothing, and selects nothing: what is selected is the app\'s to say', async () => {
    const el = await explorer([DD]);
    rowOf(el, 'dd.sldd').click();
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd']);
    expect(el.selected).toBeNull();
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-selected')).toBe('false');
  });

  it('a double-click asks to open it pinned', async () => {
    const el = await explorer([DD]);
    const sent = heard();
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    for (const label of ['dd.sldd', 'Other Data', 'Root']) {
      rowOf(el, label).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    }
    expect(sent.open).toEqual([
      { fileId: DD.id, pin: true },
      { fileId: DD.id, sectionId: 'other', pin: true },
      { fileId: null, pin: true },
    ]);
  });

  it('a double-click as the browser sends it, two clicks then the dblclick, asks twice unpinned, then pinned', async () => {
    const el = await explorer([DD]);
    const sent = heard();
    for (const type of ['click', 'click', 'dblclick']) {
      rowOf(el, 'dd.sldd').dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
    }
    expect(sent.open.map((d) => [d.fileId, d.pin])).toEqual([
      [DD.id, false],
      [DD.id, false],
      [DD.id, true],
    ]);
  });

  it("a right-click on a file asks for the file's menu where the pointer is, in place of the browser's", async () => {
    const el = await explorer([DD, MODEL]);
    const sent = heard();
    const click = new MouseEvent('contextmenu', { clientX: 40, clientY: 60, bubbles: true, composed: true, cancelable: true });
    rowOf(el, 'm.slx').dispatchEvent(click);
    expect(sent.menu).toEqual([{ fileId: MODEL.id, x: 40, y: 60 }]);
    expect(click.defaultPrevented).toBe(true);
    // Root and a section are no file: no menu of the explorer's, and the page's own is left alone.
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    for (const label of ['Root', 'Design Data']) {
      const other = new MouseEvent('contextmenu', { clientX: 1, clientY: 2, bubbles: true, composed: true, cancelable: true });
      rowOf(el, label).dispatchEvent(other);
      expect(other.defaultPrevented, label).toBe(false);
    }
    expect(sent.menu).toHaveLength(1);
    expect(sent.open).toEqual([]);
  });
});

describe('the keyboard', () => {
  it('walks the rows past the headings, opens and enters a file with Right, leaves and closes it with Left', async () => {
    const el = await explorer([DD, MAT]);
    rowOf(el, 'Root').focus();
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused(el)).toBe('dd.sldd');
    press(el, 'ArrowRight');
    await settle(el);
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'Design Data', 'Architectural Data', 'Configurations', 'Other Data', 'v.mat']);
    expect(focused(el)).toBe('dd.sldd');
    press(el, 'ArrowRight');
    await settle(el);
    expect(focused(el)).toBe('Design Data');
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused(el)).toBe('Architectural Data');
    // Left from a section goes to its file; on the open file, closes it.
    press(el, 'ArrowLeft');
    await settle(el);
    expect(focused(el)).toBe('dd.sldd');
    expect(labels(el)).toHaveLength(7);
    press(el, 'ArrowLeft');
    await settle(el);
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'v.mat']);
    expect(focused(el)).toBe('dd.sldd');
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused(el)).toBe('v.mat');
    // Right on a file with nothing to open, and Down past the last row, stay put.
    press(el, 'ArrowRight');
    press(el, 'ArrowDown');
    await settle(el);
    expect(focused(el)).toBe('v.mat');
    press(el, 'ArrowUp');
    await settle(el);
    expect(focused(el)).toBe('dd.sldd');
    press(el, 'Home');
    await settle(el);
    expect(focused(el)).toBe('Root');
    press(el, 'End');
    await settle(el);
    expect(focused(el)).toBe('v.mat');
  });

  it('asks to open the row it is on, pinned, with Enter', async () => {
    const el = await explorer([DD]);
    const sent = heard();
    rowOf(el, 'Root').focus();
    press(el, 'Enter');
    press(el, 'ArrowDown');
    await settle(el);
    press(el, 'ArrowRight');
    await settle(el);
    press(el, 'ArrowRight');
    await settle(el);
    press(el, 'ArrowDown');
    await settle(el);
    press(el, 'Enter');
    expect(sent.open).toEqual([
      { fileId: null, pin: true },
      { fileId: DD.id, sectionId: 'arch', pin: true },
    ]);
  });

  it('takes the keys it uses, and leaves a chord with a modifier to the app', async () => {
    const el = await explorer([DD]);
    rowOf(el, 'Root').focus();
    expect(press(el, 'ArrowDown').defaultPrevented).toBe(true);
    await settle(el);
    const chord = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, composed: true, cancelable: true });
    el.shadowRoot!.activeElement!.dispatchEvent(chord);
    await settle(el);
    expect(chord.defaultPrevented).toBe(false);
    expect(focused(el)).toBe('dd.sldd');
    expect(press(el, 'a').defaultPrevented).toBe(false);
  });

  it('moves the focus when asked, and never later: a key that stays put takes no focus back afterwards', async () => {
    const el = await explorer([DD]);
    const outside = document.createElement('button');
    document.body.append(outside);
    rowOf(el, 'Root').focus();
    await settle(el);
    // Home on the first row: nowhere to go. Then the user leaves for another part of the page,
    // and the app redraws the explorer (a file got its unsaved mark).
    press(el, 'Home');
    await settle(el);
    outside.focus();
    el.files = [{ ...DD, dirty: true }];
    await settle(el);
    expect(document.activeElement).toBe(outside);
  });

  it('keeps one row in the Tab order: the one the keyboard is on, else the selected one, else Root', async () => {
    const el = await explorer([DD, MAT]);
    const tabOrder = (): string[] => rows(el).map((r) => r.getAttribute('tabindex')!);
    expect(tabOrder()).toEqual(['0', '-1', '-1']);
    el.selected = { fileId: MAT.id };
    await el.updateComplete;
    expect(tabOrder()).toEqual(['-1', '-1', '0']);
    rowOf(el, 'dd.sldd').focus();
    await el.updateComplete;
    expect(tabOrder()).toEqual(['-1', '0', '-1']);
  });
});

describe('selected', () => {
  it('highlights the row the app names, a file, a section or Root, and sends nothing', async () => {
    const el = await explorer([DD, MODEL]);
    const sent = heard();
    const chosen = (): string[] => rows(el).filter((r) => r.getAttribute('aria-selected') === 'true').map(labelOf);
    expect(chosen()).toEqual([]);
    el.selected = { fileId: null };
    await el.updateComplete;
    expect(chosen()).toEqual(['Root']);
    el.selected = { fileId: DD.id };
    await el.updateComplete;
    expect(chosen()).toEqual(['dd.sldd']);
    twisty(rowOf(el, 'dd.sldd')).click();
    el.selected = { fileId: DD.id, sectionId: 'configs' };
    await el.updateComplete;
    // The section, and not its file.
    expect(chosen()).toEqual(['Configurations']);
    el.selected = { fileId: MODEL.id, sectionId: 'configs' };
    await el.updateComplete;
    expect(chosen()).toEqual([]);
    el.selected = null;
    await el.updateComplete;
    expect(chosen()).toEqual([]);
    expect(sent).toEqual({ open: [], menu: [] });
  });

  it('opens the closed file of a section it names, so the highlighted row is seen, and sends nothing', async () => {
    const el = await explorer([DD, BASE]);
    const sent = heard();
    el.selected = { fileId: DD.id, sectionId: 'arch' };
    await el.updateComplete;
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('true');
    expect(rowOf(el, 'Architectural Data').getAttribute('aria-selected')).toBe('true');
    // Only that file.
    expect(rowOf(el, 'base.sldd').getAttribute('aria-expanded')).toBe('false');
    expect(sent).toEqual({ open: [], menu: [] });
  });

  it('opens it when given with the files, before the first draw', async () => {
    const el = document.createElement('dex-explorer');
    el.files = [DD];
    el.selected = { fileId: DD.id, sectionId: 'other' };
    document.body.append(el);
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'Design Data', 'Architectural Data', 'Configurations', 'Other Data']);
  });

  it('leaves closed a file the user closes, until the selection moves to one of its sections again', async () => {
    const el = await explorer([DD]);
    el.selected = { fileId: DD.id, sectionId: 'design' };
    await el.updateComplete;
    twisty(rowOf(el, 'dd.sldd')).click();
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd']);
    // The same place again, as a new object (an app that sets selected on every redraw): still closed.
    el.selected = { fileId: DD.id, sectionId: 'design' };
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd']);
    el.files = [{ ...DD, dirty: true }];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd *']);
    // Another of its sections: open again.
    el.selected = { fileId: DD.id, sectionId: 'configs' };
    await el.updateComplete;
    expect(rowOf(el, 'dd.sldd *').getAttribute('aria-expanded')).toBe('true');
    expect(rowOf(el, 'Configurations').getAttribute('aria-selected')).toBe('true');
  });

  it('opens nothing for the file itself, Root, a section the file does not list, or a file not there', async () => {
    const el = await explorer([DD, MAT]);
    for (const selected of [
      { fileId: DD.id },
      { fileId: null },
      { fileId: DD.id, sectionId: 'gone' },
      { fileId: MAT.id, sectionId: 'design' },
      { fileId: 'file:///w/closed.sldd', sectionId: 'design' },
    ]) {
      el.selected = selected;
      await el.updateComplete;
      expect(labels(el), JSON.stringify(selected)).toEqual(['Root', 'dd.sldd', 'v.mat']);
    }
  });

  it('opens the file once its sections arrive, when they come after the selection named one', async () => {
    // How an app lists a file it has just opened: at first with no sections, which it reads
    // after the file's table is drawn; the selection already names the section the user went to.
    const el = await explorer([{ ...DD, sections: [] }]);
    el.selected = { fileId: DD.id, sectionId: 'arch' };
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd']);
    el.files = [DD];
    await el.updateComplete;
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('true');
    expect(rowOf(el, 'Architectural Data').getAttribute('aria-selected')).toBe('true');
    // Done once: closed by the user now, it stays closed through new files.
    twisty(rowOf(el, 'dd.sldd')).click();
    el.files = [{ ...DD, dirty: true }];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd *']);
  });

  it('gives up a wait for sections once the selection moves on', async () => {
    const el = await explorer([{ ...DD, sections: [] }]);
    el.selected = { fileId: DD.id, sectionId: 'arch' };
    await el.updateComplete;
    el.selected = { fileId: null };
    await el.updateComplete;
    el.files = [DD];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd']);
  });

  describe('scrolls the row it moves to into view', () => {
    let scrolled: { key: string; options: unknown }[] = [];
    const spy = (): void => {
      scrolled = [];
      const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement, options) {
        scrolled.push({ key: this.dataset.key ?? '', options });
      });
      unlisten.push(() => scroll.mockRestore());
    };
    const key = (el: DexExplorer, label: string): string => rowOf(el, label).dataset.key!;

    it('once, the nearest way, when the row is drawn: at once, or when its sections arrive', async () => {
      spy();
      const el = await explorer([DD, { ...BASE, sections: [] }, MAT]);
      el.selected = { fileId: DD.id, sectionId: 'other' };
      await el.updateComplete;
      expect(scrolled).toEqual([{ key: key(el, 'Other Data'), options: { block: 'nearest' } }]);
      // The same place again scrolls nothing: the user may have scrolled away since.
      el.selected = { fileId: DD.id, sectionId: 'other' };
      el.files = [DD, { ...BASE, sections: [] }, MAT];
      await el.updateComplete;
      expect(scrolled).toHaveLength(1);
      // A file's row, or Root's, as well as a section's.
      el.selected = { fileId: MAT.id };
      await el.updateComplete;
      expect(scrolled.at(-1)!.key).toBe(key(el, 'v.mat'));
      el.selected = { fileId: BASE.id, sectionId: 'design' };
      await el.updateComplete;
      expect(scrolled).toHaveLength(2);
      el.files = [DD, BASE, MAT];
      await el.updateComplete;
      // BASE's Design Data, the last of the two.
      expect(scrolled.at(-1)!.key).toBe(rows(el).filter((r) => labelOf(r) === 'Design Data').at(-1)!.dataset.key);
      expect(scrolled).toHaveLength(3);
    });

    it('not after the user has chosen a row meanwhile', async () => {
      spy();
      const el = await explorer([{ ...DD, sections: [] }, MAT]);
      el.selected = { fileId: DD.id, sectionId: 'arch' };
      await el.updateComplete;
      rowOf(el, 'v.mat').click();
      el.files = [DD, MAT];
      await el.updateComplete;
      // The file still opens, so the row the app named is there to see; the view stays put.
      expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('true');
      expect(scrolled).toEqual([]);
    });
  });
});

describe('files that come and go', () => {
  it('keeps a file open across new files, and forgets it once it is gone: back again, it is closed', async () => {
    const el = await explorer([DD, BASE, MAT]);
    twisty(rowOf(el, 'dd.sldd')).click();
    twisty(rowOf(el, 'base.sldd')).click();
    await el.updateComplete;
    expect(labels(el)).toHaveLength(9);
    // New objects for the same files: the same rows, still open.
    el.files = [{ ...DD, dirty: true }, { ...BASE }, MAT];
    await el.updateComplete;
    expect(labels(el)).toEqual([
      'Root',
      'dd.sldd *',
      'Design Data',
      'Architectural Data',
      'Configurations',
      'Other Data',
      'base.sldd',
      'Design Data',
      'v.mat',
    ]);
    el.files = [BASE, MAT];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'base.sldd', 'Design Data', 'v.mat']);
    el.files = [DD, BASE, MAT];
    await el.updateComplete;
    expect(labels(el)).toEqual(['Root', 'dd.sldd', 'base.sldd', 'Design Data', 'v.mat']);
    expect(rowOf(el, 'dd.sldd').getAttribute('aria-expanded')).toBe('false');
  });

  it('moves the focus off a row that goes: to the next row still there, else the one before, else Root', async () => {
    const el = await explorer([DD, BASE, MAT]);
    rowOf(el, 'base.sldd').focus();
    await settle(el);
    el.files = [DD, MAT];
    await settle(el);
    expect(focused(el)).toBe('v.mat');
    // The last row: nothing after it, so the one before.
    el.files = [DD];
    await settle(el);
    expect(focused(el)).toBe('dd.sldd');
    // A section that goes, as its file is read again.
    twisty(rowOf(el, 'dd.sldd')).click();
    await settle(el);
    rowOf(el, 'Configurations').focus();
    await settle(el);
    el.files = [{ ...DD, sections: DD.sections!.slice(0, 2) }];
    await settle(el);
    expect(focused(el)).toBe('Architectural Data');
    el.files = [];
    await settle(el);
    expect(focused(el)).toBe('Root');
    expect(rowOf(el, 'Root').tabIndex).toBe(0);
  });

  it('takes no focus when a row goes while the focus is elsewhere', async () => {
    const el = await explorer([DD, BASE]);
    const outside = document.createElement('button');
    document.body.append(outside);
    rowOf(el, 'base.sldd').focus();
    await settle(el);
    outside.focus();
    el.files = [DD];
    await settle(el);
    expect(document.activeElement).toBe(outside);
  });
});
