# `<dex-settings-panel>`

The shell's Settings popover, opened from the gear on an activity bar: the theme (Auto, Light,
Dark, Hi-Con), the toolbar's density (Normal, or Compact: a lower row, its icons smaller and
beside their labels), the icons of the shell's own buttons (Minimal, in one colour, or Colorful)
and how the tables are ruled (Grid, or Rows), each a row of segments that is a radio group. It
shows `settings` and asks for a change: a click, or an arrow key inside a row, sends
`dex-settings-change` with the whole new record, and the panel changes nothing by itself. The app
applies the settings, keeps them, and sets `settings` back. The popover stays open meanwhile, so
the themes can be tried one after another.

show() opens it beside the button that opened it, focused on the chosen theme. Escape, a press
outside it or close() closes it, and the focus goes back to the button.

```js
import { defineSettingsPanel } from 'data-explorer-view/app-shell';

defineSettingsPanel();
const panel = document.body.appendChild(document.createElement('dex-settings-panel'));
panel.settings = { theme: 'auto', toolbar: 'normal', iconStyle: 'minimal', tableStyle: 'grid' };

shell.addEventListener('dex-shell-action', (e) => {
  if (e.detail.actionId === 'settings') panel.show(e.detail.anchor);
});
panel.addEventListener('dex-settings-change', (e) => {
  const { theme, toolbar, iconStyle, tableStyle } = e.detail.settings;
  document.documentElement.dataset.theme = theme === 'auto' ? systemTheme() : theme; // theme.css reads it
  toolbarElement.compact = toolbar === 'compact';
  toolbarElement.mono = iconStyle === 'minimal'; // and the location bar's and the shell's `mono`
  for (const table of tables) table.tableStyle = tableStyle === 'rows' ? 'light' : 'normal';
  panel.settings = e.detail.settings;
  localStorage.setItem('my-app:settings', JSON.stringify(e.detail.settings));
});
```

connectShell does all of this, and draws the page in the saved theme as it starts, before
Settings is first opened; Auto follows the system's light, dark or high-contrast scheme as it
changes, and a table opened later is ruled as the setting says.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-settings-panel>` | `DexSettingsPanel` | `defineSettingsPanel(tag = 'dex-settings-panel')` | `data-explorer-view/app-shell` |

## Properties

### `settings`

type `ShellSettings` · default `DEFAULT_SETTINGS` · property only

The settings shown: which segment of each row is checked. The app sets it, at first and
after each `dex-settings-change` it applies; the panel never changes it itself.

### `open`

type `boolean` · read-only

Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling.

## Methods

### `show(anchor: Rect): void`

Opens the popover beside `anchor`, the button that opened it, in viewport px (its
getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
right has no room, and inside the window. Focus goes to the chosen theme. Open already, it
moves; not on the page, it does not open.

### `close(): void`

Closes the popover, sending nothing; focus goes back to the button when the popover held it.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-settings-change`

A segment other than the checked one was chosen, by a click or an arrow key: apply these
settings, keep them, and set `settings` to them. The popover stays open.

`detail` is a `SettingsChangeDetail`:

```ts
/** What `dex-settings-change` carries: the settings asked for, whole. */
export interface SettingsChangeDetail {
  /** Every setting, the changed one included: a new object, never the panel's `settings`. */
  settings: ShellSettings;
}

/** What a person sets in the Settings popover. */
export interface ShellSettings {
  /** The theme, or `'auto'` to follow the system's (see `effectiveTheme`). */
  theme: Theme | 'auto';
  /** The toolbar's density: each label under its icon, or a lower row with smaller icons and the labels beside them. */
  toolbar: 'normal' | 'compact';
  /**
   * The icons of the shell's own buttons (the toolbar's, the location bar's Back, Forward and Up,
   * the activity bars' and the status bar's): `minimal` draws each in one colour, the text's, and
   * `colorful` as its file has it. A file's or an entry's icon keeps its colours either way: there
   * the colour tells kinds apart.
   */
  iconStyle: 'minimal' | 'colorful';
  /** How the tables are ruled: `grid`, a line round every cell, or `rows`, a faint line between rows alone. */
  tableStyle: 'grid' | 'rows';
}

/** A theme a page can be drawn in: the three theme.css defines. */
export type Theme = 'light' | 'dark' | 'high-contrast';
```

## Parts it defines

`defineSettingsPanel()` defines `<dex-settings-panel>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
