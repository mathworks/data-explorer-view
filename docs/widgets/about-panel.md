# `<dex-about-panel>`

The shell's About popover, opened from the (i) button on an activity bar: a heading (the app's
name) and the lines the app hands it, each a label and its value (the app's version, the
versions of what it is built on). A line may name the section it is in (`section`): the lines
with none come first, under the app's name, then each section once, under its heading, in the
order its first line comes. What the app gives is drawn as text, never as markup. show()
opens it beside the button that opened it, as the [Settings popover](settings-panel.md) opens;
Escape, a press outside it or close() closes it, and the focus goes back to the button. It sends
nothing.

```js
import { defineAboutPanel } from 'data-explorer-view/app-shell';
import { VIEW_VERSION } from 'data-explorer-view/model';

defineAboutPanel();
const about = document.body.appendChild(document.createElement('dex-about-panel'));
about.heading = 'My app';
about.lines = [
  { label: 'Version', value: '1.0.0' },
  { label: 'Build date', value: '2026-11-06' },
  { label: 'data-explorer-view', value: VIEW_VERSION, section: 'Built on' },
];
aboutButton.addEventListener('click', () => about.show(aboutButton.getBoundingClientRect()));
```

`VIEW_VERSION` is this package's version, as its package.json says. connectShell fills the
popover from its `appName` and `about` options, and opens it from the shell's About button.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-about-panel>` | `DexAboutPanel` | `defineAboutPanel(tag = 'dex-about-panel')` | `data-explorer-view/app-shell` |

## Properties

### `heading`

type `string` · default `'Data Explorer'` · attribute `heading`

The heading, the app's name, drawn in capitals as the Settings title is; also the dialog's accessible name.

### `lines`

type `{ label: string; value: string }[]` · default `[]` · property only

The lines under the heading, in order: a label (Version) and its value (1.0.0).

### `open`

type `boolean` · read-only

Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling.

## Methods

### `show(anchor: Rect): void`

Opens the popover beside `anchor`, the button that opened it, in viewport px (its
getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
right has no room, and inside the window. Open already, it moves; not on the page, it does
not open.

### `close(): void`

Closes the popover; focus goes back to the button when the popover held it.

## Events

None.

## Parts it defines

`defineAboutPanel()` defines `<dex-about-panel>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
