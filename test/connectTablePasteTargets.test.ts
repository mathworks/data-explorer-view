// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Where a paste or a drop lands, as connectTable({editing}) resolves it and hands it to the menu,
// the chords and the drop predictor, over a host across a channel (messageSource), as the VS Code
// extension wires its table webview. menuItems.test.ts pins the menu builder given a target; these
// pin the target the editing half resolves from what the host sent (its rules, its clipboard with
// where a cut came from, this document's uri), and the message each gesture then sends:
//   - a section-less table (a MAT-file's) is ONE target: its host sends one rule, for section '',
//     which every row with no section above it, and no row at all, resolves to; a dictionary sends
//     none, and its empty space stays inert;
//   - a paste needs a selection in one section, a selected section header counting as its section;
//   - a cut pasted back into the section every item came from is the no-op a drop of it is.
// Ported from data-explorer-vscode test/wholeFileTargetWiring, pasteOneSectionWiring and
// cutBackNoopWiring at 632f6e0, which drove these through its table-main.ts. The editing trace
// (editingTrace.test.ts) plays the few cases these do not repeat.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type DexTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { messageSource, type TablePort } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

async function settle(table: DexTreeTable): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

let handles: TableHandle[] = [];
afterEach(() => {
  (document.querySelector('dex-context-menu') as any)?.close();
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

/**
 * A table wired as the extension wires its webview, to a host the test plays, painted with what
 * `paint` sends: then what it posts, a way to send it more, and its menu as it renders.
 */
async function hosted(paint: unknown[]) {
  const posted: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const port: TablePort = { postMessage: (m) => void posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
  const table = document.createElement('dex-tree-table') as DexTreeTable;
  document.body.append(table);
  handles.push(connectTable(table, messageSource(port), { editing: true }));
  const send = (m: unknown) => hear(m);
  for (const m of paint) send(m);
  await settle(table);
  posted.length = 0;
  const menu = () => document.querySelector('dex-context-menu') as any;
  /** The items of the menu a right-click on `rowId` opens, as they render: none if it opens none. */
  const openMenu = async (rowId: string | null): Promise<ShownItem[]> => {
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { rowId, x: 10, y: 10 } }));
    if (!menu()) return [];
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
    await menu().updateComplete;
    if (!menu().hasAttribute('open')) return [];
    return [...menu().shadowRoot.querySelectorAll('.item')].map((el: any) => ({
      label: el.querySelector('.item-label')?.textContent ?? '',
      disabled: el.getAttribute('aria-disabled') === 'true',
      // A disabled item's reason is its title.
      reason: el.getAttribute('title'),
    }));
  };
  /** Click the open menu's item, as the user does: a disabled one does nothing. */
  const click = (label: string) => {
    const item = [...menu().shadowRoot.querySelectorAll('.item')].find((el: any) => el.querySelector('.item-label')?.textContent === label);
    (item as HTMLElement).click();
  };
  const close = () => menu()?.close();
  /** Cmd/Ctrl+V with `selection` selected: whether the table took the key. */
  const pressPaste = async (selection: string[]): Promise<boolean> => {
    table.selectedRowIds = selection;
    await table.updateComplete;
    const e = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true, composed: true });
    table.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const pastes = () => posted.filter((m) => m.type === 'paste');
  return { table, posted, send, openMenu, click, close, pressPaste, pastes };
}

interface ShownItem {
  label: string;
  disabled: boolean;
  reason: string | null;
}
const pasteIn = (items: ShownItem[]) => items.find((i) => i.label === 'Paste');

/** A dragover (or a drop) on `el`, as the browser sends it. */
function fire(el: Element, type: string): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as any;
  Object.assign(ev, { dataTransfer: { dropEffect: '', effectAllowed: '', setData() {}, getData: () => '', setDragImage() {} }, altKey: false, ctrlKey: false, clientX: 0, clientY: 0 });
  el.dispatchEvent(ev);
  return ev;
}

const MAT = 'file:///fx/gains.mat';
const SLDD = 'file:///fx/d.sldd';
const PARAM = { className: 'Simulink.Parameter', arrayClass: 'Simulink.Parameter', kind: 'Parameter', isMatlabVariable: false, isScalarNumeric: false };
const BUS = { className: 'Simulink.Bus', arrayClass: 'Simulink.Bus', kind: 'Bus', isMatlabVariable: false, isScalarNumeric: false };
const holding = (...items: unknown[]) => ({ type: 'clipboardState', canPaste: true, mode: 'copy', items });

