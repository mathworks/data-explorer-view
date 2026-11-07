# `<dex-compare-view>`

Two files compared line by line: a header over two read-only tables side by side. The header says
what differs ("3 changed, 1 added, 2 removed", read politely to a screen reader as it changes),
holds "Show only differences" and Previous and Next Change. Each side is a caption (the file's
name, ● while it holds unsaved edits, "Read-only" where no copy can go into it) over a
[`<dex-tree-table>`](tree-table.md) that keeps its rows as given and draws each line's mark.

The app gives each side its rows, one per line under the line's id, the same ids in the same order
and tree on both sides, with a blank row where a file lacks the line, and each line's mark on that
side. The view keeps the two tables one picture: a line opened in one is opened in the other, a
scroll of one scrolls the other to the same place, and a selection in one is the other's,
said in `dex-compare-selected`. A row's menu is asked for in `dex-compare-menu`, with the side it
was asked on, for the app to offer Copy to Left or Right. Previous and Next Change send
`dex-compare-step`, and the app answers with `select()`. "Show only differences" sends
`dex-compare-filter-changed`, and the app lays the lines out again. The tables' own events stay
inside the view, so nothing outside takes a compare table's selection or menu for a document's.

```js
import { defineCompareView } from 'data-explorer-view/app-shell';

defineCompareView();
const view = document.querySelector('dex-compare-view');
view.left = { name: 'a.sldd', editable: true, rows: leftRows, columns, columnLabels, columnGroups, marks: leftMarks };
view.right = { name: 'b.sldd', editable: false, rows: rightRows, columns, columnLabels, columnGroups, marks: rightMarks };
view.summary = '1 changed, 1 added';
view.hasChanges = true;
view.addEventListener('dex-compare-step', (e) => view.select([nextChange(e.detail.by)]));
view.addEventListener('dex-compare-menu', (e) => showCopyMenu(e.detail.side, e.detail.lineIds, e.detail.x, e.detail.y));
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-compare-view>` | `DexCompareView` | `defineCompareView(tag = 'dex-compare-view')` | `data-explorer-view/app-shell` |

## Properties

### `left`

type `CompareSide | null` · default `null` · property only

The left side: its caption and its table's rows.

### `right`

type `CompareSide | null` · default `null` · property only

The right side, the same lines as the left.

### `summary`

type `string` · default `''` · attribute `summary`

The header's words for what differs ("3 changed, 1 added, 2 removed"), said politely to a screen reader as it changes.

### `onlyDifferences`

type `boolean` · default `true` · attribute `only-differences`

The header's checkbox: lines with no difference in or under them are left out (the app gives rows to match). Default true. Attribute `only-differences`.

### `hasChanges`

type `boolean` · default `false` · attribute `has-changes`

Whether there is a change to go to: Previous and Next Change are enabled. Attribute `has-changes`.

### `empty`

type `string` · default `''` · attribute `empty`

Said in place of the tables while both have no rows ("No differences"); '' shows the tables.

### `tableStyle`

type `'normal' | 'light'` · default `'normal'` · attribute `table-style`

Both tables' style. Attribute `table-style`.

### `storageKey`

type `string | null` · default `null` · attribute `storage-key`

Both tables' `storageKey` (their column choices, shared). Default null: kept for the element's life only. Attribute `storage-key`.

### `expandedIds`

type `Set<string>` · property only

The lines shown open, both tables'; setting it sends nothing.

### `selectedIds`

type `string[]` · read-only

The selected lines.

## Methods

### `select(lineIds: readonly string[]): void`

Select these lines in both tables, opening their parents and bringing the first into view; sends nothing.

### `focus(): void`

The keyboard to the left table's grid.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-compare-selected`

The selection changed, in either table: both select `lineIds` now.

`detail` is a `CompareSelectedDetail`:

```ts
/** What `dex-compare-selected` carries: the lines selected now, in both tables. */
export interface CompareSelectedDetail {
  lineIds: string[];
}
```

### `dex-compare-menu`

A row's menu was asked for (right-click, Shift+F10, ContextMenu key), the right-clicked row selected first.

`detail` is a `CompareMenuDetail`:

```ts
/**
 * What `dex-compare-menu` carries: the side whose row the menu was asked for, the lines it is for
 * (that table's selection), where it opens (viewport pixels), and `keyboard` where a key opened it,
 * so the menu takes the keyboard.
 */
export interface CompareMenuDetail {
  side: 'left' | 'right';
  lineIds: string[];
  x: number;
  y: number;
  keyboard?: true;
}
```

### `dex-compare-step`

Previous (-1) or Next (+1) Change was pressed.

`detail` is a `CompareStepDetail`:

```ts
/** What `dex-compare-step` carries: to the previous change (-1) or the next (+1). */
export interface CompareStepDetail {
  by: 1 | -1;
}
```

### `dex-compare-filter-changed`

"Show only differences" was toggled; `onlyDifferences` follows it already.

`detail` is a `CompareFilterChangedDetail`:

```ts
/** What `dex-compare-filter-changed` carries: whether lines with no difference are left out now. */
export interface CompareFilterChangedDetail {
  onlyDifferences: boolean;
}
```

## Parts it defines

`defineCompareView()` defines these first, under their default names, then `<dex-compare-view>`:

- [`<dex-icon>`](icon.md)
- [`<dex-tree-table>`](tree-table.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-bg-toolbar` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-tag-bg` | `#e0e0e0` |  |
| `--dex-tag-fg` | `#333` | A label on a row naming what kind of thing it is (the project page's "interface"). |
