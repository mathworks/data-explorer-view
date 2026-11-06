// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Terminal view, connected: a line run at the command window's prompt is the interpreter's
// (runCommand) over the active document, through the same source commands its table sends, and its
// answer is shown under it. Lines run one after another, so the answers come in the order they were
// typed and an edit never lands inside an add; and a Save from anywhere waits for the lines before
// it, since an edit the window made is no cell editor for commitEdit to wait on.
import { describe, expect, it } from 'vitest';
import { commandWindow, dirtyTabs, open, rowOf, savedTo, startPage, tableOf, textOf, until, valueIn } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'legacy_ctrl.mdl': 'legacy_ctrl.mdl' };
const run = (line: string) => commandWindow().dispatchEvent(new CustomEvent('dex-command-run', { detail: { line }, bubbles: true, composed: true }));
/** The output's lines, as drawn, past the welcome. */
const output = () => [...(commandWindow().shadowRoot?.querySelectorAll('.output .line') ?? [])].map((l) => l.textContent ?? '').slice(2);
const names = () => tableOf('params.sldd')!.rows.map((r) => r.Name?.label);

describe('the Terminal view', () => {
  it('says there is no document with none open', async () => {
    startPage(FILES);
    run('ls');
    await until(() => output().length > 0);
    expect(output()).toEqual(['No document is open.']);
  });

  it('lists the open documents, the active one marked', async () => {
    const page = startPage(FILES);
    await open(page, 'legacy_ctrl.mdl', 'params.sldd');
    run('sources');
    await until(() => output().some((l) => l.includes('params.sldd')));
    expect(output().join('\n')).toContain('legacy_ctrl.mdl');
  });

  it("sets a value, adds an entry and removes one, as the table would, in the active document", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    run('Kp = 5');
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '5');
    await until(() => dirtyTabs().includes('params.sldd'));
    run('add Simulink.Parameter Kz');
    await until(() => names().includes('Kz'));
    run('rm Kz');
    await until(() => !names().includes('Kz'));
    await until(() => output().length >= 3);
    expect(output()).toEqual(['Kp = 5', 'Created "Kz" (Simulink.Parameter).', 'Removed "Kz".']);
  });

  it('answers each line in the order it was run, an edit after an add landing on the new entry', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    run('add Simulink.Parameter Ka');
    run('Ka = 7');
    run('Ka');
    await until(() => output().length >= 3);
    expect(output()).toEqual(['Created "Ka" (Simulink.Parameter).', 'Ka = 7', 'Ka = 7']);
    expect(textOf(await rowOf('params.sldd', 'Ka'))).toBe('7');
  });

  it('saves the active document, and says so', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    run('Kp = 5');
    run('save');
    await until(() => output().length >= 2);
    expect(output()).toEqual(['Kp = 5', 'Saved params.sldd.']);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kp')).toBe('5');
  });

  it('says a file the page does not edit is read-only, and has no save', async () => {
    const page = startPage(FILES);
    await open(page, 'legacy_ctrl.mdl');
    run('save');
    await until(() => output().length === 1);
    expect(output()[0]).toBe('legacy_ctrl.mdl cannot be saved here.');
  });

  it('a Save asked while a line still runs waits for it, and writes what it did', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    run('add Simulink.Parameter Kb');
    run('Kb = 9');
    page.command('save');
    await until(() => !!savedTo(page.main, 'params.sldd') && dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kb')).toBe('9');
  });
});