const matRows = () => [
  { ID: 'm/x', parent: null, Name: { label: 'x' }, _canCopy: true, _canDelete: true },
  { ID: 'm/cfg', parent: null, Name: { label: 'cfg' }, _canCopy: true, _canDelete: true },
  { ID: 'm/cfg/gain', parent: 'm/cfg', Name: { label: 'gain' }, _canCopy: true, _canDelete: true },
];
/** A MAT-file as its host sends it: its rows, then its one rule, for the whole file. */
const mat = (rows: unknown[] = matRows()) => [
  { type: 'setRows', docUri: MAT, rows, columns: ['Name'], columnLabels: { Name: 'Name' }, editable: true },
  {
    type: 'sectionRules',
    docUri: MAT,
    rules: [{ sectionName: '', sectionLabel: 'gains.mat', isDerived: false, allowedTypes: ['MatlabVariable', 'Simulink.Parameter'] }],
  },
];

describe('every row of a section-less table pastes into the file', () => {
  it('a variable, and a field deep under one, both offer Paste', async () => {
    const t = await hosted([...mat(), holding(PARAM)]);
    for (const rowId of ['m/x', 'm/cfg/gain']) {
      t.table.selectedRowIds = [rowId];
      expect(pasteIn(await t.openMenu(rowId))?.disabled, rowId).toBe(false);
      t.close();
    }
  });

  it('a selection over several variables is one target, not several', async () => {
    const t = await hosted([...mat(), holding(PARAM)]);
    t.table.selectedRowIds = ['m/x', 'm/cfg/gain'];
    expect(pasteIn(await t.openMenu('m/x'))?.disabled).toBe(false);
  });

  it("refuses what the file's rule does not admit, naming the file", async () => {
    const t = await hosted([...mat(), holding(BUS)]);
    t.table.selectedRowIds = ['m/x'];
    expect(pasteIn(await t.openMenu('m/x'))).toMatchObject({ disabled: true, reason: 'Bus cannot be in gains.mat' });
  });
});

describe('the empty body is the file too', () => {
  it('a right-click there offers Paste and Undo/Redo, whatever is selected, and pastes with no row', async () => {
    const t = await hosted([...mat(), holding(PARAM)]);
    t.table.selectedRowIds = ['m/x'];
    await t.table.updateComplete;
    expect((await t.openMenu(null)).map((i) => i.label)).toEqual(['Paste', 'Undo', 'Redo']);
    t.click('Paste');
    expect(t.pastes()).toEqual([{ type: 'paste', rowId: '' }]);
  });

  it('on an EMPTY file, Paste is offered and Cmd+V with nothing selected pastes', async () => {
    const t = await hosted([...mat([]), holding(PARAM)]);
    expect(pasteIn(await t.openMenu(null))?.disabled).toBe(false);
    t.close();
    expect(await t.pressPaste([])).toBe(true);
    expect(t.pastes()).toEqual([{ type: 'paste', rowId: '' }]);
  });

  it('with nothing on the clipboard the body offers a disabled Paste and sends nothing', async () => {
    const t = await hosted([...mat(), { type: 'clipboardState', canPaste: false, mode: null, items: [] }]);
    expect(pasteIn(await t.openMenu(null))).toMatchObject({ disabled: true, reason: 'Nothing to paste' });
    t.close();
    expect(await t.pressPaste([])).toBe(false);
    expect(t.pastes()).toEqual([]);
  });
});

