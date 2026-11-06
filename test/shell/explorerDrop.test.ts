// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Table rows dragged onto the Explorer, as the prototype's Workspace tree takes them: onto an open
// file's row, or one of its sections', whichever tab is on screen. What must hold:
//  - the row under the pointer says whether the drop is taken (an outline, and the table's own words
//    for it as its tooltip), as the target table's own rows would say it: the same prediction;
//  - a drop is a move by default and a copy with Ctrl (Option on macOS), as in a table, and is the
//    drop a table's row sends, into the target's own document: one edit there, undone by its Undo,
//    and for a move one edit of the document it came from, undone by that one's;
//  - a file's row lands in a section: the one the entries came from, else the first that takes them
//    (a MAT-file, which is one target, in itself);
//  - the shell says what it did, as it says an edit ("Entry moved to …"), and nothing for a drop
//    refused or one that does nothing (onto the section it came from);
//  - rows of a document that may not be edited are copied, never moved; a document that may not be
//    edited takes no drop, and a section that takes no entry refuses one, saying why.
//
// happy-dom has no drag pipeline, so each drag is the events a browser sends (dragstart on the
// table's row, dragover and drop on the Explorer's, dragend on the row again), each with a stub
// DataTransfer: what is tested is everything above the browser, the documents' edits included.
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import {
  choose,
  dirtyTabs,
  explorer,
  explorerRowOf,
  menuOn,
  open,
  rowOf,
  selectTab,
  settled,
  startPage,
  tableOf,
  toastTexts,
  until,
} from './harness.js';

const FILES = {
  'params.sldd': 'params.sldd',
  'rt_bin.sldd': 'rt_bin.sldd',
  'ParamMat.mat': 'ParamMat.mat',
  'viewing_only.mat': 'viewing_only.mat',
  'shadow_ws.slx': 'shadow_ws.slx',
  'acs_ref.slx': 'acs_ref.slx',
};

function stubTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    get types() {
      return [...store.keys()];
    },
    setData: (t: string, v: string) => void store.set(t, v),
    getData: (t: string) => store.get(t) ?? '',
    setDragImage: () => {},
  };
}
type Transfer = ReturnType<typeof stubTransfer>;

/** One drag event, as a browser sends it, carrying `transfer`. */
function fire(target: EventTarget, type: string, transfer: Transfer, keys: { ctrlKey?: boolean; altKey?: boolean } = {}): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(ev, { dataTransfer: transfer, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, clientX: 20, clientY: 20, relatedTarget: null }, keys);
  target.dispatchEvent(ev);
  return ev;
}

/** The `<tr>` the table of `file` draws for `row`. */
function trOf(file: string, row: TreeTableRow): HTMLElement {
  const tr = [...(tableOf(file)!.shadowRoot!.querySelectorAll<HTMLElement>('tr.data-row'))].find((el) => el.dataset.rowId === row.ID);
  if (!tr) throw new Error(`${file} draws no row ${row.Name.label}`);
  return tr;
}

/** A drag of `row` of the table of `file`, started as the browser starts one. */
async function startDrag(file: string, row: string) {
  const r = await rowOf(file, row);
  await tableOf(file)!.updateComplete;
  const transfer = stubTransfer();
  // The row the drag started on, which the browser sends the dragend to, whatever became of it.
  const from = trOf(file, r);
  const start = fire(from, 'dragstart', transfer);
  return {
    transfer,
    start,
    /** Over the Explorer's row `at`, with `keys` held: the dragover, and what the row then shows. */
    async over(at: HTMLElement, keys: { ctrlKey?: boolean; altKey?: boolean } = {}) {
      const ev = fire(at, 'dragover', transfer, keys);
      await explorer().updateComplete;
      return { taken: ev.defaultPrevented, effect: transfer.dropEffect, cue: cueOf(at), title: at.title };
    },
    /** Let go over `at`, and the drag's end at the row it started on, as the browser follows a drop. */
    async drop(at: HTMLElement) {
      fire(at, 'drop', transfer);
      fire(from, 'dragend', transfer);
      await explorer().updateComplete;
    },
  };
}

const cueOf = (row: HTMLElement) => (row.classList.contains('drop-allowed') ? 'allowed' : row.classList.contains('drop-refused') ? 'refused' : '');

