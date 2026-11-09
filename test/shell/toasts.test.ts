// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's toasts: what the editing workspace says the table cannot show (its `notify`), handed
// to the toast host as it stands, and the shell's own word that a save landed, which goes by itself
// after two seconds. The Electron app had a notice line under the tabs; undo.test.ts and
// activeConfig.test.ts read the workspace's warnings there now.
import { describe, expect, it, vi } from 'vitest';
import type { Toast } from '../../src/widgets/app-shell/dex-toast-host.js';
import { at, choose, dirtyTabs, edit, menuOn, open, rowOf, startPage, tabNames, toastHost, toastTexts, until } from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };

/** What the toast host is shown, from now on. */
function shownToasts(): Toast[] {
  const shown: Toast[] = [];
  const show = toastHost().show.bind(toastHost());
  vi.spyOn(toastHost(), 'show').mockImplementation((toast) => (shown.push(toast), show(toast)));
  return shown;
}

describe('toasts', () => {
  it('a save says so, briefly', async () => {
    const page = startPage(FILES);
    const shown = shownToasts();
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('save');
    await until(() => shown.length === 1);
    expect(shown).toEqual([{ level: 'info', message: 'Saved params.sldd', ms: 2000 }]);
    expect(toastTexts()).toEqual(['Saved params.sldd']);
  });

  it('a Save As says where it saved, by the name of the copy', async () => {
    const page = startPage(FILES);
    const shown = shownToasts();
    await open(page, 'params.sldd');
    page.main.saveAs.push(at('copy.sldd'));
    page.command('save-as');
    await until(() => tabNames().includes('copy.sldd'));
    await until(() => shown.length === 1);
    expect(shown[0]).toEqual({ level: 'info', message: 'Saved copy.sldd', ms: 2000 });
  });

  it("the workspace's notices come as they are: a cut whose original stayed is a warning that stays", async () => {
    const page = startPage(FILES);
    const shown = shownToasts();
    await open(page, 'params.sldd', 'ParamMat.mat');
    await menuOn('params.sldd', 'Uo');
    choose('cut');
    await edit('params.sldd', 'Uo', 'Uo2', 'Name');
    await rowOf('params.sldd', 'Uo2');
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('paste');
    await until(() => shown.some((t) => t.level === 'warning'));
    expect(shown.find((t) => t.level === 'warning')!.message).toContain('the original in params.sldd could not be removed');
  });
});
