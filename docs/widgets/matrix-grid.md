# `<dex-matrix-grid>`

A matrix's cells as a read-only grid, one page at a time, headed by MATLAB's 1-based row and
column numbers, with a page selector over the dimensions past the second. Only the cells near
the scroll position exist, on both axes, so a 1000x1000 page scrolls as a small one does.

The [variable editor](variable-editor.md) draws it once the cells have arrived. It can also be
used alone, wherever a matrix is to be shown in place:

```js
import { defineMatrixGrid } from 'data-explorer-view/variable-editor';

defineMatrixGrid();
const grid = document.createElement('dex-matrix-grid');
grid.matrix = { name: 'K', className: 'double', dims: [2, 3], nodeId: '', cells: ['1', '2', '3', '4', '5', '6'] };
document.body.append(grid);
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-matrix-grid>` | `DexMatrixGrid` | `defineMatrixGrid(tag = 'dex-matrix-grid')` | `data-explorer-view/variable-editor` |

## Properties

### `matrix`

type `MatrixPayload | null` · default `null` · property only

The matrix shown, cells included; null, the default, draws nothing. Property only.

### `pageCount`

type `number` · read-only

How many pages the matrix has: the product of its dimensions past the second, 1 for 2-D.

### `page`

type `number` · property only

The page shown, from 0; set, it is clamped to the pages there are.

## Methods

### `pageLabel(page: number): string`

A page's subscript as MATLAB writes it, `(:,:,2)` or `(:,:,1,3)`; '' for a 2-D matrix.

### `cellText(r: number, c: number, page?: unknown): string`

The text of cell (`r`, `c`), from 0, of a page (the one shown by default); '' outside the matrix.

### `focusActiveCell(): void`

Focuses the cell the keyboard is on, (1,1) until it has moved.

## Events

None.

## Parts it defines

`defineMatrixGrid()` defines `<dex-matrix-grid>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-matrix-max-height` | `320px` | The largest the variable editor's grid grows before it scrolls. |
| `--dex-matrix-max-width` | `640px` |  |