/** The Explorer's row of section `label` of the file `file`, its file opened in the tree first. */
async function sectionRow(file: string, label: string): Promise<HTMLElement> {
  const fileRow = explorerRowOf(file)!;
  if (fileRow.getAttribute('aria-expanded') !== 'true') fileRow.querySelector<HTMLElement>('.twisty')!.click();
  await explorer().updateComplete;
  const rows = [...explorer().shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  const at = rows.indexOf(explorerRowOf(file)!);
  const found = rows.slice(at + 1).find((r) => r.getAttribute('aria-level') === '2' && r.querySelector('.label')?.textContent === label);
  if (!found) throw new Error(`${file} lists no section ${label}`);
  return found;
}

const names = (file: string) => (tableOf(file)?.rows ?? []).map((r) => r.Name?.label);
const holds = (file: string, row: string) => names(file).includes(row);

describe('a move onto a file', () => {
  it("moves a dictionary's entry into a MAT-file: it leaves the dictionary, and the shell says so", async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const shown = await drag.over(explorerRowOf('ParamMat.mat')!);
    expect(shown).toMatchObject({ taken: true, effect: 'move', cue: 'allowed' });
    expect(shown.title).toMatch(/^Move /);
    await drag.drop(explorerRowOf('ParamMat.mat')!);
    await until(() => holds('ParamMat.mat', 'Kp') && !holds('params.sldd', 'Kp'));
    await until(() => toastTexts().includes('Entry moved to ParamMat.mat'));
    await until(() => dirtyTabs().length === 2);
    // The cue went with the drop.
    expect(cueOf(explorerRowOf('ParamMat.mat')!)).toBe('');
  });

  it('is undone where each half was made: the dictionary gets its entry back, and the MAT-file lets it go', async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    await drag.over(explorerRowOf('ParamMat.mat')!);
    await drag.drop(explorerRowOf('ParamMat.mat')!);
    await until(() => holds('ParamMat.mat', 'Kp') && !holds('params.sldd', 'Kp'));
    page.command('undo');
    await until(() => holds('params.sldd', 'Kp'));
    expect(holds('ParamMat.mat', 'Kp')).toBe(true);
    await selectTab('ParamMat.mat');
    page.command('undo');
    await until(() => !holds('ParamMat.mat', 'Kp'));
    await until(() => dirtyTabs().length === 0);
  });

  it('copies with Ctrl held, as a drag in a table does, the original staying', async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const shown = await drag.over(explorerRowOf('ParamMat.mat')!, { ctrlKey: true });
    expect(shown).toMatchObject({ taken: true, effect: 'copy', cue: 'allowed' });
    expect(shown.title).toMatch(/^Copy /);
    await drag.drop(explorerRowOf('ParamMat.mat')!);
    await until(() => holds('ParamMat.mat', 'Kp'));
    await until(() => toastTexts().includes('Entry copied to ParamMat.mat'));
    expect(holds('params.sldd', 'Kp')).toBe(true);
    expect(dirtyTabs()).toEqual(['ParamMat.mat']);
  });

  it('moves every entry of the selection the dragged row is in, and counts them', async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    const kp = await rowOf('params.sldd', 'Kp');
    const ki = await rowOf('params.sldd', 'Ki');
    tableOf('params.sldd')!.selectedRowIds = [kp.ID, ki.ID];
    const drag = await startDrag('params.sldd', 'Kp');
    expect((await drag.over(explorerRowOf('ParamMat.mat')!)).title).toBe('Move 2 items');
    await drag.drop(explorerRowOf('ParamMat.mat')!);
    await until(() => holds('ParamMat.mat', 'Kp') && holds('ParamMat.mat', 'Ki') && !holds('params.sldd', 'Ki'));
    await until(() => toastTexts().includes('2 entries moved to ParamMat.mat'));
  });

  it("lands a dictionary's own row in the section the entry came from, in a tab not on screen", async () => {
    const page = startPage(FILES);
    await open(page, 'rt_bin.sldd', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const shown = await drag.over(explorerRowOf('rt_bin.sldd')!);
    expect(shown).toMatchObject({ taken: true, cue: 'allowed' });
    expect(shown.title).toMatch(/ into Design Data$/);
    await drag.drop(explorerRowOf('rt_bin.sldd')!);
    await until(() => holds('rt_bin.sldd', 'Kp'));
    const kp = tableOf('rt_bin.sldd')!.rows.find((r) => r.Name.label === 'Kp')!;
    expect(kp.parent).toBe('section:design');
    await until(() => toastTexts().includes('Entry moved to Design Data in rt_bin.sldd'));
  });

  it("lands a model's row in its Model Workspace, the first of its sections that takes an entry", async () => {
    const page = startPage(FILES);
    await open(page, 'acs_ref.slx', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    expect((await drag.over(explorerRowOf('acs_ref.slx')!)).title).toMatch(/ into Model Workspace$/);
    await drag.drop(explorerRowOf('acs_ref.slx')!);
    await until(() => tableOf('acs_ref.slx')!.rows.some((r) => r.Name.label === 'Kp' && r.parent === 'section:workspace'));
    await until(() => toastTexts().includes('Entry moved to Model Workspace in acs_ref.slx'));
  });
});

