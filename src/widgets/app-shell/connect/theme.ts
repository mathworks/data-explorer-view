// Copyright 2026 The MathWorks, Inc.
//
// The theme the page is drawn in, as view's theme stylesheet reads it: `data-theme` on the root
// element. And the system's theme, for the Settings popover's Auto, from the page's own media
// queries: a host that knows better (Electron's nativeTheme, which also follows Windows' contrast
// themes) passes its own to connectShell instead, or tells it through the handle as it hears it
// (settableSystemTheme), when it hears it only after the shell is up.
//
// applyTheme is lifted from data-explorer-app src/renderer/ui/theme.ts at 0983920.

import type { Theme } from '../../../model/shell/settings.js';

/** Draw the page in `theme`: view's theme stylesheet reads it from the root element's `data-theme`. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** The system's theme, and its changes, as connectShell's `systemTheme` option takes them. */
export interface SystemTheme {
  now(): Theme;
  on(listener: (theme: Theme) => void): () => void;
}

// The queries the theme is read from, in the order they win: a forced-colours scheme (Windows'
// contrast themes) or a request for more contrast is high contrast, whatever its colours are.
const QUERIES = ['(forced-colors: active)', '(prefers-contrast: more)', '(prefers-color-scheme: dark)'] as const;

/**
 * The system's theme from the page's media queries: high contrast under forced colours or a
 * request for more contrast, else dark under a dark colour scheme, else light. `on` hears every
 * change of any of them, with the theme as it then is. A page with no matchMedia is light.
 */
export function systemThemeFromMedia(): SystemTheme {
  const lists = typeof matchMedia === 'function' ? QUERIES.map((q) => matchMedia(q)) : [];
  const now = (): Theme => {
    const [forced, contrast, dark] = lists.map((l) => l.matches);
    if (forced || contrast) return 'high-contrast';
    return dark ? 'dark' : 'light';
  };
  return {
    now,
    on(listener) {
      const changed = () => listener(now());
      for (const list of lists) list.addEventListener('change', changed);
      return () => {
        for (const list of lists) list.removeEventListener('change', changed);
      };
    },
  };
}

const THEMES: readonly Theme[] = ['light', 'dark', 'high-contrast'];

/** A system theme a host can also tell: `set` is ShellHandle.setSystemTheme. */
export interface SettableSystemTheme extends SystemTheme {
  /** The system's theme is `theme` from now on, whatever the source says. A value that is no theme is passed over. */
  set(theme: Theme): void;
}

/**
 * The system's theme as `source` has it, until a host tells one (`set`): from then on the theme
 * told, and the source is no longer heeded, so a host that hears the theme (an Electron page,
 * told over IPC) and the page's media queries never take turns. A listener hears each change of
 * the theme, from either, and nothing when the theme it already is is told again.
 */
export function settableSystemTheme(source: SystemTheme): SettableSystemTheme {
  let told: Theme | undefined;
  const listeners = new Set<(theme: Theme) => void>();
  const now = (): Theme => told ?? source.now();
  return {
    now,
    on(listener) {
      listeners.add(listener);
      const stop = source.on((theme) => {
        if (told === undefined) listener(theme);
      });
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    set(theme) {
      if (!THEMES.includes(theme)) return;
      const was = now();
      told = theme;
      if (theme === was) return;
      for (const listener of [...listeners]) listener(theme);
    },
  };
}
