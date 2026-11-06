// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Undo and Redo as commands (a native menu's Edit > Undo, the toolbar's), rows copied and cut
// between tabs (one workspace, one clipboard), and what the workspace's `notify` says, now in a
// toast. Ported from data-explorer-app's page test of the same name, its notice line the toast host.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choose, dirtyTabs, edit, menuOn, open, rowOf, savedTo, sectionOf, selectTab, settled, startPage, tableOf, textOf, until, valueIn } from './harness.js';

afterEach(() => vi.restoreAllMocks());

const EDITS = [
  { file: 'params.sldd', row: 'Kp', from: '1', to: '5' },
  { file: 'rt_bin.sldd', row: 'Wheels', from: '4', to: '6' },
  { file: 'ParamMat.mat', row: 'ParamMat', from: '[1 2 3; 4 5 6]', to: '[1 2 3; 4 5 7]' },
  { file: 'slxcases.slx', row: 'tau', from: '0.25', to: '0.5' },
];
const FILES = Object.fromEntries(EDITS.map((e) => [e.file, e.file]));
const valueOf = async (file: string, row: string) => textOf(await rowOf(file, row));
const toastHost = () => document.querySelector('dex-toast-host')!;

describe('Undo and Redo', () => {
  it.each(EDITS)("$file: take the active document's edit back and make it again, back to clean at the file", async (e) => {
    const page = startPage(FILES);
    await open(page, e.file);
    await edit(e.file, e.row, e.to);
    await until(() => dirtyTabs().length === 1);
    page.command('undo');
    await until(() => textOf(tableOf(e.file)!.rows.find((r) => r.Name?.label === e.row)) === e.from && dirtyTabs().length === 0);
    page.command('redo');
    await until(() => textOf(tableOf(e.file)!.rows.find((r) => r.Name?.label === e.row)) === e.to && dirtyTabs().length === 1);
  });

  it("pressed in a table, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are the table's own", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const press = (shiftKey: boolean) => {
      const e = new KeyboardEvent('keydown', { key: shiftKey ? 'Z' : 'z', metaKey: true, ctrlKey: true, shiftKey, bubbles: true, composed: true, cancelable: true });
      tableOf('params.sldd')!.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(press(false)).toBe(true);
    await until(() => dirtyTabs().length === 0);
    expect(await valueOf('params.sldd', 'Kp')).toBe('1');
    expect(press(true)).toBe(true);
    await until(() => dirtyTabs().length === 1);
    expect(await valueOf('params.sldd', 'Kp')).toBe('5');
  });

  it("each tab has its own stack: Undo takes back the active document's edit only", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 2);
    // ParamMat.mat is the active tab.
    page.command('undo');
    await until(() => dirtyTabs().length === 1);
    expect(dirtyTabs()).toEqual(['params.sldd']);
    expect(await valueOf('params.sldd', 'Kp')).toBe('5');
  });

  it("in a text field, they are the field's own: the document keeps its edit", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    tableOf('params.sldd')!.focusFilter();
    page.command('undo');
    page.command('redo');
    expect(exec.mock.calls).toEqual([['undo'], ['redo']]);
    await settled();
    expect(await valueOf('params.sldd', 'Kp')).toBe('5');
    expect(dirtyTabs()).toEqual(['params.sldd']);
  });

  it('on a checkbox, which takes no typing, they are the document\'s', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
    document.body.append(box);
    box.focus();
    page.command('undo');
    await until(() => dirtyTabs().length === 0);
    expect(exec).not.toHaveBeenCalled();
  });

  it('a model kept for viewing only, and a .mdl, have nothing to undo', async () => {
    const page = startPage({ 'shared_gain.slx': 'shared_gain.slx', 'legacy_ctrl.mdl': 'legacy_ctrl.mdl' });
    await open(page, 'shared_gain.slx', 'legacy_ctrl.mdl');
    expect(() => page.command('undo')).not.toThrow();
    await selectTab('shared_gain.slx');
    expect(() => page.command('undo')).not.toThrow();
  });
});

describe('between tabs', () => {
  it('a row copied in one file pastes into another; a cut one leaves its file; each saves as it shows', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'rt_bin.sldd', 'ParamMat.mat');
    await menuOn('params.sldd', 'Kp');
    choose('copy');
    // Pasted into the compressed dictionary's Design Data.
    const design = await sectionOf('rt_bin.sldd', 'Design Data');
    tableOf('rt_bin.sldd')!.selectedRowIds = [design.ID];
    tableOf('rt_bin.sldd')!.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: design.ID }, bubbles: true, composed: true }));
    choose('paste');
    expect(await valueOf('rt_bin.sldd', 'Kp')).toBe('1');

    await menuOn('params.sldd', 'Uo');
    choose('cut');
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('paste');
    expect(await valueOf('ParamMat.mat', 'Uo')).toBe('2');
    await until(() => !tableOf('params.sldd')!.rows.some((r) => r.Name?.label === 'Uo'));

    await until(() => dirtyTabs().length === 3);
    for (const file of ['params.sldd', 'rt_bin.sldd', 'ParamMat.mat']) {
      await selectTab(file);
      page.command('save');
    }
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, 'rt_bin.sldd')!, 'rt_bin.sldd', 'Kp')).toBe('1');
    expect(await valueIn(savedTo(page.main, 'ParamMat.mat')!, 'ParamMat.mat', 'Uo')).toBe('2');
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Uo')).toBe('');
  });

  it('a cut whose original was renamed before the paste says, in a toast that stays, that the original stayed', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await menuOn('params.sldd', 'Uo');
    choose('cut');
    await edit('params.sldd', 'Uo', 'Uo2', 'Name');
    await rowOf('params.sldd', 'Uo2');
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('paste');
    const toast = () => toastHost().shadowRoot?.querySelector<HTMLElement>('.toast');
    await until(() => !!toast());
    expect(toast()!.classList.contains('warning')).toBe(true);
    expect(toast()!.textContent).toContain('the original in params.sldd could not be removed');
    toast()!.querySelector<HTMLElement>('.dismiss')!.click();
    await until(() => !toast());
  });
});