describe('a drag onto a section-less table predicts against the file', () => {
  const dragging = (items: unknown[], docUri = SLDD) => ({ type: 'dragState', descriptor: { docUri, items } });
  const rowEl = (table: DexTreeTable, rowId: string) => table.shadowRoot!.querySelector(`tr[data-row-id="${rowId}"]`)!;

  it('a dictionary entry dragged over a variable may land; one the file refuses may not', async () => {
    const t = await hosted(mat());
    t.send(dragging([{ ...PARAM, sectionName: 'design' }]));
    expect(fire(rowEl(t.table, 'm/x'), 'dragover').defaultPrevented).toBe(true);
    t.send(dragging([{ ...BUS, sectionName: 'design' }]));
    expect(fire(rowEl(t.table, 'm/x'), 'dragover').defaultPrevented).toBe(false);
  });

  it('moving a variable within its own file is the same-section no-op', async () => {
    const t = await hosted(mat());
    t.send(dragging([{ ...PARAM, sectionName: '' }], MAT));
    expect(fire(rowEl(t.table, 'm/cfg'), 'dragover').defaultPrevented).toBe(false);
    // From another file the same variable lands.
    t.send(dragging([{ ...PARAM, sectionName: '' }], 'file:///fx/other.mat'));
    expect(fire(rowEl(t.table, 'm/cfg'), 'dragover').defaultPrevented).toBe(true);
  });
});

describe("a dictionary's table is unchanged: no '' rule, no row-less target", () => {
  it('Cmd+V with nothing selected sends nothing, and lets the key through', async () => {
    const t = await hosted([
      {
        type: 'setRows',
        docUri: SLDD,
        rows: [
          { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
          { ID: 'd/design/A', parent: 'section:design', Name: { label: 'A' }, _canCopy: true, _canDelete: true },
        ],
        columns: ['Name'],
        columnLabels: { Name: 'Name' },
        editable: true,
      },
      { type: 'sectionRules', docUri: SLDD, rules: [{ sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] }] },
      holding(PARAM),
    ]);
    expect(await t.pressPaste([])).toBe(false);
    expect(t.pastes()).toEqual([]);
  });
});

// Ruling V-019: a selection that spans two sections sends no paste, from the menu or from Cmd+V.
// The two anchor differently (the menu at the right-clicked row, the keyboard at the first selected
// row), so before a selected section header counted as its section, [Design header, Architectural
// header] pasted into Architectural Data from the menu and into Design Data from Cmd+V.
describe('a paste needs a selection in one section', () => {
  const DESIGN = 'section:design';
  const ARCH = 'section:arch';
  /** Two sections with one entry each, the rules for both, and a clipboard both accept. */
  const twoSections = () =>
    hosted([
      {
        type: 'setRows',
        docUri: SLDD,
        rows: [
          { ID: DESIGN, parent: null, Name: { label: 'Design Data' } },
          { ID: 'doc/design/A', parent: DESIGN, Name: { label: 'A' }, _canCopy: true, _canDelete: true },
          { ID: ARCH, parent: null, Name: { label: 'Architectural Data' } },
          { ID: 'doc/arch/V', parent: ARCH, Name: { label: 'V' }, _canCopy: true, _canDelete: true },
        ],
        columns: ['Name', 'Value'],
        columnLabels: { Name: 'Name', Value: 'Value' },
        editable: true,
      },
      {
        type: 'sectionRules',
        docUri: SLDD,
        rules: [
          { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] },
          { sectionName: 'arch', sectionLabel: 'Architectural Data', isDerived: true, allowedTypes: [] },
        ],
      },
      holding(BUS),
    ]);

  describe('a selection over two sections pastes nowhere', () => {
    it('Cmd+V with two headers selected sends no paste', async () => {
      const t = await twoSections();
      await t.pressPaste([DESIGN, ARCH]);
      expect(t.pastes()).toEqual([]);
    });

    it('the menu on either header offers a disabled Paste that sends nothing', async () => {
      const t = await twoSections();
      for (const rowId of [DESIGN, ARCH]) {
        t.table.selectedRowIds = [DESIGN, ARCH];
        expect(pasteIn(await t.openMenu(rowId)), `right-clicked ${rowId}`).toMatchObject({ disabled: true, reason: 'Select rows in one section to paste' });
        t.click('Paste');
        t.close();
      }
      expect(t.pastes()).toEqual([]);
    });

    it('Cmd+V with a header and another section’s row selected sends no paste', async () => {
      const t = await twoSections();
      await t.pressPaste([DESIGN, 'doc/arch/V']);
      expect(t.pastes()).toEqual([]);
    });
  });

  describe('a selection in one section still pastes there', () => {
    it('Cmd+V on a lone header pastes into that section', async () => {
      const t = await twoSections();
      await t.pressPaste([ARCH]);
      expect(t.pastes()).toEqual([{ type: 'paste', rowId: ARCH }]);
    });

    it('the menu on a header selected with its own rows pastes into that section', async () => {
      const t = await twoSections();
      t.table.selectedRowIds = [DESIGN, 'doc/design/A'];
      expect(pasteIn(await t.openMenu(DESIGN))?.disabled).toBe(false);
      t.click('Paste');
      expect(t.pastes()).toEqual([{ type: 'paste', rowId: DESIGN }]);
    });
  });
});

