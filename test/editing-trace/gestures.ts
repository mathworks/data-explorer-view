// Copyright 2026 The MathWorks, Inc.
//
// One script of editing gestures, for two tables: the VS Code extension's table webview
// (its src/webview/table-main.ts, as it ships at c73da3c) and a table wired with
// connectTable({editing}) the way the extension's webview will be once it moves onto it. The
// script plays the host's messages and the user's gestures, and records, step by step, what the
// table sent its host and what it showed (the menus, the dialogs, the editors it opened, its
// selection, its drop predictions). The extension's recording is the fixture
// (editing-trace.json, by scripts/downstream/record-editing-trace.test.ts); the
// connectTable replay must equal it (editingTrace.test.ts).
//
// It imports nothing, so it runs in either repository's test environment.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A table to play the script on, and how to reach it. */
export interface TraceEnv {
  /** The `<dex-tree-table>`. */
  table: any;
  /** The `<dex-context-menu>` its editing menu opens in. */
  contextMenu: any;
  /** The `<dex-error-dialog>` its refusals open. */
  errorDialog: any;
  /** Deliver a message from the host, as the host posts it. */
  send(message: Record<string, unknown>): void;
  /** Every message the table has sent its host, in order. */
  posted: unknown[];
}

/** What one step did: the messages the table sent, and what it showed. */
export interface TraceStep {
  step: string;
  posted: unknown[];
  seen: unknown[];
}

const DOC = 'file:///fx/trace.sldd';
const MAT = 'file:///fx/trace.mat';
const DESIGN = 'section:design';
const ARCH = 'section:arch';
const A = 'binedit:file:///fx/trace.sldd/design/A';
const B = 'binedit:file:///fx/trace.sldd/design/B';
const S = 'binedit:file:///fx/trace.sldd/design/S';
const V = 'binedit:file:///fx/trace.sldd/arch/V';
const X = 'binedit:file:///fx/trace.mat/x';

const param = { className: 'Simulink.Parameter', arrayClass: '', kind: 'Parameter', isMatlabVariable: true, isScalarNumeric: true };
const bus = { className: 'Simulink.Bus', arrayClass: 'Simulink.Bus', kind: 'Bus', isMatlabVariable: false, isScalarNumeric: false };

