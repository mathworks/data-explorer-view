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

// The documents' area splits in two, side by side: each pane its own row of tabs and the tab it
// shows, one of them focused, whose shown tab is the active one the toolbar, the location bar and
// the inspector follow. What it protects: a file open in exactly one tab, wherever the tab is; a
// new tab in the pane the user is in; a pane that empties going, so no pane stands with nothing to
// show; and a split to the left that lands on the left.
describe('TabList panes', () => {
  /** Each pane's tabs, left to right, and the one it shows. */
  const panes = (t: TabList<string>) => t.panes.map((p) => [p.items.join(''), p.shown]);

  it('starts with one pane, focused, holding every tab', () => {
    const t = list('a', 'b');
    expect(panes(t)).toEqual([['ab', 'b']]);
    expect(t.focused).toBe(0);
    expect(t.paneOf('a')).toBe(0);
    expect(t.paneOf('z')).toBe(-1);
  });

  it('splits a tab into a new pane on the right, which is focused and shows it', () => {
    const t = list('a', 'b', 'c');
    t.activate('b');
    expect(t.split('b', 'right')).toBe(true);
    expect(panes(t)).toEqual([['ac', 'c'], ['b', 'b']]);
    expect(t.focused).toBe(1);
    expect(t.active).toBe('b');
    // Every tab, pane by pane.
    expect(t.items).toEqual(['a', 'c', 'b']);
    expect(t.activeIndex).toBe(2);
  });

  it('splits to the left onto the left: the new pane comes first, the tabs there were on its right', () => {
    const t = list('a', 'b', 'c');
    expect(t.split('a', 'left')).toBe(true);
    expect(panes(t)).toEqual([['a', 'a'], ['bc', 'c']]);
    expect(t.focused).toBe(0);
    expect(t.active).toBe('a');
  });

  it("splits nothing out of a pane's only tab, and makes no third pane", () => {
    const t = list('a');
    expect(t.splits('a', 'right')).toBe(false);
    expect(t.split('a', 'right')).toBe(false);
    expect(panes(t)).toEqual([['a', 'a']]);
    const two = list('a', 'b', 'c');
    two.split('c', 'right');
    // With two panes a split goes into the pane on that side: the tab joins it.
    expect(two.splits('a', 'right')).toBe(true);
    expect(two.splits('c', 'right')).toBe(false);
    expect(two.split('a', 'right')).toBe(true);
    expect(panes(two)).toEqual([['b', 'b'], ['ca', 'a']]);
    expect(two.panes.length).toBe(2);
  });

  it('adds a new tab to the focused pane, at its end, and shows it there', () => {
    const t = list('a', 'b', 'c');
    t.split('b', 'right');
    t.add('d');
    expect(panes(t)).toEqual([['ac', 'c'], ['bd', 'd']]);
    t.activate('a');
    expect(t.focused).toBe(0);
    t.add('e');
    expect(panes(t)).toEqual([['ace', 'e'], ['bd', 'd']]);
  });

  it('activates a tab in the other pane by focusing that pane; each pane keeps the tab it shows', () => {
    const t = list('a', 'b', 'c');
    t.split('b', 'right');
    expect(t.activate('a')).toBe(true);
    expect([t.focused, t.active]).toEqual([0, 'a']);
    expect(panes(t)).toEqual([['ac', 'a'], ['b', 'b']]);
    // The other pane's shown tab, active again.
    expect(t.activate('b')).toBe(true);
    expect(t.activate('b')).toBe(false);
  });

  it('focuses a pane by its index, and says whether the active tab changed', () => {
    const t = list('a', 'b');
    t.split('b', 'right');
    expect(t.focus(0)).toBe(true);
    expect(t.active).toBe('a');
    expect(t.focus(0)).toBe(false);
    expect(t.focus(1)).toBe(true);
    expect(t.active).toBe('b');
    // No such pane.
    expect(t.focus(2)).toBe(false);
    expect(t.focus(-1)).toBe(false);
    expect(list().focus(0)).toBe(false);
  });

  it('moves a tab into the other pane at an index, shown and focused there', () => {
    const t = list('a', 'b', 'c', 'd');
    t.split('d', 'right');
    expect(t.moveTo('a', 1, 0)).toBe(true);
    expect(panes(t)).toEqual([['bc', 'c'], ['ad', 'a']]);
    expect([t.focused, t.active]).toEqual([1, 'a']);
    // At the end with no index, and an index past the end held to it.
    t.moveTo('b', 1);
    t.moveTo('c', 1, 99);
    // The pane it left emptied, and went: one pane, holding every tab.
    expect(panes(t)).toEqual([['adbc', 'c']]);
    expect(t.focused).toBe(0);
  });

  it('moves along its own pane, the shown tab kept, and shows a tab dropped on its own pane', () => {
    const t = list('a', 'b', 'c');
    t.split('c', 'right');
    t.activate('a');
    expect(t.moveTo('b', 0, 0)).toBe(true);
    expect(panes(t)).toEqual([['ba', 'a'], ['c', 'c']]);
    // No index: the tab shown where it is.
    expect(t.moveTo('b', 0)).toBe(true);
    expect(t.active).toBe('b');
    expect(t.moveTo('b', 0)).toBe(false);
    expect(t.moveTo('z', 0)).toBe(false);
    expect(t.moveTo('b', 5)).toBe(false);
  });

  it("closing a pane's last tab removes the pane, and the other takes the focus", () => {
    const t = list('a', 'b', 'c');
    t.split('c', 'right');
    t.remove('c');
    expect(panes(t)).toEqual([['ab', 'b']]);
    expect([t.focused, t.active]).toEqual([0, 'b']);
    // The left pane empties while the right one is focused: the right one, now the only one, stays focused.
    const u = list('a', 'b', 'c');
    u.split('a', 'left');
    u.activate('c');
    expect(u.focused).toBe(1);
    u.remove('a');
    expect(panes(u)).toEqual([['bc', 'c']]);
    expect([u.focused, u.active]).toEqual([0, 'c']);
  });

  it("closing a tab of the pane not focused leaves the active tab as it was", () => {
    const t = list('a', 'b', 'c');
    t.split('c', 'right');
    t.remove('a');
    expect(panes(t)).toEqual([['b', 'b'], ['c', 'c']]);
    expect(t.active).toBe('c');
  });

  it('cycles within the focused pane, and moves within it', () => {
    const t = list('a', 'b', 'c', 'd');
    t.split('c', 'right');
    t.add('e');
    expect(t.cycle(1)).toBe(true);
    expect(t.active).toBe('c');
    expect(t.cycle(1)).toBe(true);
    expect(t.active).toBe('e');
    t.focus(0);
    expect(t.active).toBe('d');
    t.cycle(1);
    expect(t.active).toBe('a');
    expect(t.move('a', 2)).toBe(true);
    expect(panes(t)).toEqual([['bda', 'a'], ['ce', 'e']]);
  });

  it('at Root shows nothing and keeps each pane as it was, for the first tab activated or the pane focused', () => {
    const t = list('a', 'b', 'c');
    t.split('c', 'right');
    t.deactivate();
    expect(t.active).toBeUndefined();
    expect(panes(t)).toEqual([['ab', 'b'], ['c', 'c']]);
    expect(t.focus(0)).toBe(true);
    expect(t.active).toBe('b');
    t.deactivate();
    expect(t.activate('c')).toBe(true);
    expect(t.focused).toBe(1);
  });
});
