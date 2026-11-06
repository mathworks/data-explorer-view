// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectShell's internal parts on their own: the documents' area (the tab row's slot, the panels
// stacked under it, the welcome, whose buttons ask what the toolbar's Open and Folder ask), the
// folder (its title, its search box and results made with it, the tree it is given, its note) and
// the quiet note a side shows. connectShell fills them; the tests beside this one see them filled.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DexShellDocs, defineShellDocs } from '../../src/widgets/app-shell/connect/dex-shell-docs.js';
import { DexShellFolder, defineShellFolder } from '../../src/widgets/app-shell/connect/dex-shell-folder.js';
import { DexShellNote, defineShellNote } from '../../src/widgets/app-shell/connect/dex-shell-note.js';

beforeAll(() => {
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

  it('has its search box and results from the start, the box above the tree it is given, the results hidden', async () => {
    const folder = new DexShellFolder();
    expect(folder.searchInput).toBeInstanceOf(HTMLInputElement);
    expect(folder.searchResults.hidden).toBe(true);
    folder.append(document.createElement('div'));
    await mount(folder);
    const parts = [...folder.shadowRoot!.children].map((el) => el.localName + (el.className ? `.${el.className}` : ''));
    expect(parts.slice(0, 4)).toEqual(['header.title', 'input', 'ul.results', 'slot']);
    expect(folder.searchInput.getAttribute('aria-label')).toBe("Search the folder's names");
    expect(folder.searchInput.placeholder).toBe('Search names');
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
