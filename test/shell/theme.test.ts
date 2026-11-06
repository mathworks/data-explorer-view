// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The page's theme (connect/theme.ts): applyTheme writes it where view's theme stylesheet reads it,
// and systemThemeFromMedia reads the system's from the page's media queries for the Settings
// popover's Auto: high contrast under forced colours or a request for more contrast, whatever the
// colour scheme, else dark or light by the colour scheme, and every change of any of them heard.
// settableSystemTheme lets a host tell the theme after the shell connects (Electron's nativeTheme
// arrives over IPC, after the page is up): once told, the source is no longer heeded.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '../../src/model/shell/settings.js';
import { applyTheme, settableSystemTheme, systemThemeFromMedia } from '../../src/widgets/app-shell/connect/theme.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

/** A matchMedia whose queries match as `matching` says, and which can say they changed. */
function fakeMedia(matching: Set<string>) {
  const lists = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = { listeners: new Set<() => void>() } as { matches: boolean; listeners: Set<() => void>; addEventListener: unknown; removeEventListener: unknown };
    Object.defineProperty(list, 'matches', { get: () => matching.has(query) });
    list.addEventListener = (_: string, l: () => void) => list.listeners.add(l);
    list.removeEventListener = (_: string, l: () => void) => list.listeners.delete(l);
    lists.set(query, list);
    return list;
  });
  return {
    change(query: string, on: boolean) {
      if (on) matching.add(query);
      else matching.delete(query);
      for (const l of lists.get(query)?.listeners ?? []) l();
    },
    listening: () => [...lists.values()].reduce((n, l) => n + l.listeners.size, 0),
  };
}

describe('applyTheme', () => {
  it("sets the root element's data-theme", () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('systemThemeFromMedia', () => {
  it('is light by default, dark under a dark scheme, and high contrast over either', () => {
    const media = fakeMedia(new Set());
    const system = systemThemeFromMedia();
    expect(system.now()).toBe('light');
    media.change('(prefers-color-scheme: dark)', true);
    expect(system.now()).toBe('dark');
    media.change('(prefers-contrast: more)', true);
    expect(system.now()).toBe('high-contrast');
    media.change('(prefers-contrast: more)', false);
    media.change('(forced-colors: active)', true);
    expect(system.now()).toBe('high-contrast');
  });

  it('tells a listener the theme each change leaves, until it stops listening', () => {
    const media = fakeMedia(new Set());
    const heard: string[] = [];
    const stop = systemThemeFromMedia().on((t) => heard.push(t));
    expect(media.listening()).toBe(3);
    media.change('(prefers-color-scheme: dark)', true);
    media.change('(forced-colors: active)', true);
    stop();
    expect(media.listening()).toBe(0);
    media.change('(forced-colors: active)', false);
    expect(heard).toEqual(['dark', 'high-contrast']);
  });

  it('is light on a page without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const system = systemThemeFromMedia();
    expect(system.now()).toBe('light');
    expect(() => system.on(() => {})()).not.toThrow();
  });
});

describe('settableSystemTheme', () => {
  /** A system theme source a test moves, as the page's media queries would. */
  function source(initial: Theme) {
    let now = initial;
    const listeners = new Set<(t: Theme) => void>();
    return {
      now: () => now,
      on: (l: (t: Theme) => void) => (listeners.add(l), () => void listeners.delete(l)),
      move(t: Theme) {
        now = t;
        for (const l of listeners) l(t);
      },
      listening: () => listeners.size,
    };
  }

  it("is the source's theme, and tells its changes, until a host tells one", () => {
    const media = source('light');
    const system = settableSystemTheme(media);
    const heard: Theme[] = [];
    system.on((t) => heard.push(t));
    expect(system.now()).toBe('light');
    media.move('dark');
    expect(system.now()).toBe('dark');
    expect(heard).toEqual(['dark']);
  });

  it('is what the host tells from then on: the source no longer heeded, so the two never take turns', () => {
    const media = source('light');
    const system = settableSystemTheme(media);
    const heard: Theme[] = [];
    system.on((t) => heard.push(t));
    system.set('high-contrast');
    expect(system.now()).toBe('high-contrast');
    media.move('dark');
    expect(system.now()).toBe('high-contrast');
    system.set('dark');
    expect(heard).toEqual(['high-contrast', 'dark']);
  });

  it('tells a change only: the theme it already is, told again, is no change', () => {
    const system = settableSystemTheme(source('dark'));
    const heard: Theme[] = [];
    system.on((t) => heard.push(t));
    system.set('dark');
    system.set('light');
    system.set('light');
    expect(heard).toEqual(['light']);
  });

  it('passes over what is no theme, as a host in plain JavaScript may tell', () => {
    const system = settableSystemTheme(source('dark'));
    system.set('Dark' as Theme);
    system.set(undefined as unknown as Theme);
    expect(system.now()).toBe('dark');
  });

  it('stops telling a listener once it stops, and lets go of the source', () => {
    const media = source('light');
    const system = settableSystemTheme(media);
    const heard: Theme[] = [];
    const stop = system.on((t) => heard.push(t));
    expect(media.listening()).toBe(1);
    stop();
    expect(media.listening()).toBe(0);
    media.move('dark');
    system.set('high-contrast');
    expect(heard).toEqual([]);
  });
});
