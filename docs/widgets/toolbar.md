# `<dex-toolbar>`

A row of buttons, the `items` an app hands it: each an icon over a small label (beside it, in a
lower row, with `compact`), the items of one group together with a separator between groups, and
the `end` items pushed to the right. A click on an item sends `dex-toolbar-action` with its id; a
disabled one is greyed and sends nothing. Each item's tooltip is its `title`, or its label with
its shortcut after it.

The toolbar is one stop of the tab order: the arrow keys move along the items and wrap, Home and
End go to the first and the last, and Enter or Space presses the one the keyboard is on. A mouse
press takes no focus, so the focus stays where the user was working, and a cell editor open in a
table stays open: an app commits it (connectTable's `handle.commitEdit()`) before it acts on the
press. The toolbar knows nothing of files or tables. The app gives it new `items` as what they
can do changes, and does what each press asks.

```js
import { defineToolbar } from 'data-explorer-view/app-shell';

defineToolbar();
const toolbar = document.querySelector('dex-toolbar');
toolbar.items = [
  { id: 'open', label: 'Open', icon: 'openFolder', group: 'file', shortcut: 'Ctrl+O' },
  { id: 'save', label: 'Save', icon: 'saved', group: 'file', disabled: !doc.dirty },
  { id: 'undo', label: 'Undo', icon: 'undo', group: 'edit', align: 'end' },
];
toolbar.addEventListener('dex-toolbar-action', async (e) => {
  await handle.commitEdit(); // a cell editor still open commits first
  run(e.detail.actionId);
});
```

An item's `shortcut` is only shown: the toolbar listens for no key, and the app binds each chord
itself.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-toolbar>` | `DexToolbar` | `defineToolbar(tag = 'dex-toolbar')` | `data-explorer-view/app-shell` |

## Properties

### `items`

type `ToolbarItem[]` · default `[]` · property only

The buttons, in order: the `start` items from the left, then the `end` items from the right
edge, each side in the order given. Replace the array to change them; an item keeps its
button, and the keyboard's place on it, while its `id` stays, and an item that goes while the
keyboard is on it hands the focus to the one that takes its place. Default none.

### `compact`

type `boolean` · default `false` · attribute `compact`, reflected

The compact layout: each icon (14px rather than 18) beside its label, in a lower row.
Attribute `compact`, reflected so a page's stylesheet can follow it.

### `mono`

type `boolean` · default `false` · attribute `mono`, reflected

Draws each item's icon in one colour, its label's (`<dex-icon mono>`), as the prototype's
toolbar drew its glyphs, but for an item that is `colorful`; off, the default, draws them in
their files' colours. A disabled item's icon is greyed with its label either way. Attribute
`mono`, reflected so a page's stylesheet can follow it.

### `label`

type `string` · default `'Toolbar'` · attribute `label`

What a screen reader calls the toolbar, so a page with more than one can tell them apart.
Default `Toolbar`. Attribute `label`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-toolbar-action`

An item that is not disabled was pressed, by a click, Enter or Space: its `id`. A name of its
own, not the context menu's `dex-action`, so each event has one declaration and a page that
listens on the document tells a toolbar press from a menu choice.

`detail` is a `ToolbarActionDetail`:

```ts
/** What `dex-toolbar-action` carries: the `id` of the item pressed. */
export interface ToolbarActionDetail {
  actionId: string;
}
```

## Parts it defines

`defineToolbar()` defines these first, under their default names, then `<dex-toolbar>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-toolbar` | `#fff` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
