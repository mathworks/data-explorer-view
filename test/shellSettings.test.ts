// Copyright 2026 The MathWorks, Inc.
//
// The app shell's settings (src/model/shell/settings.ts): the theme and the toolbar's density, read
// from and written to a key-value store (an app passes its localStorage), and the theme a setting
// of 'auto' comes to.
//
// What it protects: an app that starts whatever the store holds or does. A page where storage is
// refused (a sandboxed frame, a privacy mode, a full quota) throws on every access; a store an
// older version or a hand edit wrote holds values this version does not know. Neither may stop the
// shell from coming up, and one bad field may not cost a good one.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  effectiveTheme,
  readSettings,
  writeSettings,
  type KeyValueStore,
} from '../src/model/shell/settings.js';

const KEY = 'dex-shell-settings';

/** A store over a Map, as localStorage behaves. */
function memoryStore(entries: Record<string, string> = {}): KeyValueStore & { entries: Map<string, string> } {
  const map = new Map(Object.entries(entries));
  return {
    entries: map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('shell settings', () => {
  it('gives the defaults with no store, or nothing stored', () => {
    expect(DEFAULT_SETTINGS).toEqual({ theme: 'auto', toolbar: 'normal' });
    expect(readSettings(null, KEY)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStore(), KEY)).toEqual(DEFAULT_SETTINGS);
    // A copy: a caller that changes what it was handed does not change the defaults.
    const read = readSettings(null, KEY);
    read.theme = 'dark';
    expect(DEFAULT_SETTINGS.theme).toBe('auto');
  });

  it('reads a stored valid value', () => {
    const store = memoryStore({ [KEY]: JSON.stringify({ theme: 'high-contrast', toolbar: 'compact' }) });
    expect(readSettings(store, KEY)).toEqual({ theme: 'high-contrast', toolbar: 'compact' });
  });

  it('falls back field by field: an invalid theme becomes auto, a valid toolbar is kept', () => {
    const store = memoryStore({ [KEY]: JSON.stringify({ theme: 'solarized', toolbar: 'compact' }) });
    expect(readSettings(store, KEY)).toEqual({ theme: 'auto', toolbar: 'compact' });
    expect(readSettings(memoryStore({ [KEY]: JSON.stringify({ theme: 'dark', toolbar: 3 }) }), KEY)).toEqual({ theme: 'dark', toolbar: 'normal' });
    expect(readSettings(memoryStore({ [KEY]: 'not json' }), KEY)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStore({ [KEY]: 'null' }), KEY)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStore({ [KEY]: '"dark"' }), KEY)).toEqual(DEFAULT_SETTINGS);
  });

  it('writes what it reads back', () => {
    const store = memoryStore();
    writeSettings(store, KEY, { theme: 'light', toolbar: 'compact' });
    expect(readSettings(store, KEY)).toEqual({ theme: 'light', toolbar: 'compact' });
    // Only the settings' own fields go in.
    writeSettings(store, KEY, { theme: 'dark', toolbar: 'normal', extra: 1 } as never);
    expect(JSON.parse(store.entries.get(KEY) ?? '')).toEqual({ theme: 'dark', toolbar: 'normal' });
    expect(() => writeSettings(null, KEY, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('ignores a store whose getItem or setItem throws', () => {
    const refusing: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readSettings(refusing, KEY)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSettings(refusing, KEY, { theme: 'dark', toolbar: 'compact' })).not.toThrow();
  });

  it("comes to the system's theme for auto, and to the setting's own otherwise", () => {
    expect(effectiveTheme('auto', 'dark')).toBe('dark');
    expect(effectiveTheme('auto', 'high-contrast')).toBe('high-contrast');
    expect(effectiveTheme('light', 'dark')).toBe('light');
    expect(effectiveTheme('high-contrast', 'light')).toBe('high-contrast');
  });
});
