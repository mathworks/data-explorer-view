// Copyright 2026 The MathWorks, Inc.
//
// The shell's open tabs and the active one (connect/tabs.ts, lifted from data-explorer-app's
// tabList, whose cases these are), and the two moves the shell's parts added: a tab dragged along
// the row (dex-tab-move's index is where the tab is once moved), and no tab active (the Explorer's
// Root) while tabs stay open.
import { describe, expect, it } from 'vitest';
import { TabList } from '../../src/widgets/app-shell/connect/tabs.js';

const list = (...items: string[]) => {
  const t = new TabList<string>();
  for (const i of items) t.add(i);
  return t;
};

describe('TabList', () => {
  it('makes the added tab active', () => {
    const t = list('a', 'b');
    expect(t.active).toBe('b');
    expect(t.activate('a')).toBe(true);
    expect(t.activate('a')).toBe(false);
  });

  it('closing the active tab activates the one to its right, or the new last', () => {
    const t = list('a', 'b', 'c');
    t.activate('b');
    t.remove('b');
    expect(t.active).toBe('c');
    t.remove('c');
    expect(t.active).toBe('a');
    t.remove('a');
    expect(t.active).toBeUndefined();
    expect(t.activeIndex).toBe(-1);
  });

  it('closing a tab to the left keeps the active one', () => {
    const t = list('a', 'b', 'c');
    t.remove('a');
    expect(t.active).toBe('c');
  });

  it('cycles in both directions, wrapping, and says whether the active tab changed', () => {
    const t = list('a', 'b', 'c');
    expect(t.cycle(1)).toBe(true);
    expect(t.active).toBe('a');
    t.cycle(-1);
    expect(t.active).toBe('c');
    expect(new TabList<string>().cycle(1)).toBe(false);
    // One tab: there is nowhere to go.
    expect(list('a').cycle(1)).toBe(false);
  });
});

describe('TabList.move: where dex-tab-move puts a tab', () => {
  it('takes the tab out and puts it in at the index, which is its place once moved', () => {
    const t = list('a', 'b', 'c', 'd');
    // Dropped on d, from the left: it ends up last, where d was.
    expect(t.move('a', 3)).toBe(true);
    expect(t.items).toEqual(['b', 'c', 'd', 'a']);
    // Dropped on b, from the right: first.
    t.move('d', 0);
    expect(t.items).toEqual(['d', 'b', 'c', 'a']);
  });

  it('keeps the active tab active, whichever tab moves', () => {
    const t = list('a', 'b', 'c');
    t.activate('b');
    t.move('a', 2);
    expect(t.items).toEqual(['b', 'c', 'a']);
    expect(t.active).toBe('b');
    t.move('b', 2);
    expect(t.active).toBe('b');
    expect(t.activeIndex).toBe(2);
  });

  it('holds an index past either end to the row, and moves nothing for a tab not in it or already there', () => {
    const t = list('a', 'b', 'c');
    t.move('a', 99);
    expect(t.items).toEqual(['b', 'c', 'a']);
    t.move('a', -5);
    expect(t.items).toEqual(['a', 'b', 'c']);
    expect(t.move('a', 0)).toBe(false);
    expect(t.move('z', 1)).toBe(false);
    expect(t.items).toEqual(['a', 'b', 'c']);
  });
});

describe('TabList.deactivate: the Explorer\'s Root', () => {
  it('leaves every tab open with none active, until one is activated, added, or cycled to', () => {
    const t = list('a', 'b', 'c');
    expect(t.deactivate()).toBe(true);
    expect(t.deactivate()).toBe(false);
    expect(t.active).toBeUndefined();
    expect(t.items).toEqual(['a', 'b', 'c']);
    // A tab closed meanwhile activates nothing.
    t.remove('b');
    expect(t.active).toBeUndefined();
    t.cycle(1);
    expect(t.active).toBe('a');
    t.deactivate();
    t.cycle(-1);
    expect(t.active).toBe('c');
    t.deactivate();
    t.add('d');
    expect(t.active).toBe('d');
  });
});
