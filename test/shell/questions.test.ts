// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's questions, asked one at a time. A browser host has no prompts of its own, so the
// shell asks in its one confirm dialog, whose show() answers a question still open with that
// question's cancel when it is asked another: a reload question while "Save changes?" is up would
// cancel the close, and a close while a reload question is up would answer it Keep My Edits, with
// nobody having pressed anything. Each question waits for the one before it; one that is no longer
// worth asking by its turn (its tab closed) is not asked.
//
// And a question still out about a tab that has closed, or a shell that was taken down, is acted on
// by nobody: its answer reads no file and touches no document.
import { describe, expect, it } from 'vitest';
import { inPageQuestions } from '../../src/widgets/app-shell/connect/questions.js';
import { OPEN_URL_PROMPT } from '../../src/widgets/app-shell/connect/shareLinks.js';
import type { DexConfirmDialog } from '../../src/widgets/app-shell/dex-confirm-dialog.js';
import { at, changedOutside, confirmButton, confirmDialog, dirtyTabs, edit, open, settled, startPage, tabNames, tableOf, textOf, until, type Page } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };
const asking = () => (confirmDialog().hasAttribute('open') ? (confirmDialog().shadowRoot?.textContent ?? '') : '');
const shown = (file: string, row: string) => textOf(tableOf(file)?.rows.find((r) => r.Name?.label === row));

/** Write `value` into row `row` of `file` from outside, and tell the shell, as the host's watcher does. */
async function outside(page: Page, file: string, row: string, value: string): Promise<void> {
  page.main.files.set(at(file), await changedOutside(page.main.files.get(at(file))!, file, row, value));
  page.main.changed(at(file));
}

/** A page with unsaved edits in params.sldd, whose host asks nothing itself. */
async function editedInBrowser(): Promise<Page> {
  const page = startPage(FILES, { without: ['confirmClose', 'confirmReload'] });
  await open(page, 'params.sldd');
  await edit('params.sldd', 'Kp', '5');
  await until(() => dirtyTabs().length === 1);
  return page;
}

describe('in-page questions', () => {
  it("a change on disk while \"Save changes?\" is asked waits for its answer, and is not asked for the tab that answer closed", async () => {
    const page = await editedInBrowser();
    page.command('close-tab');
    await until(() => asking().includes('Do you want to save the changes you made to params.sldd?'));
    await outside(page, 'params.sldd', 'Ki', '30');
    await settled();
    expect(asking()).toContain('Do you want to save the changes you made to params.sldd?');
    (await confirmButton("Don't Save")).click();
    await until(() => tabNames().length === 0);
    await settled();
    expect(asking()).toBe('');
    expect(page.main.saves).toEqual([]);
  });

  it('a close asked while a reload question is up waits for its answer, which is acted on, and then asks', async () => {
    const page = await editedInBrowser();
    await outside(page, 'params.sldd', 'Ki', '30');
    await until(() => asking().includes('params.sldd changed on disk.'));
    page.command('close-tab');
    await settled();
    expect(asking()).toContain('params.sldd changed on disk.');
    (await confirmButton('Reload')).click();
    await until(() => shown('params.sldd', 'Ki') === '30' && shown('params.sldd', 'Kp') === '1');
    await until(() => asking().includes('Do you want to save the changes you made to params.sldd?'));
    (await confirmButton("Don't Save")).click();
    await until(() => tabNames().length === 0);
  });
});

describe('a reload question queued behind another', () => {
  it("is never asked for a tab closed while it waited, and that tab's file is not read", async () => {
    // The host asks about closing itself, and leaves reload questions to the shell.
    const page = startPage(FILES, { without: ['confirmReload'] });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 2);
    await outside(page, 'params.sldd', 'Ki', '30');
    await until(() => asking().includes('params.sldd changed on disk.'));
    // ParamMat.mat's question waits behind params.sldd's.
    await outside(page, 'ParamMat.mat', 'ParamMat', '[9 9 9; 9 9 9]');
    await settled();
    expect(asking()).toContain('params.sldd changed on disk.');
    // ParamMat.mat, the active tab, is closed meanwhile, its edits let go.
    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().join() === 'params.sldd');
    const reads = page.main.reads.filter((p) => p === at('ParamMat.mat')).length;
    (await confirmButton('Keep My Edits')).click();
    await settled(50);
    expect(asking()).toBe('');
    expect(page.main.reads.filter((p) => p === at('ParamMat.mat')).length).toBe(reads);
  });
});

describe('a reload question still out', () => {
  /** A page whose host is asked about params.sldd's change, and answers when the test says. */
  async function askedAboutAChange() {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    let answer!: (reload: boolean) => void;
    page.host.confirmReload = (name) => (page.main.reloadAsked.push(name), new Promise((resolve) => (answer = resolve)));
    await outside(page, 'params.sldd', 'Ki', '30');
    await until(() => page.main.reloadAsked.length === 1);
    return { page, answer: (reload: boolean) => answer(reload) };
  }

  it('is acted on by nobody once its tab has closed: the answer reads nothing', async () => {
    const { page, answer } = await askedAboutAChange();
    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().join() === 'ParamMat.mat');
    const reads = page.main.reads.length;
    answer(false);
    await settled();
    expect(page.main.reads.length).toBe(reads);
  });

  it('is acted on by nobody once the shell is taken down', async () => {
    const { page, answer } = await askedAboutAChange();
    page.handle.dispose();
    const reads = page.main.reads.length;
    answer(true);
    await settled();
    expect(page.main.reads.length).toBe(reads);
  });
});

describe('a prompt among the questions', () => {
  // A prompt (Open from URL…) is asked in the same dialog: asked over a question, it would answer
  // the question with its cancel, and a question over it would answer the prompt null.
  const QUESTION = { title: 'File Changed', message: 'params.sldd changed on disk.', buttons: [{ id: 'keep', label: 'Keep My Edits' }, { id: 'reload', label: 'Reload' }], cancelId: 'keep' };
  const field = (dialog: DexConfirmDialog) => dialog.shadowRoot?.querySelector('input') ?? null;
  const buttonOf = (dialog: DexConfirmDialog, label: string) => [...(dialog.shadowRoot?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label)!;

  it('waits for the question up to be answered, and a question asked while it is up waits for it', async () => {
    const dialog = document.createElement('dex-confirm-dialog');
    document.body.append(dialog);
    let closed = 0;
    const questions = inPageQuestions(dialog, () => void closed++);
    const reload = questions.ask(QUESTION);
    const url = questions.prompt(OPEN_URL_PROMPT);
    await until(() => dialog.hasAttribute('open'));
    await settled();
    expect(field(dialog)).toBeNull();
    buttonOf(dialog, 'Reload').click();
    await expect(reload).resolves.toBe('reload');
    await until(() => !!field(dialog));
    expect(dialog.shadowRoot!.querySelector('.title')?.textContent).toBe('Open from URL');
    // A question asked now waits for the prompt.
    const next = questions.ask(QUESTION);
    await settled();
    expect(field(dialog)).not.toBeNull();
    buttonOf(dialog, 'Cancel').click();
    await expect(url).resolves.toBeNull();
    await until(() => !!dialog.shadowRoot?.querySelector('[role="alertdialog"]'));
    buttonOf(dialog, 'Keep My Edits').click();
    await expect(next).resolves.toBe('keep');
    // The popovers were closed before each of the three.
    expect(closed).toBe(3);
  });
});
