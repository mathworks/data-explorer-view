// Copyright 2026 The MathWorks, Inc.
// Unit tests for filterEntries — the pure match/cap rule behind the global
// entry-search overlay. The overlay itself (QuickPick wiring) needs a live
// vscode, so only this pure core is unit-tested; the end-to-end index build is
// covered by test-integration/suite/nameIndex.test.ts.
import { describe, it, expect } from 'vitest';
import { filterEntries } from '../src/model/search/searchFilter.js';
import { searchItem } from '../src/model/search/searchItems.js';
import type { NameRecord } from '../src/model/search/nameExtract.js';

function rec(name: string, sourceLabel = 'data.sldd'): NameRecord {
  return { name, sourceUri: `file:///w/${sourceLabel}`, sourceLabel, kind: 'sldd' };
}

const RECORDS: NameRecord[] = [
  rec('Kp'),
  rec('Ki'),
  rec('gain', 'model.slx'),
  rec('gainSchedule', 'model.slx'),
  rec('Throttle', 'params.sldd'),
];

describe('filterEntries', () => {
  it('returns nothing for an empty or whitespace query (list stays empty until typing)', () => {
    expect(filterEntries(RECORDS, '', 500)).toEqual([]);
    expect(filterEntries(RECORDS, '   ', 500)).toEqual([]);
  });

  it('matches entry names case-insensitively as a substring', () => {
    expect(filterEntries(RECORDS, 'gain', 500).map((r) => r.name)).toEqual([
      'gain',
      'gainSchedule',
    ]);
    // case-insensitive
    expect(filterEntries(RECORDS, 'GAIN', 500).map((r) => r.name)).toEqual([
      'gain',
      'gainSchedule',
    ]);
    // interior substring, not just prefix
    expect(filterEntries(RECORDS, 'chedul', 500).map((r) => r.name)).toEqual(['gainSchedule']);
  });

  it('also matches on the source label so a file name narrows results', () => {
    expect(filterEntries(RECORDS, 'params', 500).map((r) => r.name)).toEqual(['Throttle']);
  });

  it('preserves input order among matches', () => {
    // Query 'i' matches Ki, gain, gainSchedule (Throttle has no 'i', and no source
    // label contains 'i'); the result must follow the input array order.
    expect(filterEntries(RECORDS, 'i', 500).map((r) => r.name)).toEqual([
      'Ki',
      'gain',
      'gainSchedule',
    ]);
  });

  it('caps the result count at `max` (the un-virtualized list guard)', () => {
    const many = Array.from({ length: 1000 }, (_, i) => rec(`sig${i}`));
    const out = filterEntries(many, 'sig', 10);
    expect(out).toHaveLength(10);
    // the cap keeps the first N in input order
    expect(out[0].name).toBe('sig0');
    expect(out[9].name).toBe('sig9');
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterEntries(RECORDS, 'zzz', 500)).toEqual([]);
  });
});

// With one record per BLOCK rather than per name, a model answers `Gain` with a hit for
// every `Gain` it holds — a shipped Simulink demo model has four. The label cannot
// separate them, so the path is searchable too: "the Gain in Controller" has to be
// expressible, and a SUBSYSTEM's own name is otherwise absent from this index entirely
// (a subsystem has no parameter reference of its own to be recorded by).
describe('filterEntries over block records, which repeat their labels', () => {
  const block = (name: string, blockPath: string): NameRecord => ({
    name,
    sourceUri: 'file:///w/aircraft.slx',
    sourceLabel: 'aircraft.slx',
    kind: 'block',
    selectName: blockPath,
    blockPath,
  });
  const BLOCKS: NameRecord[] = [
    block('Gain', 'Gain'),
    block('Gain', 'Controller/Gain'),
    block('Gain', 'Pilot G-force calculation/Gain'),
    block('<SID: 65>', 'Pilot G-force calculation/<SID: 65>'),
  ];

  it('finds every block a system contains, by the system’s name', () => {
    expect(filterEntries(BLOCKS, 'Controller', 500).map((r) => r.blockPath)).toEqual([
      'Controller/Gain',
    ]);
    expect(filterEntries(BLOCKS, 'pilot g-force', 500).map((r) => r.blockPath)).toEqual([
      'Pilot G-force calculation/Gain',
      'Pilot G-force calculation/<SID: 65>',
    ]);
  });

  it('still finds all of them by the name they share', () => {
    // The other half of the same change: keyed by name these three collapsed to ONE hit,
    // which could only ever reveal the first. Each now carries its own path, so the list
    // is three lines the user can choose between.
    expect(filterEntries(BLOCKS, 'gain', 500).map((r) => r.blockPath)).toEqual([
      'Gain',
      'Controller/Gain',
      'Pilot G-force calculation/Gain',
    ]);
  });

  it('finds a block whose label the file left blank, by its stand-in', () => {
    // It used to be dropped from the index outright — an empty name matches nothing.
    expect(filterEntries(BLOCKS, 'sid: 65', 500).map((r) => r.name)).toEqual(['<SID: 65>']);
  });
});

// A list may re-filter the items it is handed, by label and description (VS Code's QuickPick
// does). So a field matched here that the item does not SHOW is a hit the user never sees: it
// passes this filter and is then dropped by the list's own. One rule, two places, and the path
// between them is the one that was missing.
describe('everything matched here is visible on the item a result list shows', () => {
  it('searchItem puts the block path in the item description', () => {
    const blocks: NameRecord[] = [
      { name: 'Gain', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx', kind: 'block', selectName: '1', blockPath: 'Gain' },
      { name: 'Gain', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx', kind: 'block', selectName: '2', blockPath: 'Controller/Inner/Gain' },
      { name: '<SID: 65>', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx', kind: 'block', selectName: '65', blockPath: 'Pilot/<SID: 65>' },
    ];
    for (const query of ['controller', 'inner/gain', 'sid: 65', 'm.slx']) {
      const items = filterEntries(blocks, query, 500).map(searchItem);
      expect(items.length, query).toBeGreaterThan(0);
      for (const item of items) expect(`${item.label} ${item.description}`.toLowerCase(), query).toContain(query);
    }
  });
});
