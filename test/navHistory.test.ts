// Copyright 2026 The MathWorks, Inc.
//
// The app shell's back/forward history (src/model/shell/navHistory.ts): the places a person has
// been, in order, with Back and Forward stepping over them as a browser's do.
//
// What it protects: Back and Forward that go where a person expects (a new place after Back is a
// new branch, so Forward has nowhere to go; landing on the place already shown is not a step of
// its own, or Back would seem to do nothing); a history that cannot grow without bound over a long
// session; and one that a closed tab cannot leave pointing at a place that is gone.
import { describe, expect, it } from 'vitest';
import { NavHistory } from '../src/model/shell/navHistory.js';

interface Place {
  tab: string;
  node: string;
}

const same = (a: Place, b: Place): boolean => a.tab === b.tab && a.node === b.node;
const at = (tab: string, node: string): Place => ({ tab, node });

describe('NavHistory', () => {
  it('steps back and forward over the places visited', () => {
    const history = new NavHistory<Place>(same);
    expect(history.current).toBeUndefined();
    expect(history.canBack).toBe(false);
    expect(history.canForward).toBe(false);
    expect(history.back()).toBeUndefined();

    history.visit(at('a', '1'));
    history.visit(at('a', '2'));
    history.visit(at('b', '1'));
    expect(history.current).toEqual(at('b', '1'));
    expect(history.canBack).toBe(true);
    expect(history.canForward).toBe(false);

    expect(history.back()).toEqual(at('a', '2'));
    expect(history.back()).toEqual(at('a', '1'));
    expect(history.canBack).toBe(false);
    expect(history.back()).toBeUndefined();
    expect(history.current).toEqual(at('a', '1'));

    expect(history.forward()).toEqual(at('a', '2'));
    expect(history.forward()).toEqual(at('b', '1'));
    expect(history.canForward).toBe(false);
    expect(history.forward()).toBeUndefined();
    expect(history.current).toEqual(at('b', '1'));
  });

  it('drops the forward list on a visit after back', () => {
    const history = new NavHistory<Place>(same);
    history.visit(at('a', '1'));
    history.visit(at('a', '2'));
    history.visit(at('a', '3'));
    history.back();
    history.back();
    history.visit(at('b', '1'));
    expect(history.canForward).toBe(false);
    expect(history.back()).toEqual(at('a', '1'));
    expect(history.forward()).toEqual(at('b', '1'));
    expect(history.forward()).toBeUndefined();
  });

  it('does not push the current place twice', () => {
    const history = new NavHistory<Place>(same);
    history.visit(at('a', '1'));
    history.visit(at('a', '2'));
    history.visit({ tab: 'a', node: '2' });
    expect(history.back()).toEqual(at('a', '1'));
    // Nor does arriving back on the current place drop the forward list.
    history.visit(at('a', '1'));
    expect(history.canForward).toBe(true);
    expect(history.forward()).toEqual(at('a', '2'));
  });

  it('drops the oldest place past the limit', () => {
    const history = new NavHistory<Place>(same, 3);
    for (const node of ['1', '2', '3', '4', '5']) history.visit(at('a', node));
    expect(history.back()).toEqual(at('a', '4'));
    expect(history.back()).toEqual(at('a', '3'));
    expect(history.back()).toBeUndefined();
  });

  it('keeps 100 places by default', () => {
    const history = new NavHistory<Place>(same);
    for (let n = 0; n < 150; n++) history.visit(at('a', String(n)));
    let steps = 0;
    while (history.back() !== undefined) steps++;
    expect(steps).toBe(99);
    expect(history.current).toEqual(at('a', '50'));
  });

  it('prunes the places it is told to forget, and keeps current on a surviving place', () => {
    const history = new NavHistory<Place>(same);
    history.visit(at('a', '1'));
    history.visit(at('b', '1'));
    history.visit(at('a', '2'));
    history.visit(at('b', '2'));
    history.visit(at('a', '3'));
    history.back();
    history.back();
    expect(history.current).toEqual(at('a', '2'));

    // A tab that is not current closes: current stays where it was.
    history.prune((place) => place.tab !== 'b');
    expect(history.current).toEqual(at('a', '2'));
    expect(history.back()).toEqual(at('a', '1'));
    expect(history.back()).toBeUndefined();
    expect(history.forward()).toEqual(at('a', '2'));
    expect(history.forward()).toEqual(at('a', '3'));
    expect(history.forward()).toBeUndefined();
  });

  it('moves current to the place before it when its own place is pruned', () => {
    const history = new NavHistory<Place>(same);
    history.visit(at('a', '1'));
    history.visit(at('b', '1'));
    history.visit(at('c', '1'));
    history.back();
    history.prune((place) => place.tab !== 'b');
    expect(history.current).toEqual(at('a', '1'));
    expect(history.canBack).toBe(false);
    expect(history.forward()).toEqual(at('c', '1'));

    // With nothing before it, to the place after it; with nothing left, to no place at all.
    history.back();
    history.prune((place) => place.tab !== 'a');
    expect(history.current).toEqual(at('c', '1'));
    history.prune(() => false);
    expect(history.current).toBeUndefined();
    expect(history.canBack).toBe(false);
    expect(history.canForward).toBe(false);
  });

  it('merges the places a prune leaves side by side when they are the same', () => {
    const history = new NavHistory<Place>(same);
    history.visit(at('a', '1'));
    history.visit(at('b', '1'));
    history.visit(at('a', '1'));
    history.prune((place) => place.tab !== 'b');
    expect(history.current).toEqual(at('a', '1'));
    // One step, not two that land on the same place: Back would otherwise seem to do nothing.
    expect(history.canBack).toBe(false);
  });
});
