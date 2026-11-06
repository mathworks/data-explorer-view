// Copyright 2026 The MathWorks, Inc.
//
// The shell's navigation (connect/navigation.ts), DOM-free: the places the user visits (a tab
// shown, a row selected), Back and Forward over them, Up and the location bar's segments, and the
// places a closed tab took with it forgotten. The shell does the moves (`show`); this decides
// where to and what counts as a visit. A move the shell makes to a place passes through others on
// the way (a tab shown before its row is selected, which says it arrived at the tab's old row):
// those are no visits, or Back would push them and lose the places ahead.
import { describe, expect, it } from 'vitest';
import { ShellNavigation } from '../../src/widgets/app-shell/connect/navigation.js';
import type { LocationStep, ShellPlace } from '../../src/widgets/app-shell/connect/location.js';

const at = (tabId: string | null, rowId: string | null = null): ShellPlace => ({ tabId, rowId });

/** A shell of tabs, each with a selected row, the navigation over it, and the moves it was asked for. */
function shell(open = ['a', 'b']) {
  const tabs = new Set(open);
  const selection = new Map<string, string | null>();
  let active: string | null = null;
  const shown: ShellPlace[] = [];
  const nav: ShellNavigation = new ShellNavigation({
    here: () => (active === null ? at(null) : at(active, selection.get(active) ?? null)),
    show: (place) => {
      if (place.tabId !== null && !tabs.has(place.tabId)) return false;
      shown.push(place);
      // As the shell does it: the tab first, which arrives at its old row, then the row.
      active = place.tabId;
      nav.visit();
      if (place.tabId !== null) selection.set(place.tabId, place.rowId);
      nav.visit();
      return true;
    },
  });
  /** The user goes to `place` themselves: a click on a tab or a row. */
  const user = (place: ShellPlace) => {
    active = place.tabId;
    if (place.tabId !== null) selection.set(place.tabId, place.rowId);
    nav.visit();
  };
  return { nav, user, shown, tabs, close: (id: string) => (tabs.delete(id), nav.forget(id)) };
}

const steps = (...places: ShellPlace[]): LocationStep[] => places.map((place, i) => ({ label: `s${i}`, place }));

describe('ShellNavigation', () => {
  it('Back and Forward step over the places visited, and say when they can', () => {
    const { nav, user, shown } = shell();
    expect([nav.canBack, nav.canForward]).toEqual([false, false]);
    user(at('a'));
    user(at('a', 'r1'));
    user(at('b'));
    expect([nav.canBack, nav.canForward]).toEqual([true, false]);
    nav.back();
    nav.back();
    expect(shown).toEqual([at('a', 'r1'), at('a')]);
    expect([nav.canBack, nav.canForward]).toEqual([false, true]);
    nav.forward();
    expect(shown.at(-1)).toEqual(at('a', 'r1'));
  });

  it("makes no visit of the places a move passes through, so Back keeps what is ahead", () => {
    const { nav, user } = shell();
    user(at('a', 'r1'));
    user(at('b'));
    user(at('a', 'r2'));
    // Back to b, then to a's r1: showing a arrives at its r2 first, which is no visit.
    nav.back();
    nav.back();
    expect(nav.canForward).toBe(true);
    nav.forward();
    nav.forward();
    expect(nav.canForward).toBe(false);
  });

  it('Up and a segment go where the location bar says, and are visits', () => {
    const { nav, user, shown } = shell();
    user(at('a', 'r2'));
    nav.located({ segments: steps(at(null), at('a'), at('a', 'r1'), at('a', 'r2')), up: at('a', 'r1') });
    expect(nav.canUp).toBe(true);
    nav.up();
    expect(shown.at(-1)).toEqual(at('a', 'r1'));
    nav.toStep(0);
    expect(shown.at(-1)).toEqual(at(null));
    nav.back();
    expect(shown.at(-1)).toEqual(at('a', 'r1'));
    // A segment that is not there goes nowhere.
    nav.toStep(9);
    expect(shown).toHaveLength(3);
    nav.located({ segments: steps(at(null)), up: null });
    expect(nav.canUp).toBe(false);
    nav.up();
    expect(shown).toHaveLength(3);
  });

  it("forgets a closed tab's places: Back does not go to them", () => {
    const { nav, user, close, shown } = shell(['a', 'b', 'c']);
    user(at('a'));
    user(at('c'));
    user(at('b'));
    close('c');
    nav.back();
    expect(shown).toEqual([at('a')]);
    expect(nav.canBack).toBe(false);
  });

  it('quietly() makes the moves it runs no visits, however deep', () => {
    const { nav, user } = shell();
    user(at('a'));
    nav.quietly(() => nav.quietly(() => user(at('b'))));
    expect(nav.canBack).toBe(false);
    user(at('b', 'r'));
    expect(nav.canBack).toBe(true);
  });
});
