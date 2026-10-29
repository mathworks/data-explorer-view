# `<dex-column-filter>`

The popup a right-click on one of the tree table's column headers opens: one condition on that
column, an operator and a value, and the filter text it will write (`Unit:m`, `Min>=0`). It
filters nothing: it sends the condition and the table writes it into its search, in place of
the column's own condition if it has one.

[`<dex-tree-table>`](tree-table.md) draws it and listens to it; an app does not create one.

```js
// What the table does with it, in short:
popup.addEventListener('dex-column-filter-applied', (e) => {
  const { column, op, value, text } = e.detail; // text: the condition as the search writes it
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-column-filter>` | `DexColumnFilter` | `defineColumnFilter(tag = 'dex-column-filter')` | `data-explorer-view/tree-table` |

## Properties

### `column`

type `string` · default `''` · attribute `column`

Column key the condition is about (`DataType`). Default ''. Attribute `column`.

### `columnLabel`

type `string` · default `''` · attribute `column-label`

Header label; also the prefix the written text uses. Default ''. Attribute `column-label`.

### `op`

type `FilterOp` · default `'contains'` · attribute `op`

The operator: `contains`, `=`, `!=`, `>`, `<`, `>=` or `<=`. Default `contains`. Attribute
`op`.

### `value`

type `string` · default `''` · attribute `value`

The value compared with. Default ''. Attribute `value`.

### `hasExisting`

type `boolean` · default `false` · attribute `has-existing`

True when the table already has a condition for this column, which offers Clear. Default
false. Attribute `has-existing`.

## Methods

### `focusValue(): void`

Focuses the value box; the caller opens the popup for typing, not for reading.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-column-filter-applied`

Apply, or Enter: put this condition in the filter, in place of the column's own if it has one.

`detail` is a `ColumnFilterAppliedDetail`:

```ts
/** What `dex-column-filter-applied` carries: the condition, and the filter text it writes. */
export interface ColumnFilterAppliedDetail {
  column: string;
  op: FilterOp;
  value: string;
  text: string;
}

/** Every comparison the box understands. `~=` is normalized to `!=`. */
export type FilterOp = 'contains' | '=' | '!=' | '>' | '<' | '>=' | '<=';
```

### `dex-column-filter-closed`

Escape: close the popup and change nothing. No detail.

`detail` is `null`.

### `dex-column-filter-cleared`

Clear: take the column's condition out of the filter.

`detail` is a `ColumnFilterClearedDetail`:

```ts
/** What `dex-column-filter-cleared` carries: the column whose condition goes. */
export interface ColumnFilterClearedDetail {
  column: string;
}
```

## Parts it defines

`defineColumnFilter()` defines `<dex-column-filter>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