// A cut pasted back into the section every item came from is a no-op (the host clears the cut and
// edits nothing), so the menu disables Paste and says why, and Cmd+V sends nothing, as a drag of the
// same rows onto that section is refused. What decides it is what the host sent: where the cut came
// from (the clipboard's `sourceDocUri` and each item's `sectionName`), this document's uri, and the
// target's section.
describe('a cut pasted back where it came from', () => {
  const cutFrom = (sourceDocUri: string, sectionName: string) => ({ type: 'clipboardState', canPaste: true, mode: 'cut', sourceDocUri, items: [{ ...BUS, sectionName }] });
  const dictionary = () => [
    {
      type: 'setRows',
      docUri: SLDD,
      rows: [
        { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
        { ID: 'd/design/A', parent: 'section:design', Name: { label: 'A' }, _canCopy: true, _canDelete: true },
        { ID: 'section:arch', parent: null, Name: { label: 'Architectural Data' } },
        { ID: 'd/arch/V', parent: 'section:arch', Name: { label: 'V' }, _canCopy: true, _canDelete: true },
      ],
      columns: ['Name'],
      columnLabels: { Name: 'Name' },
      editable: true,
    },
    {
      type: 'sectionRules',
      docUri: SLDD,
      rules: [
        { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] },
        { sectionName: 'arch', sectionLabel: 'Architectural Data', isDerived: true, allowedTypes: [] },
      ],
    },
  ];

  describe('a dictionary', () => {
    it('a cut from Design Data offers no Paste back into Design Data, and Cmd+V sends nothing', async () => {
      const t = await hosted([...dictionary(), cutFrom(SLDD, 'design')]);
      t.table.selectedRowIds = ['d/design/A'];
      expect(pasteIn(await t.openMenu('d/design/A'))).toMatchObject({ disabled: true, reason: 'Already in Design Data' });
      t.close();
      expect(await t.pressPaste(['d/design/A'])).toBe(false);
      expect(t.pastes()).toEqual([]);
    });

    it('still pastes it into another section, or into another document’s same section', async () => {
      const t = await hosted([...dictionary(), cutFrom(SLDD, 'design')]);
      await t.pressPaste(['d/arch/V']);
      expect(t.pastes()).toEqual([{ type: 'paste', rowId: 'd/arch/V' }]);
      t.send(cutFrom('file:///fx/other.sldd', 'design'));
      await t.pressPaste(['d/design/A']);
      expect(t.pastes()).toEqual([
        { type: 'paste', rowId: 'd/arch/V' },
        { type: 'paste', rowId: 'd/design/A' },
      ]);
    });
  });

  describe('a MAT-file', () => {
    it('a cut of its own variable offers no Paste back into it, from a row or the body', async () => {
      const t = await hosted([
        { type: 'setRows', docUri: MAT, rows: [{ ID: 'm/x', parent: null, Name: { label: 'x' }, _canCopy: true, _canDelete: true }], columns: ['Name'], columnLabels: {}, editable: true },
        { type: 'sectionRules', docUri: MAT, rules: [{ sectionName: '', sectionLabel: 'gains.mat', isDerived: false, allowedTypes: [] }] },
        cutFrom(MAT, ''),
      ]);
      t.table.selectedRowIds = ['m/x'];
      expect(pasteIn(await t.openMenu('m/x'))).toMatchObject({ disabled: true, reason: 'Already in gains.mat' });
      t.close();
      expect(pasteIn(await t.openMenu(null))).toMatchObject({ disabled: true, reason: 'Already in gains.mat' });
      t.close();
      await t.pressPaste([]);
      expect(t.pastes()).toEqual([]);
      // From another file it lands.
      t.send(cutFrom('file:///fx/other.mat', ''));
      await t.pressPaste([]);
      expect(t.pastes()).toEqual([{ type: 'paste', rowId: '' }]);
    });
  });
});
