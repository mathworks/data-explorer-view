# `<dex-filter-bar>`

The tree table's search bar, drawn above its rows: the applied filter as one chip per condition
(`Unit:m`, `Min>=0`) and an input for what the user is still typing. It filters
nothing and keeps no filter of its own. It proposes a whole new filter text in
`dex-filter-applied`, the table applies it and hands the text and its parse back.

An app does not create one: [`<dex-tree-table>`](tree-table.md) draws it, and its focusFilter()
(the Ctrl+F of an app) focuses its input. The event leaves the table too, so an app can follow
what the user searches for:

```js
table.addEventListener('dex-filter-applied', (e) => {
  console.log('searching for', e.detail.text);
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-filter-bar>` | `DexFilterBar` | `defineFilterBar(tag = 'dex-filter-bar')` | `data-explorer-view/tree-table` |

## Properties

### `text`

type `string` · default `''` · attribute `text`

The applied filter text. The bar never mutates it; it proposes replacements. Default ''.
Attribute `text`.

### `tokens`

type `FilterToken[]` · default `[]` · property only

Its parse, from the table's one `parseFilterExpression` call: one chip each. Default none.
Property only.

### `placeholder`

type `string` · default `'Search'` · attribute `placeholder`

The input's placeholder. Default 'Search'. Attribute `placeholder`.

## Methods

### `focusInput(): void`

Focuses (and selects) the input — the Ctrl+F entry point, forwarded by the table's focusFilter.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-filter-applied`

The user asked for this filter text: Enter on what they typed (added after the applied
text), a chip removed, or the whole filter cleared. The table handles it and lets it on.

`detail` is a `FilterAppliedDetail`:

```ts
export interface FilterAppliedDetail {
  text: string;
}
```

## Parts it defines

`defineFilterBar()` defines `<dex-filter-bar>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-badge` | `rgba(128, 128, 128, 0.18)` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-color-warning` | `#d83b01` |  |
