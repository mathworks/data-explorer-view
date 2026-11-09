// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Where the user is, as the location bar draws it (connect/location.ts): Root, then the active
// file, then the selected row's parents down to the row (Root › params.sldd › Design Data › Kp),
// each segment the place a press on it goes to; and where Up goes from there: the row's parent,
// then the file (no row), then Root. locationOf is pure: the rows are looked up through a
// function, which in the shell reads the active table's rows.
//
// Then the bar connected: it follows the selection and the active tab, Back and Forward step over
// the places visited (a selection, a tab made active), Up climbs, a segment goes where it names,
// and a closed tab's places are forgotten.
import { afterEach, describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { locationOf, samePlace } from '../../src/widgets/app-shell/connect/location.js';
import { docTabs, graphShown, locationBar, open, selectRow, startPage, tabIdOf, tableOf, until } from './harness.js';

const row = (ID: string, parent: string | null, label: string, iconId?: string): TreeTableRow =>
  ({ ID, parent, Name: { label, ...(iconId ? { iconId } : {}) } }) as TreeTableRow;
const ROWS = new Map(
  [
    row('section:design', null, 'Design Data', 'dictionary_section'),
    row('e:Bus', 'section:design', 'Bus', 'bus'),
    row('e:Bus/a', 'e:Bus', 'a', 'busElement'),
  ].map((r) => [r.ID, r]),
);
const rowOf = (id: string) => ROWS.get(id);
const TAB = { id: 't1', name: 'params.sldd', path: '/w/params.sldd' };

describe('locationOf', () => {
  it('at Root: the one segment, and nowhere up', () => {
    const at = locationOf(null, null, rowOf);
    expect(at.segments).toEqual([{ label: 'Root', icon: 'simulink_folder', place: { tabId: null, rowId: null } }]);
    expect(at.up).toBeNull();
  });

  it('on a file with nothing selected: Root and the file, its path the tooltip; up is Root', () => {
    const at = locationOf(TAB, null, rowOf);
    expect(at.segments.map((s) => [s.label, s.icon, s.title])).toEqual([
      ['Root', 'simulink_folder', undefined],
      ['params.sldd', 'simulinkDataDictionary_FT', '/w/params.sldd'],
    ]);
    expect(at.segments[1]!.place).toEqual({ tabId: 't1', rowId: null });
    expect(at.up).toEqual({ tabId: null, rowId: null });
  });

  it("on a row: its parents down to it, each with its own icon and place; up is the row's parent", () => {
    const at = locationOf(TAB, 'e:Bus/a', rowOf);
    expect(at.segments.map((s) => [s.label, s.icon])).toEqual([
      ['Root', 'simulink_folder'],
      ['params.sldd', 'simulinkDataDictionary_FT'],
      ['Design Data', 'dictionary_section'],
      ['Bus', 'bus'],
      ['a', 'busElement'],
    ]);
    expect(at.segments.map((s) => s.place.rowId)).toEqual([null, null, 'section:design', 'e:Bus', 'e:Bus/a']);
    expect(at.segments.slice(1).every((s) => s.place.tabId === 't1')).toBe(true);
    expect(at.up).toEqual({ tabId: 't1', rowId: 'e:Bus' });
  });

  it('on a top-level row: up is the file', () => {
    expect(locationOf(TAB, 'section:design', rowOf).up).toEqual({ tabId: 't1', rowId: null });
  });

  it('on a row it cannot find: the file, as for no row, and up from it the file', () => {
    const at = locationOf(TAB, 'gone', rowOf);
    expect(at.segments.map((s) => s.label)).toEqual(['Root', 'params.sldd']);
    expect(at.up).toEqual({ tabId: 't1', rowId: null });
  });

  it('stops at a parent it cannot find, and at a parent chain that loops', () => {
    const loop = new Map([row('a', 'b', 'A'), row('b', 'a', 'B')].map((r) => [r.ID, r]));
    expect(locationOf(TAB, 'a', (id) => loop.get(id)).segments.map((s) => s.label)).toEqual(['Root', 'params.sldd', 'B', 'A']);
    const orphan = new Map([row('x', 'missing', 'X')].map((r) => [r.ID, r]));
    const at = locationOf(TAB, 'x', (id) => orphan.get(id));
    expect(at.segments.map((s) => s.label)).toEqual(['Root', 'params.sldd', 'X']);
    expect(at.up).toEqual({ tabId: 't1', rowId: 'missing' });
  });

  it('names Root as the app does', () => {
    expect(locationOf(null, null, rowOf, 'Workspace').segments[0]!.label).toBe('Workspace');
  });
});

describe('samePlace', () => {
  it('is the same tab and the same row', () => {
    expect(samePlace({ tabId: 't1', rowId: 'a' }, { tabId: 't1', rowId: 'a' })).toBe(true);
    expect(samePlace({ tabId: 't1', rowId: 'a' }, { tabId: 't1', rowId: null })).toBe(false);
    expect(samePlace({ tabId: null, rowId: null }, { tabId: 't1', rowId: null })).toBe(false);
  });
});

describe('the location bar, connected', () => {
  afterEach(() => Reflect.deleteProperty(navigator, 'platform'));
  const labels = () => locationBar().segments.map((seg) => seg.label).join(' › ');
  const go = (to: 'back' | 'forward' | 'up' | number) =>
    locationBar().dispatchEvent(new CustomEvent('dex-location-go', { detail: { to }, bubbles: true, composed: true }));
  const selected = (name: string) => tableOf(name)!.selectedRowIds.join();
  const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };

  it("is the shell's location row, and says where the selection is", async () => {
    const page = startPage(FILES);
    expect(locationBar().slot).toBe('location');
    await until(() => labels() === 'Root');
    await open(page, 'params.sldd');
    await until(() => labels() === 'Root › params.sldd');
    expect(locationBar().canUp).toBe(true);
    await selectRow('params.sldd', 'Kp');
    await until(() => labels() === 'Root › params.sldd › Design Data › Kp');
    expect(locationBar().segments.map((seg) => seg.icon)).toEqual(['simulink_folder', 'simulinkDataDictionary_FT', 'databaseFolderDesign', 'wsDefault']);
  });

  it('Back and Forward step over the rows selected and the tabs shown, and their buttons say when they can', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(() => labels().endsWith('ParamMat.mat › ParamMat'));
    docTabs().dispatchEvent(new CustomEvent('dex-tab-select', { detail: { id: tabIdOf('params.sldd') }, bubbles: true, composed: true }));
    await until(() => labels() === 'Root › params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => labels().endsWith('Kp'));
    expect(locationBar().canBack).toBe(true);
    expect(locationBar().canForward).toBe(false);
    go('back');
    await until(() => labels() === 'Root › params.sldd' && selected('params.sldd') === '');
    go('back');
    await until(() => labels() === 'Root › ParamMat.mat › ParamMat' && docTabs().active === tabIdOf('ParamMat.mat'));
    expect(locationBar().canForward).toBe(true);
    go('forward');
    go('forward');
    await until(() => labels() === 'Root › params.sldd › Design Data › Kp' && docTabs().active === tabIdOf('params.sldd'));
    expect(locationBar().canForward).toBe(false);
  });

  it('Up goes to the parent row, then the file, then Root, where it can go no further', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => labels().endsWith('Kp'));
    go('up');
    await until(() => selected('params.sldd') === 'section:design' && labels().endsWith('Design Data'));
    go('up');
    await until(() => selected('params.sldd') === '' && labels() === 'Root › params.sldd');
    go('up');
    await until(() => labels() === 'Root' && graphShown());
    expect(locationBar().canUp).toBe(false);
    // And Back returns from Root to the file.
    go('back');
    await until(() => labels() === 'Root › params.sldd' && !graphShown());
  });

  it('a segment goes to the place it names', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => labels().endsWith('Kp'));
    go(2);
    await until(() => selected('params.sldd') === 'section:design');
    go(0);
    await until(graphShown);
  });

  it("forgets a closed tab's places: Back does not go to it", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => docTabs().active === tabIdOf('ParamMat.mat'));
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(() => labels().endsWith('› ParamMat'));
    page.command('close-tab');
    await until(() => labels() === 'Root › params.sldd');
    expect(locationBar().canBack).toBe(false);
  });

  it('answers Alt+Left, Alt+Right and Alt+Up', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(() => labels().endsWith('Kp'));
    const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
    press('ArrowUp');
    await until(() => selected('params.sldd') === 'section:design');
    press('ArrowLeft');
    await until(() => selected('params.sldd') === tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')!.ID);
    press('ArrowRight');
    await until(() => selected('params.sldd') === 'section:design');
  });
});