describe('a drop onto a section', () => {
  it("lands there, as a drop on that section's heading in its table does", async () => {
    const page = startPage(FILES);
    await open(page, 'rt_bin.sldd', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const design = await sectionRow('rt_bin.sldd', 'Design Data');
    expect(await drag.over(design)).toMatchObject({ taken: true, cue: 'allowed' });
    await drag.drop(design);
    await until(() => holds('rt_bin.sldd', 'Kp'));
    await until(() => toastTexts().includes('Entry moved to Design Data in rt_bin.sldd'));
  });

  it("refuses what the section does not take, in the table's words, and drops nothing", async () => {
    const page = startPage(FILES);
    await open(page, 'rt_bin.sldd', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const configs = await sectionRow('rt_bin.sldd', 'Configurations');
    const shown = await drag.over(configs);
    expect(shown).toMatchObject({ taken: false, effect: 'none', cue: 'refused' });
    expect(shown.title).toMatch(/cannot be in Configurations$/);
    await drag.drop(configs);
    await settled(60);
    expect(holds('params.sldd', 'Kp')).toBe(true);
    expect(dirtyTabs()).toEqual([]);
    expect(toastTexts()).not.toContainEqual(expect.stringMatching(/moved|copied/));
  });

  it('refuses a section that takes no entry at all, saying so', async () => {
    const page = startPage(FILES);
    await open(page, 'acs_ref.slx', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    const shown = await drag.over(await sectionRow('acs_ref.slx', 'Model Elements'));
    expect(shown).toMatchObject({ taken: false, cue: 'refused', title: 'Nothing can be dropped in Model Elements' });
  });
});

describe('a move within one document, and one whose original cannot be taken out', () => {
  it("moves an entry into another section of the file it is in, as one edit its Undo takes back", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    expect(await drag.over(await sectionRow('params.sldd', 'Architectural Data'))).toMatchObject({ taken: true, cue: 'allowed' });
    await drag.drop(await sectionRow('params.sldd', 'Architectural Data'));
    const parentOfKp = () => tableOf('params.sldd')!.rows.filter((r) => r.Name.label === 'Kp').map((r) => r.parent);
    await until(() => parentOfKp().join() === 'section:arch');
    await until(() => toastTexts().includes('Entry moved to Architectural Data in params.sldd'));
    expect(dirtyTabs()).toEqual(['params.sldd']);
    page.command('undo');
    await until(() => parentOfKp().join() === 'section:design');
    await until(() => dirtyTabs().length === 0);
  });

  it('lands, and says once that the original could not be taken out, where it went from its file meanwhile', async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    // Deleted from its file while it is dragged: the move's delete there finds nothing to take out.
    expect((await menuOn('params.sldd', 'Kp')).find((i) => i.id === 'delete')?.disabled).toBeFalsy();
    choose('delete');
    await until(() => !holds('params.sldd', 'Kp'));
    expect(await drag.over(explorerRowOf('ParamMat.mat')!)).toMatchObject({ taken: true, cue: 'allowed' });
    await drag.drop(explorerRowOf('ParamMat.mat')!);
    await until(() => holds('ParamMat.mat', 'Kp'));
    await until(() => toastTexts().some((t) => t.includes('the original in params.sldd')));
    await settled(60);
    const said = toastTexts().filter((t) => t.includes('the original in params.sldd'));
    expect(said).toHaveLength(1);
    // Not said to have moved: what happened is the message's.
    expect(toastTexts()).not.toContain('Entry moved to ParamMat.mat');
  });
});

describe('a drop that does nothing, and one that is not taken', () => {
  it('onto the file it came from, or its own section, shows no cue and does nothing', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    expect(await drag.over(explorerRowOf('params.sldd')!)).toMatchObject({ taken: false, effect: 'none', cue: '' });
    const design = await sectionRow('params.sldd', 'Design Data');
    expect(await drag.over(design)).toMatchObject({ taken: false, cue: '' });
    await drag.drop(design);
    await settled(60);
    expect(holds('params.sldd', 'Kp')).toBe(true);
    expect(dirtyTabs()).toEqual([]);
  });

  it('a document that may not be edited takes none, and says so', async () => {
    const page = startPage(FILES);
    await open(page, 'viewing_only.mat', 'params.sldd');
    const drag = await startDrag('params.sldd', 'Kp');
    expect(await drag.over(explorerRowOf('viewing_only.mat')!)).toMatchObject({
      taken: false,
      cue: 'refused',
      title: 'viewing_only.mat is read-only',
    });
  });
});

describe('rows of a document that may not be edited', () => {
  it.each([
    ['shadow_ws.slx', 'Kp', 'rt_bin.sldd', 'Entry copied to Design Data in rt_bin.sldd'],
    ['viewing_only.mat', 'd_scalar', 'ParamMat.mat', 'Entry copied to ParamMat.mat'],
  ])('%s: %s is copied, with no key held, and stays where it was', async (file, row, to, said) => {
    const page = startPage(FILES);
    await open(page, to, file);
    const drag = await startDrag(file, row);
    // The drag allows a copy alone: no drop anywhere can take the entry out of its document.
    expect(drag.start.defaultPrevented).toBe(false);
    expect(drag.transfer.effectAllowed).toBe('copy');
    const shown = await drag.over(explorerRowOf(to)!);
    expect(shown).toMatchObject({ taken: true, effect: 'copy', cue: 'allowed' });
    expect(shown.title).toMatch(/^Copy /);
    await drag.drop(explorerRowOf(to)!);
    await until(() => holds(to, row));
    await until(() => toastTexts().includes(said));
    expect(holds(file, row)).toBe(true);
    expect(dirtyTabs()).toEqual([to]);
  });
});
