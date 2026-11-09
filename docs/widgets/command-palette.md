# `<dex-command-palette>`

The shell's command palette: a box at the top of the window, over the page, in which a few typed
letters find a command. show() opens it with the commands to offer. The list follows the typing:
labels that begin with the query first, then those whose words it begins, then those that only
hold its letters in order, the letters matched drawn in bold. The commands run lately come first
among equals, and first of all before anything is typed. ArrowUp and ArrowDown move through the
list, wrapping; Enter or a click runs the command, which closes the palette and sends
`dex-palette-run`. A disabled command is listed greyed and runs on neither. Escape, a click
outside it and close() close it, sending nothing.

It is modal, as [`<dex-confirm-dialog>`](confirm-dialog.md) is: while it is open, Tab stays in
its input and no key pressed in it reaches the page. When it closes the focus goes back where it
was, before `dex-palette-run` is sent, so a command that moves the focus itself keeps it there.

```js
import { defineCommandPalette } from 'data-explorer-view/app-shell';

defineCommandPalette();
const palette = document.body.appendChild(document.createElement('dex-command-palette'));

addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || !e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  palette.show([
    { id: 'save', label: 'Save', category: 'File', shortcut: 'Ctrl+S', disabled: !doc.dirty },
    { id: 'show-log', label: 'Show Log', category: 'View' },
  ]);
});
palette.addEventListener('dex-palette-run', (e) => run(e.detail.id));
```

A command's `shortcut` is only shown: the palette listens for no chord but its own keys. It paints
at z-index 10000, as the dialogs do: append it last in the body.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-command-palette>` | `DexCommandPalette` | `defineCommandPalette(tag = 'dex-command-palette')` | `data-explorer-view/app-shell` |

## Properties

### `open`

type `boolean` · read-only

Whether it is open: from show() until a command runs, Escape, a click outside it or close(). The `open` attribute says the same, for styling.

## Methods

### `show(commands: PaletteCommand[]): void`

Opens the palette over the page with `commands` (a list that is not an array is none), an
empty query and the focus in its input, on the first command that can run. Open already, it
takes the new commands and starts the query afresh, and the focus will still go back where it
was before the first show(). Not on the page, it does not open.

### `close(): void`

Closes the palette, sending nothing; does nothing while closed.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-palette-run`

A command was run, by Enter on its row or a click on it: do it. The palette has closed, and
the focus is back where it was before the palette opened. Never sent for a disabled command.

`detail` is a `PaletteRunDetail`:

```ts
/** What `dex-palette-run` carries: the `id` of the command run. */
export interface PaletteRunDetail {
  id: string;
}
```

## Parts it defines

`defineCommandPalette()` defines `<dex-command-palette>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-disabled` | `#999` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-input-bg` | `#fff` |  |
| `--dex-input-border` | `#c8c8c8` |  |
| `--dex-input-fg` | `#333` | A text field (the project page's section filters). |
| `--dex-input-placeholder-fg` | `#767676` |  |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
