# `<dex-shell-view>`

One view of [`<dex-app-shell>`](app-shell.md): what the page shows in one of its sides (the left
or the right sidebar, or the bottom panel), and what the shell needs to give it an activity
button. Its children are the view's content. It is a column as wide and as tall as its side, and
scrolls what does not fit. A page writes `side`, and the view puts itself in the shell's slot for
that side.

It draws nothing else. The shell draws its button (its `icon`, with `label` and `shortcut` as the
tooltip) in the order the views are in the page, heads the side with its `label`, and hides each
view of a side but the one it shows. A hidden view stays in the page, so its content keeps its
scroll position and its open rows for when it is shown again. Shown by its shortcut, it takes the
focus: its first control, or the view itself when it has none. Its `view` is the id the shell's
`showView`, `toggleView` and events name it by, one view to an id.

```js
import { defineShellView } from 'data-explorer-view/app-shell';

defineShellView(); // defineAppShell() defines it too
const notes = document.createElement('dex-shell-view');
Object.assign(notes, { side: 'right', view: 'notes', label: 'Notes', icon: 'info', shortcut: 'Mod+Alt+N' });
notes.append(myNotesPanel);
shell.append(notes); // a button on the right activity bar, which shows the panel
```

A view on the `bottom` has its button at the start of the status bar. A shortcut with no Mod,
Ctrl or Alt (a bare key, or Shift and a key) works in a text field too, where the key would have
typed, so a view's chord is best given a modifier.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-shell-view>` | `DexShellView` | `defineShellView(tag = 'dex-shell-view')` | `data-explorer-view/app-shell` |

## Properties

### `side`

type `ShellSide` · default `'left'` · attribute `side`, reflected

The side the view is on: `left`, `right` or `bottom`. Default `left`. Attribute `side`.

### `view`

type `string` · default `''` · attribute `view`, reflected

The view's id, which the shell's `showView`, `toggleView` and `anchorOf` take, its events name
and its kept layout holds. One view per id: a second view with an id already given is drawn
nowhere. A view without one is not drawn. Attribute `view`.

### `label`

type `string` · default `''` · attribute `label`, reflected

What the view is called: its button's tooltip and accessible name, and its side's header. Attribute `label`.

### `icon`

type `string` · default `''` · attribute `icon`, reflected

The id of the icon its activity button draws (`<dex-icon>`'s `iconId`). Attribute `icon`.

### `shortcut`

type `string` · default `''` · attribute `shortcut`, reflected

The keyboard chord that shows the view, or closes its side when it is shown, as a press of its
button does, written as the shell's chords are (`Mod+Shift+E`: Mod is Command on macOS and
Ctrl elsewhere). Its tooltip names it in the platform's words. Text that is not a chord is no
shortcut, and the tooltip then names none. A chord with no Mod, Ctrl or Alt (a bare key, or
Shift and a key) works in a text field too, where the key would type: the shell hears the
press on the window, and only a field that prevents its default keeps it. Default none.
Attribute `shortcut`.

## Methods

None.

## Events

None.

## Parts it defines

`defineShellView()` defines `<dex-shell-view>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