const dictionary = (editable: boolean, hasTextView: boolean) => ({
  type: 'setRows',
  docUri: DOC,
  rows: [
    { ID: DESIGN, parent: null, Name: { label: 'Design Data' } },
    { ID: A, parent: DESIGN, Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true },
    { ID: B, parent: DESIGN, Name: { label: 'B', editable: true }, Value: '2', _canCopy: true, _canDelete: true },
    { ID: S, parent: DESIGN, Name: { label: 'S', editable: true }, Value: '<1x1 struct>', _canCopy: true, _canDelete: true, _canAddChild: true },
    { ID: ARCH, parent: null, Name: { label: 'Architectural Data' } },
    { ID: V, parent: ARCH, Name: { label: 'V', editable: true }, Value: '', _canCopy: true, _canDelete: false },
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable,
  hasTextView,
});

const RULES = {
  type: 'sectionRules',
  docUri: DOC,
  rules: [
    { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] },
    { sectionName: 'arch', sectionLabel: 'Architectural Data', isDerived: true, allowedTypes: ['Simulink.Bus'] },
  ],
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function runGestures(env: TraceEnv): Promise<TraceStep[]> {
  const { table, contextMenu, errorDialog } = env;
  const steps: TraceStep[] = [];
  let seen: unknown[] = [];
  const see = (...what: unknown[]) => void seen.push(what);

  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await tick();
      await table.updateComplete;
    }
  };

  // What the table shows, recorded as it is asked for.
  const spy = (target: any, name: string, record: (...args: any[]) => void) => {
    const original = target[name].bind(target);
    target[name] = (...args: any[]) => {
      record(...args);
      return original(...args);
    };
  };
  spy(contextMenu, 'show', (_x: number, _y: number, items: unknown[]) => see('menu', JSON.parse(JSON.stringify(items))));
  spy(errorDialog, 'show', (opts: Record<string, unknown>) => see('dialog', { ...opts, returnFocusTo: undefined }));
  spy(table, 'openWholeValueEditor', (rowId: string, text: string) => see('wholeValueEditor', rowId, text));
  spy(table, 'beginRename', (rowId: string) => see('beginRename', rowId));
  spy(table, 'toggleAddGallery', () => see('toggleAddGallery'));

  const step = async (name: string, run: () => unknown) => {
    env.posted.length = 0;
    seen = [];
    await run();
    await settle();
    steps.push({ step: name, posted: [...env.posted], seen });
  };
  const state = () =>
    see('state', {
      canAdd: table.canAdd,
      rowDrag: table.rowDrag,
      addClasses: table.addClasses,
      selected: [...(table.selectedRowIds ?? [])],
    });
  const select = async (rowIds: string[]) => {
    table.selectedRowIds = rowIds;
    await table.updateComplete;
  };
  const rightClick = async (rowId: string | null) => {
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { rowId, x: 10, y: 10 } }));
    await frame();
    await contextMenu.updateComplete;
  };
  // Click the open menu's item for `actionId`, as the user would: a disabled one does nothing.
  let shownItems: { id?: string; label?: string }[] = [];
  spy(contextMenu, 'show', (_x: number, _y: number, items: { id?: string; label?: string }[]) => void (shownItems = items));
  const choose = async (actionId: string) => {
    const label = shownItems.find((i) => i.id === actionId)?.label;
    const item = [...(contextMenu.shadowRoot?.querySelectorAll('.item') ?? [])].find(
      (el: any) => label !== undefined && el.querySelector('.item-label')?.textContent === label,
    ) as HTMLElement | undefined;
    if (item) item.click();
    else see('no item', actionId);
    await settle();
    contextMenu.close();
  };
  const key = (k: string, mods: { ctrl?: boolean; shift?: boolean } = {}) =>
    table.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, bubbles: true, cancelable: true, composed: true }),
    );
  const event = (type: string, detail: unknown) => table.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  const predict = (rowId: string, mode: 'copy' | 'move') => see('predict', rowId, mode, table.dropPredictor?.(rowId, mode) ?? null);

  // --- An editable dictionary with a text view -------------------------------------------------

  await step('paint an editable dictionary, its rules and an empty clipboard', async () => {
    env.send(dictionary(true, true));
    await settle();
    env.send(RULES);
    env.send({ type: 'clipboardState', canPaste: false, mode: null, items: [] });
    await settle();
    state();
  });

  await step('right-click an entry: the editing menu, then Copy', async () => {
    await select([A]);
    await rightClick(A);
    await choose('copy');
  });

  await step('the clipboard holds a copied Parameter: right-click Architectural Data, whose Paste is disabled', async () => {
    env.send({ type: 'clipboardState', canPaste: true, mode: 'copy', sourceDocUri: DOC, items: [{ sectionName: 'design', ...param }] });
    await settle();
    await select([ARCH]);
    await rightClick(ARCH);
    await choose('paste');
  });

  await step('right-click Design Data, and Paste there', async () => {
    await select([DESIGN]);
    await rightClick(DESIGN);
    await choose('paste');
  });

  await step('a cut pasted back where it came from is refused, with why', async () => {
    env.send({ type: 'clipboardState', canPaste: true, mode: 'cut', sourceDocUri: DOC, items: [{ sectionName: 'design', ...param }] });
    await settle();
    await select([B]);
    await rightClick(B);
  });

  await step('the chords on a selected entry: Cmd+X, Cmd+C, Cmd+V, Delete, Backspace, Cmd+L', async () => {
    env.send({ type: 'clipboardState', canPaste: true, mode: 'copy', sourceDocUri: DOC, items: [{ sectionName: 'design', ...param }] });
    await settle();
    await select([A]);
    key('x', { ctrl: true });
    key('c', { ctrl: true });
    key('v', { ctrl: true });
    key('Delete');
    key('Backspace');
    key('l', { ctrl: true });
    key('z', { ctrl: true });
  });

  await step('two entries selected: the menu counts them, and Cmd+L does nothing', async () => {
    await select([A, B]);
    await rightClick(A);
    contextMenu.close();
    key('l', { ctrl: true });
    key('c', { ctrl: true });
  });

  await step('an entry that cannot be deleted: Delete is refused, Cut too', async () => {
    await select([V]);
    await rightClick(V);
    contextMenu.close();
    key('Delete');
    key('x', { ctrl: true });
  });

  await step('the rest of the menu on a struct: Add Child, Delete, Location in Text, Undo, Redo', async () => {
    await select([S]);
    for (const id of ['addChild', 'delete', 'locateInText', 'undo', 'redo']) {
      await rightClick(S);
      await choose(id);
    }
  });

  await step('a right-click on no row of a dictionary opens nothing', async () => {
    await rightClick(null);
  });

  await step('the host selects rows, and a rename it asks for', async () => {
    env.send({ type: 'selectRows', rowIds: [B] });
    await settle();
    env.send({ type: 'beginRename', rowId: A });
    await settle();
    env.send({ type: 'selectRows', rowIds: ['binedit:file:///fx/trace.sldd/design/NotYet'] });
    await settle();
    state();
  });

  await step('the dialogs: an invalid value, a refusal, a text to edit, and none', async () => {
    env.send({ type: 'validationError', reason: 'Cannot edit "A": not a number.', invalidValue: 'abc', previousValue: '1' });
    env.send({ type: 'refused', title: 'Cannot Delete', reason: 'This element cannot be deleted.' });
    env.send({ type: 'editText', rowId: A, text: '[1 2 3]' });
    env.send({ type: 'editText', rowId: A, text: null, reason: 'Cannot edit the Value of "A".' });
    env.send({ type: 'editText', rowId: A, text: null });
    await settle();
    errorDialog.close();
  });

  await step('a drag: start, the broadcast, predictions, a drop, a drop on no row, the end', async () => {
    event('dex-row-drag-start', { rowIds: [A] });
    env.send({ type: 'dragState', descriptor: { docUri: DOC, items: [{ sectionName: 'design', ...param }] } });
    await settle();
    predict(ARCH, 'move');
    predict(DESIGN, 'move');
    predict(B, 'copy');
    predict('', 'copy');
    event('dex-row-drop', { targetRowId: DESIGN, mode: 'copy' });
    event('dex-row-drop', { targetRowId: '', mode: 'move' });
    event('dex-row-drag-end', null);
    env.send({ type: 'dragState', descriptor: null });
    await settle();
    predict(DESIGN, 'copy');
  });

  await step('a Bus dragged from another document predicts its conversion', async () => {
    env.send({ type: 'dragState', descriptor: { docUri: 'file:///fx/other.sldd', items: [{ sectionName: 'design', ...bus }] } });
    await settle();
    predict(ARCH, 'move');
    predict(DESIGN, 'move');
    env.send({ type: 'dragState', descriptor: null });
  });

  await step('the Add gallery, its accelerator, a whole text asked for, a cell edit, a name looked up', async () => {
    event('dex-add-entry', { section: 'design', className: 'Simulink.Parameter', rename: true });
    event('dex-add-entry', { section: 'arch', className: 'Simulink.Bus' });
    env.send({ type: 'openAddGallery' });
    event('dex-edit-text-request', { rowId: A });
    event('dex-edit-completed', { rowId: A, columnId: 'Value', oldValue: '1', newValue: '2' });
    env.send({ type: 'selectByName', name: 'S' });
    await settle();
    state();
  });

  // --- The same dictionary without a text view, then read-only ----------------------------------

  await step('no text view: no Location in Text, and Cmd+L does nothing', async () => {
    env.send(dictionary(true, false));
    await settle();
    env.send(RULES);
    await settle();
    await select([A]);
    await rightClick(A);
    contextMenu.close();
    key('l', { ctrl: true });
  });

  await step('read-only: no menu, no chords, no drag, no Add, but a committed edit still goes', async () => {
    env.send(dictionary(false, true));
    await settle();
    state();
    await select([A]);
    await rightClick(A);
    key('c', { ctrl: true });
    key('Delete');
    event('dex-row-drag-start', { rowIds: [A] });
    event('dex-row-drop', { targetRowId: DESIGN, mode: 'move' });
    event('dex-row-drag-end', null);
    event('dex-add-entry', { section: 'design', className: 'Simulink.Parameter', rename: false });
    event('dex-edit-text-request', { rowId: A });
    event('dex-edit-completed', { rowId: A, columnId: 'Value', oldValue: '1', newValue: '3' });
    env.send({ type: 'dragState', descriptor: { docUri: DOC, items: [{ sectionName: 'design', ...param }] } });
    await settle();
    predict(DESIGN, 'copy');
  });

  // --- A MAT-file: one target, its own gallery ---------------------------------------------------

  await step('a MAT-file: its gallery classes and its whole-file rule', async () => {
    env.send({
      type: 'setRows',
      docUri: MAT,
      rows: [{ ID: X, parent: null, Name: { label: 'x', editable: true }, Value: '1', _canCopy: true, _canDelete: true }],
      columns: ['Name', 'Value'],
      columnLabels: { Name: 'Name', Value: 'Value' },
      columnGroups: {},
      editable: true,
      add: { classes: ['double', 'char', 7] },
    });
    await settle();
    env.send({ type: 'sectionRules', docUri: MAT, rules: [{ sectionName: '', sectionLabel: 'trace.mat', isDerived: false, allowedTypes: [] }] });
    env.send({ type: 'clipboardState', canPaste: true, mode: 'copy', sourceDocUri: MAT, items: [{ sectionName: '', ...param }] });
    await settle();
    state();
  });

  await step('a MAT-file: a right-click on no row pastes into the file, so does Cmd+V with nothing selected', async () => {
    await select([]);
    await rightClick(null);
    await choose('paste');
    key('v', { ctrl: true });
  });

  await step('a MAT-file: a drop on no row lands in the file', async () => {
    env.send({ type: 'dragState', descriptor: { docUri: 'file:///fx/other.mat', items: [{ sectionName: '', ...param }] } });
    await settle();
    predict('', 'copy');
    event('dex-row-drop', { targetRowId: '', mode: 'copy' });
    event('dex-row-drop', { mode: 'move' });
  });

  return steps;
}
