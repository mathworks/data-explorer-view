# `<dex-matrix-open>`

The glyph after a matrix value — a table cell's or an inspector row's — that opens the matrix in
the [variable editor](variable-editor.md). It opens nothing itself: it sends `dex-matrix-open`
with the matrix's descriptor (name, class, shape and node id, no cells) and itself as the
anchor, and the app shows the editor and fetches the cells.

The tree table and the property inspector draw it from their rows' `_matrix` and `matrix`
fields. The event leaves them, so one listener on each opens the one editor:

```js
import { defineVariableEditor } from 'data-explorer-view/variable-editor';

defineVariableEditor();
const editor = document.body.appendChild(document.createElement('dex-variable-editor'));

table.addEventListener('dex-matrix-open', (e) => {
  editor.show(e.detail.anchorEl, e.detail.matrix);
  fetchCells(e.detail.matrix.nodeId).then((answer) => editor.deliver(answer));
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-matrix-open>` | `DexMatrixOpen` | `defineMatrixOpen(tag = 'dex-matrix-open')` | `data-explorer-view/tree-table`, `data-explorer-view/property-inspector` |

## Properties

### `matrix`

type `MatrixDescriptor | null` · default `null` · property only

The matrix it opens: its name, class, shape and node id, and no cells. Null, the default,
draws nothing. Property only.

### `rowId`

type `string | undefined` · attribute `rowid`

The row it sits in, sent on with the event; unset in the inspector. Attribute `rowid`.

## Methods

### `focus(options?: FocusOptions): void`

Focuses the glyph's button, where the variable editor returns focus when it closes.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-matrix-open`

The glyph was clicked, or Enter or Space pressed on it: open this matrix.

`detail` is a `MatrixOpenDetail`:

```ts
export interface MatrixOpenDetail {
  // The descriptor, not the payload: the glyph exists once per matrix-valued row,
  // so what it holds is what every such row costs. Its label and tooltip need the
  // name, shape and class; its node id is what the fetch is keyed on.
  matrix: MatrixDescriptor;
  anchorEl: HTMLElement;
  // The table supplies this so a future editing pass knows which row to write
  // back to. The Property Inspector has no rows and omits it.
  rowId?: string;
}

export interface MatrixDescriptor {
  /** Panel title name — 'Kp', or 'ParamMat.Value' when the matrix is a property. */
  name: string;
  /** MATLAB class for the title ('double', 'cell', 'logical'). NOT arrayType. */
  className: string;
  /** effectiveDims: trailing singletons past the 2nd dropped.
   *  dims[0]xdims[1] is the grid; dims[2..] page. */
  dims: number[];
  /** The ROW's own node, not the matrix owner's: a property row's matrix lives on
   *  its `Value` child, and `matrixForRow` is the single rule that resolves that.
   *  The fetch re-runs that same rule rather than a second one agreeing with it. */
  nodeId: string;
}
```

## Parts it defines

`defineMatrixOpen()` defines these first, under their default names, then `<dex-matrix-open>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-color-accent` | `#0078d4` |  |
