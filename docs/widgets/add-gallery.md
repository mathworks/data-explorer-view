# `<dex-add-gallery>`

The tree table's `+ Add` popover: a tile for each kind of entry the document can take, grouped
by the section it goes in (a dictionary's Design Data, Configurations, …), or a tile per class
for a MAT-file. A click on a tile asks for one new entry; the table sends it on as
`dex-add-entry`, with whether the new row should open its name editor. Keep open pins the
popover across adds.

[`<dex-tree-table>`](tree-table.md) draws it under its search bar when `canAdd` is set (and
`readonly` is not), and its toggleAddGallery() opens and closes it from a keyboard shortcut.
An app listens to the table, not to the gallery:

```js
table.canAdd = true;
table.addEventListener('dex-add-entry', (e) => {
  const { section, className, rename } = e.detail;
  addEntry(section, className);              // the app writes the document
  // then, once the new row has arrived: if (rename) table.beginRename(newRowId);
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-add-gallery>` | `DexAddGallery` | `defineAddGallery(tag = 'dex-add-gallery')` | `data-explorer-view/tree-table` |

## Properties

### `pinned`

type `boolean` · default `false` · attribute `pinned`

Whether an add keeps the popover open.

Owned by the table, not here, so the choice survives closing and reopening within a
session: a user who pins is telling you about their next several minutes, not about
this one popover. Default false. Attribute `pinned`.

### `classes`

type `readonly string[] | null` · default `null` · property only

The classes a MAT-file can take a new variable of, as core lists them, or null for a
dictionary's gallery. Given, the tiles are those classes' (the model's matCatalog): a MAT-file has
no sections, so no tile names one, and nothing is offered that the file cannot take.
Default null. Property only.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-add-tile`

A tile was clicked: add one entry of its class. The table stops it and sends `dex-add-entry`.

`detail` is a `AddTileDetail`:

```ts
export interface AddTileDetail {
  className: string;
  section: string;
  label: string;
}
```

### `dex-add-pin-changed`

Keep open was turned on or off; `pinned` has already changed.

`detail` is a `AddPinChangedDetail`:

```ts
export interface AddPinChangedDetail {
  pinned: boolean;
}
```

### `dex-add-closed`

Escape: close the gallery. No detail.

`detail` is `null`.

## Parts it defines

`defineAddGallery()` defines these first, under their default names, then `<dex-add-gallery>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-add-gallery-bg` | `#fff` |  |
| `--dex-add-gallery-header-bg` | `#fff` |  |
| `--dex-add-gallery-min-width` | `300px` |  |
| `--dex-add-gallery-tint` | `#fff` | The Add gallery: its tiles, its sheet and its sticky header, and the two numbers the table and the gallery both lay the popover out by. |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
