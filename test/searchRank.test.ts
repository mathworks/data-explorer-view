// Copyright 2026 The MathWorks, Inc.
//
// The app shell's ranked search over entry names (search/searchRank.ts), as the prototype ranked its
// own: a match on the name, the value or the data type, a prefix before a substring before a fuzzy
// match, the best first, and a cap. What this protects is the ORDER, since a person types a few
// letters and presses Enter on the first row:
//
//   - the strength of the match first: a name, value or type that begins with the query, then one
//     that holds it, then a name that holds its letters in order (a fuzzy match: "kpg" is Kp_gain);
//   - within a strength, the name before the value before the type, and the place an entry is in
//     (its block's path, its file's name) last, as the extension's filter matches it;
//   - within the same strength and field, the order the records came in (by name, then by file);
//   - the cap applies after the ranking, so a broad query keeps its best matches rather than the
//     first records it happened to reach.
//
// And that the search the VS Code extension runs (searchEntries) is not this one: its order and its
// matches stay its own.
import { describe, expect, it } from 'vitest';
import type { NameRecord } from '../src/model/search/nameExtract.js';
import { rankEntries, searchRanked } from '../src/model/search/searchRank.js';
import { searchEntries, searchItem } from '../src/model/search/searchItems.js';

const rec = (name: string, extra: Partial<NameRecord> = {}): NameRecord => ({
  name,
  sourceUri: 'file:///w/params.sldd',
  sourceLabel: 'params.sldd',
  kind: 'sldd',
  ...extra,
});
const names = (records: readonly NameRecord[]): string[] => records.map((r) => r.name);

describe('rankEntries', () => {
  it('finds nothing for an empty query', () => {
    expect(rankEntries([rec('Kp')], '   ', 50)).toEqual([]);
  });

  it('puts a prefix of the name before a substring, and a substring before a fuzzy match', () => {
    const records = [rec('Kp_gain'), rec('MyGain'), rec('Gain'), rec('GxAxIxN'), rec('Other')];
    expect(names(rankEntries(records, 'gain', 50))).toEqual(['Gain', 'Kp_gain', 'MyGain', 'GxAxIxN']);
  });

  it('matches the value and the data type and the class as strongly, after the name at the same strength', () => {
    const records = [
      rec('Speed', { value: '120', dataType: 'double', className: 'Simulink.Parameter' }),
      rec('Gear', { value: '3', dataType: 'int8', className: 'Simulink.Parameter' }),
      rec('int8Limit', { value: '127', dataType: 'double', className: 'double' }),
      rec('Unrelated', { value: '0', dataType: 'single', className: 'single' }),
    ];
    // "int8": a name that begins with it, then a type that does.
    expect(names(rankEntries(records, 'int8', 50))).toEqual(['int8Limit', 'Gear']);
    // "12": the values of Speed and of int8Limit begin with it, in the records' order.
    expect(names(rankEntries(records, '12', 50))).toEqual(['Speed', 'int8Limit']);
    // "parameter": a substring of the class, for every parameter.
    expect(names(rankEntries(records, 'parameter', 50))).toEqual(['Speed', 'Gear']);
  });

  it("takes a value's or a type's letters in order for no match: a fuzzy match is the name's alone", () => {
    // "dbl" is in the order of "double", and of nothing's name.
    expect(rankEntries([rec('Speed', { dataType: 'double', value: '[1 2 3]' })], 'dbl', 50)).toEqual([]);
    expect(rankEntries([rec('Speed', { value: '[1 2 3]' })], '13', 50)).toEqual([]);
  });

  it("matches where an entry is (its block's path, its file's name) last, as a substring", () => {
    const records = [
      rec('Gain', { kind: 'block', blockPath: 'Controller/Gain', selectName: '7', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx' }),
      rec('Kick', { kind: 'block', blockPath: 'Controller/Kick', selectName: '9', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx' }),
      rec('Controls'),
    ];
    expect(names(rankEntries(records, 'contr', 50))).toEqual(['Controls', 'Gain', 'Kick']);
    expect(names(rankEntries([rec('Kp'), rec('Ki', { sourceLabel: 'other.sldd' })], 'other', 50))).toEqual(['Ki']);
  });

  it('keeps the order the records came in, within one strength and field', () => {
    const records = [rec('Kb'), rec('Ka'), rec('Kc')];
    expect(names(rankEntries(records, 'k', 50))).toEqual(['Kb', 'Ka', 'Kc']);
  });

  it('caps after ranking: the best matches stay, wherever they were in the records', () => {
    const records = [...Array.from({ length: 10 }, (_, i) => rec(`xKp${i}`)), rec('Kp')];
    expect(names(rankEntries(records, 'kp', 3))).toEqual(['Kp', 'xKp0', 'xKp1']);
  });

  it('ignores case, and the spaces around the query', () => {
    expect(names(rankEntries([rec('KpGain')], '  KPG ', 50))).toEqual(['KpGain']);
  });
});

describe('searchRanked', () => {
  it("gives each match as a result row, naming what it is: its class, else its data type", () => {
    const items = searchRanked([rec('Kp', { dataType: 'double' }), rec('Ki')], 'k', 50);
    expect(items.map((i) => [i.label, i.type])).toEqual([
      ['Kp', 'double'],
      ['Ki', undefined],
    ]);
    expect(searchRanked([rec('Speed', { value: '1', dataType: 'double', className: 'Simulink.Parameter' })], 'sp', 50)[0]!.type).toBe('Simulink.Parameter');
  });

  it("leaves the extension's search as it was: a record with no value or type reads as searchItem made it", () => {
    const records = [rec('Kp'), rec('xK')];
    expect(searchRanked(records, 'k', 50)).toEqual(records.map(searchItem));
    // The extension's filter keeps the records' order and finds no fuzzy match.
    expect(searchEntries([rec('xK'), rec('Kp'), rec('Kxp')], 'kp').map((i) => i.label)).toEqual(['Kp']);
  });
});
