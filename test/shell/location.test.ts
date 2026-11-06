// Copyright 2026 The MathWorks, Inc.
//
// Where the user is, as the location bar draws it (connect/location.ts): Root, then the active
// file, then the selected row's parents down to the row (Root › params.sldd › Design Data › Kp),
// each segment the place a press on it goes to; and where Up goes from there: the row's parent,
// then the file (no row), then Root. Pure: the rows are looked up through a function, which in the
// shell reads the active table's rows.
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { locationOf, samePlace } from '../../src/widgets/app-shell/connect/location.js';

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
