// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A file changed on disk while open (the host's watcher calls fileChanged): a clean tab takes the
// change; one with unsaved edits asks first, once, and keeps them unless told to reload. Ported
// from data-explorer-app's page test of the same name; the in-page question, for a host with no
// prompt of its own, is new, and says what keeping the edits costs over a MAT-file.
import { describe, expect, it } from 'vitest';
import {
  at,
  changedOutside,
  confirmButton,
  confirmDialog,
  dirtyTabs,
  edit,
  open,
  rowOf,
  savedTo,
  settled,
  startPage,
  tableOf,
  textOf,
  until,
  valueIn,
  type Page,
} from './harness.js';

const EDITS = [
  { file: 'params.sldd', row: 'Kp', to: '5', outside: '7' },
  { file: 'rt_bin.sldd', row: 'Wheels', to: '6', outside: '3' },
  { file: 'ParamMat.mat', row: 'ParamMat', to: '[1 2 3; 4 5 7]', outside: '[9 8 7; 6 5 4]' },
];
const FILES = Object.fromEntries(EDITS.map((e) => [e.file, e.file]));
const shown = (file: string, row: string) => textOf(tableOf(file)?.rows.find((r) => r.Name?.label === row));

/** Write `value` into row `row` of `file` from outside, and tell the shell, as the host's watcher does. */
async function outside(page: Page, file: string, row: string, value: string): Promise<void> {
  page.main.files.set(at(file), await changedOutside(page.main.files.get(at(file))!, file, row, value));
  page.main.changed(at(file));
}

/** The host's saves, written and recorded, answered at once: the harness's own, after a test replaced it. */
const plainSave = (page: Page) => async (p: string, bytes: Uint8Array) => (
  page.main.files.set(p, bytes.slice()), page.main.saves.push({ path: p, bytes: bytes.slice() }), { overwritten: false }
);

