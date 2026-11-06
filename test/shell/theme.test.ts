// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The page's theme (connect/theme.ts): applyTheme writes it where view's theme stylesheet reads it,
// and systemThemeFromMedia reads the system's from the page's media queries for the Settings
// popover's Auto: high contrast under forced colours or a request for more contrast, whatever the
// colour scheme, else dark or light by the colour scheme, and every change of any of them heard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, systemThemeFromMedia } from '../../src/widgets/app-shell/connect/theme.js';

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
