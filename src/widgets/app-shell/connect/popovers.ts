// Copyright 2026 The MathWorks, Inc.
//
// The shell's Settings and About: the settings read back when the shell starts and the theme they
// name applied at once (the prototype applied a kept theme only once Settings was opened, so a
// dark choice came back light until then), Auto following the system's theme as it changes, a
// change kept and applied (the theme to the page, the density to the toolbar, the icon style to the
// toolbar, the location bar and the shell's bars, the table style to every open table), and the
// two popovers toggled by their buttons and their commands.
// connectShell's, in a module of its own so that connectShell is the documents' wiring.

import { effectiveTheme, readSettings, writeSettings, type KeyValueStore, type ShellSettings } from '../../../model/shell/settings.js';
import type { Rect } from '../../../model/shell/placement.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { DexAppShell } from '../dex-app-shell.js';
import type { DexAboutPanel } from '../dex-about-panel.js';
import type { DexLocationBar } from '../dex-location-bar.js';
import type { DexSettingsPanel } from '../dex-settings-panel.js';
import type { DexToolbar } from '../dex-toolbar.js';
import { applyTheme, type SystemTheme } from './theme.js';

/** The popovers, as connectShell drives them. */
export interface Popovers {
  /** Open the popover of `id` beside its button (or `anchor`), or close it when it is open: a press of the gear or the (i). */
  toggle(id: 'settings' | 'about', anchor?: Rect): void;
  /**
   * Close both: before a dialog opens over them, until the shared modal stack exists, since one
   * Escape would otherwise close a popover and the dialog over it.
   */
  closeAll(): void;
  /** The style a table the shell makes now is drawn in: the table style setting, in the table's own words. */
  tableStyle(): DexTreeTable['tableStyle'];
  /** Stop listening: to the settings popover, and to the system's theme. */
  dispose(): void;
}

/** The table style setting in the tree table's own words: Grid is its `normal`, Rows its `light`. */
function tableStyleOf(settings: ShellSettings): DexTreeTable['tableStyle'] {
  return settings.tableStyle === 'rows' ? 'light' : 'normal';
}

/** The page's localStorage, or none where the page refuses it (an opaque origin, storage turned off). */
export function pageStorage(): KeyValueStore | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Wire the Settings and About popovers. The settings live in `store` under `key`; the theme goes on
 * the page, the density on `toolbar`, the icon style on `toolbar`, `location` and `shell`, and the
 * table style on every table `tables` names (the open ones: a table made later asks `tableStyle()`).
 */
export function connectPopovers(
  shell: DexAppShell,
  parts: { settingsPanel: DexSettingsPanel; aboutPanel: DexAboutPanel; toolbar: DexToolbar; location: DexLocationBar },
  options: {
    store: KeyValueStore | null;
    key: string;
    system: SystemTheme;
    appName: string;
    about: { label: string; value: string }[];
    tables(): Iterable<DexTreeTable>;
  },
): Popovers {
  const { settingsPanel, aboutPanel, toolbar, location } = parts;
  const { store, key, system } = options;
  let settings: ShellSettings = readSettings(store, key);
  const apply = (): void => {
    applyTheme(effectiveTheme(settings.theme, system.now()));
    settingsPanel.settings = settings;
    toolbar.compact = settings.toolbar === 'compact';
    // Minimal is the shell's own buttons' glyphs in one colour; a file's or an entry's icon (a
    // tab's, a segment's, a row's) keeps its colours either way.
    const mono = settings.iconStyle === 'minimal';
    toolbar.mono = mono;
    location.mono = mono;
    shell.mono = mono;
    for (const table of options.tables()) table.tableStyle = tableStyleOf(settings);
  };
  // At once, not when Settings first opens: a theme chosen in an earlier session is the page's now.
  apply();
  const stopSystem = system.on((theme) => {
    if (settings.theme === 'auto') applyTheme(theme);
  });
  // The popover asks; the shell applies, keeps, and shows the settings back in it.
  const onChange = (e: CustomEvent<{ settings: ShellSettings }>): void => {
    settings = e.detail.settings;
    writeSettings(store, key, settings);
    apply();
  };
  settingsPanel.addEventListener('dex-settings-change', onChange);
  aboutPanel.heading = options.appName;
  aboutPanel.lines = options.about;

  return {
    toggle(id, anchor) {
      const panel = id === 'settings' ? settingsPanel : aboutPanel;
      if (panel.open) return panel.close();
      panel.show(shell.anchorOf(id) ?? anchor ?? { x: 0, y: 0, width: 0, height: 0 });
    },
    closeAll() {
      settingsPanel.close();
      aboutPanel.close();
    },
    tableStyle: () => tableStyleOf(settings),
    dispose() {
      settingsPanel.removeEventListener('dex-settings-change', onChange);
      stopSystem();
    },
  };
}