describe('a file changed on disk', () => {
  it.each(EDITS)('$file: a clean tab takes the change without asking', async (e) => {
    const page = startPage(FILES);
    await open(page, e.file);
    await rowOf(e.file, e.row);
    await outside(page, e.file, e.row, e.outside);
    await until(() => shown(e.file, e.row) === e.outside);
    expect(page.main.reloadAsked).toEqual([]);
    expect(dirtyTabs()).toEqual([]);
  });

  it.each(EDITS)('$file: unsaved edits ask first; Keep My Edits keeps them, and a save writes them over the change', async (e) => {
    const page = startPage(FILES);
    await open(page, e.file);
    await edit(e.file, e.row, e.to);
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false);
    await outside(page, e.file, e.row, e.outside);
    await until(() => page.main.reloadAsked.length === 1);
    expect(page.main.reloadAsked).toEqual([e.file]);
    await settled();
    expect(shown(e.file, e.row)).toBe(e.to);
    expect(dirtyTabs()).toEqual([e.file]);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, e.file)!, e.file, e.row)).toBe(e.to);
  });

  it.each(EDITS)("$file: Reload takes the disk's, and the edits go", async (e) => {
    const page = startPage(FILES);
    await open(page, e.file);
    await edit(e.file, e.row, e.to);
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(true);
    await outside(page, e.file, e.row, e.outside);
    await until(() => shown(e.file, e.row) === e.outside && dirtyTabs().length === 0);
    expect(page.main.saves).toEqual([]);
  });

  it('asks once, however many changes come while it asks', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false);
    page.main.changed(at('params.sldd'));
    page.main.changed(at('params.sldd'));
    page.main.changed(at('params.sldd'));
    await settled(50);
    expect(page.main.reloadAsked).toEqual(['params.sldd']);
  });

  it('edits kept over a change stay unsaved whatever is undone, and a save writes the document over the change (F52)', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false);
    await outside(page, 'params.sldd', 'Ki', '30');
    await until(() => page.main.reloadAsked.length === 1);
    // The answer taken, the edits kept: the dictionary marks Ki, which the other program changed.
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Ki'), 'Status') === 'Modified');
    expect(shown('params.sldd', 'Ki')).toBe('3');
    // Undone back to the file as it was opened: still not the disk's, so still unsaved.
    page.command('undo');
    await until(() => shown('params.sldd', 'Kp') === '1');
    await settled();
    expect(dirtyTabs()).toEqual(['params.sldd']);
    expect(shown('params.sldd', 'Ki')).toBe('3');
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Ki')).toBe('3');
  });

  it("kept over a change, a MAT-file's save writes its value over the other program's", async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false);
    await outside(page, 'ParamMat.mat', 'ParamMat', '[9 9 9; 9 9 9]');
    await until(() => page.main.reloadAsked.length === 1);
    await settled();
    expect(shown('ParamMat.mat', 'ParamMat')).toBe('[1 2 3; 4 5 7]');
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, 'ParamMat.mat')!, 'ParamMat.mat', 'ParamMat')).toBe('[1 2 3; 4 5 7]');
  });

  it.each(['params.sldd', 'rt_bin.sldd', 'ParamMat.mat'])("%s: a change heard while the shell's save is answered asks, and Keep My Edits keeps the saved edit over it", async (file) => {
    const e = EDITS.find((x) => x.file === file)!;
    const page = startPage(FILES);
    await open(page, file);
    await edit(file, e.row, e.to);
    await until(() => dirtyTabs().length === 1);
    // The host is writing the save when the other program's write lands after it, and the shell
    // hears of the change before the save's answer (a watcher's event that comes first).
    let answerSave!: () => void;
    page.host.saveFile = (p, bytes) =>
      new Promise((resolve) => {
        page.main.files.set(p, bytes.slice());
        answerSave = () => resolve({ overwritten: false });
      });
    let answerAsk!: (take: boolean) => void;
    page.host.confirmReload = (name) => (page.main.reloadAsked.push(name), new Promise((resolve) => (answerAsk = resolve)));
    page.command('save');
    await until(() => !!answerSave);
    await outside(page, file, e.row, e.outside);
    await until(() => page.main.reloadAsked.length === 1);
    answerSave();
    await until(() => dirtyTabs().length === 0);
    answerAsk(false); // Keep My Edits
    await until(() => dirtyTabs().length === 1);
    expect(shown(file, e.row)).toBe(e.to);
    // And the next save writes it over the other program's.
    page.host.saveFile = plainSave(page);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, file)!, file, e.row)).toBe(e.to);
  });

  it.each(['params.sldd', 'ParamMat.mat'])('%s: the host says another program wrote over the save as it landed: it asks, and Keep My Edits keeps the edit, in the tab and on the next save', async (file) => {
    const e = EDITS.find((x) => x.file === file)!;
    const page = startPage(FILES);
    await open(page, file);
    await edit(file, e.row, e.to);
    await until(() => dirtyTabs().length === 1);
    // The save lands, and another program's write lands after it: the host's answer says so.
    const x = await changedOutside(page.main.files.get(at(file))!, file, e.row, e.outside);
    page.host.saveFile = async (p) => (page.main.files.set(p, x), { overwritten: true });
    page.main.reloadAnswers.push(false); // Keep My Edits
    page.command('save');
    await until(() => page.main.reloadAsked.length === 1);
    expect(page.main.reloadAsked).toEqual([file]);
    await until(() => dirtyTabs().length === 1);
    expect(shown(file, e.row)).toBe(e.to);
    page.host.saveFile = plainSave(page);
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, file)!, file, e.row)).toBe(e.to);
  });

  it("the host says another program wrote over the save, and the user says Reload: the tab takes the other program's file", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const x = await changedOutside(page.main.files.get(at('params.sldd'))!, 'params.sldd', 'Kp', '7');
    page.host.saveFile = async (p) => (page.main.files.set(p, x), { overwritten: true });
    page.main.reloadAnswers.push(true);
    page.command('save');
    await until(() => shown('params.sldd', 'Kp') === '7');
    expect(page.main.reloadAsked).toEqual(['params.sldd']);
    expect(dirtyTabs()).toEqual([]);
  });

  it('a change that lands while the last one is acted on is acted on too', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const x1 = await changedOutside(page.main.files.get(at('params.sldd'))!, 'params.sldd', 'Ki', '30');
    const x2 = await changedOutside(x1, 'params.sldd', 'Ki', '31');
    // The user says Reload; the read of the first change is slow, and the second lands meanwhile.
    page.main.reloadAnswers.push(true);
    const read = page.host.readFile;
    let reads = 0;
    let releaseFirst!: () => void;
    page.host.readFile = (p) => {
      reads++;
      if (reads > 1) return read(p);
      return new Promise((resolve) => (releaseFirst = () => resolve(x1.slice())));
    };
    page.main.files.set(at('params.sldd'), x1);
    page.main.changed(at('params.sldd'));
    await until(() => !!releaseFirst);
    page.main.files.set(at('params.sldd'), x2);
    page.main.changed(at('params.sldd'));
    releaseFirst();
    await until(() => shown('params.sldd', 'Ki') === '31');
    expect(reads).toBe(2);
    expect(page.main.reloadAsked).toEqual(['params.sldd']);
    expect(dirtyTabs()).toEqual([]);
  });

  /** The next read of a file held until `release()`, then answered with `bytes`. */
  function holdNextRead(page: Page, bytes: Uint8Array) {
    const read = page.host.readFile;
    const held = { released: false, release: () => {}, reads: 0 };
    let resolveIt!: () => void;
    page.host.readFile = (p) => {
      held.reads++;
      if (held.reads > 1) return read(p);
      return new Promise((resolve) => (resolveIt = () => resolve(bytes.slice())));
    };
    held.release = () => resolveIt();
    return held;
  }

  it("an edit made while a clean tab reads the other program's file is not thrown away: it asks", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const x = await changedOutside(page.main.files.get(at('params.sldd'))!, 'params.sldd', 'Ki', '30');
    page.main.files.set(at('params.sldd'), x);
    const held = holdNextRead(page, x);
    page.main.changed(at('params.sldd'));
    await until(() => held.reads === 1);
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.reloadAnswers.push(false); // Keep My Edits
    held.release();
    await until(() => page.main.reloadAsked.length === 1);
    await settled();
    expect(shown('params.sldd', 'Kp')).toBe('5');
    expect(dirtyTabs()).toEqual(['params.sldd']);
  });

  it('a save another program writes over, while a clean tab reads its file, asks and keeps the edit', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const x1 = await changedOutside(page.main.files.get(at('params.sldd'))!, 'params.sldd', 'Ki', '30');
    const x2 = await changedOutside(x1, 'params.sldd', 'Ki', '31');
    page.main.files.set(at('params.sldd'), x1);
    const held = holdNextRead(page, x1);
    page.main.changed(at('params.sldd'));
    await until(() => held.reads === 1);
    // The user edits and saves while that read is out; another program writes over the save. (The
    // tab row draws a frame later than the app's did: the edit is waited for, so the save's landing
    // is what the wait after it sees.)
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.host.saveFile = async (p) => (page.main.files.set(p, x2), { overwritten: true });
    page.main.reloadAnswers.push(false); // Keep My Edits
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    held.release();
    await until(() => page.main.reloadAsked.length === 1);
    await until(() => dirtyTabs().length === 1);
    expect(shown('params.sldd', 'Kp')).toBe('5');
  });

  it('a file that cannot be read again says so in its banner', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.main.files.delete(at('params.sldd'));
    page.main.changed(at('params.sldd'));
    await until(() => !!tableOf('params.sldd')!.banners?.error);
    expect(tableOf('params.sldd')!.banners?.error).toMatch(/^Failed to reload params\.sldd: ENOENT/);
  });
});

describe('a file changed on disk, for a host with no prompt of its own', () => {
  it("asks in the shell's confirm dialog, saying what keeping a MAT-file's edits costs; Keep My Edits keeps them", async () => {
    const page = startPage(FILES, { without: ['confirmReload'] });
    await open(page, 'ParamMat.mat');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 1);
    await outside(page, 'ParamMat.mat', 'ParamMat', '[9 9 9; 9 9 9]');
    await until(() => confirmDialog().hasAttribute('open'));
    const text = confirmDialog().shadowRoot!.textContent!;
    expect(text).toContain('ParamMat.mat changed on disk.');
    expect(text).toContain("saving writes this MAT-file over the other program's changes, including variables only it changed, which are not marked Modified");
    (await confirmButton('Keep My Edits')).click();
    await settled();
    expect(shown('ParamMat.mat', 'ParamMat')).toBe('[1 2 3; 4 5 7]');
    expect(dirtyTabs()).toEqual(['ParamMat.mat']);
  });

  it("Reload, in the confirm dialog, takes the disk's file", async () => {
    const page = startPage(FILES, { without: ['confirmReload'] });
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    await outside(page, 'params.sldd', 'Kp', '7');
    (await confirmButton('Reload')).click();
    await until(() => shown('params.sldd', 'Kp') === '7' && dirtyTabs().length === 0);
  });
});
