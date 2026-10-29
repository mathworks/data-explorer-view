# `<dex-variable-editor>`

A floating panel that shows a matrix's cells: anchored under the glyph that opened it, titled
with the matrix's name, shape and class, with the cells in a
[`<dex-matrix-grid>`](matrix-grid.md). It opens before its cells arrive — show() takes the
descriptor a row carries, and deliver() the cells the app fetched — so a matrix of a million
cells costs nothing until someone opens it.

An app makes one and opens it from every glyph ([`<dex-matrix-open>`](matrix-open.md)):

```js
import { defineVariableEditor } from 'data-explorer-view/variable-editor';
import { findNode, matrixCellsMessage } from 'data-explorer-view/model';

defineVariableEditor();
const editor = document.body.appendChild(document.createElement('dex-variable-editor'));

for (const source of [table, inspector]) {
  source.addEventListener('dex-matrix-open', (e) => {
    const { matrix, anchorEl } = e.detail;
    editor.show(anchorEl, matrix);
    const answer = matrixCellsMessage(matrix.nodeId, findNode(uri, matrix.nodeId));
    editor.deliver({ ...answer, matrix: answer.matrix ?? undefined });
  });
}
```

`MatrixDescriptor` and `MatrixPayload`, exported here, are the model's own types: this entry and
`data-explorer-view/model` name the same declaration.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-variable-editor>` | `DexVariableEditor` | `defineVariableEditor(tag = 'dex-variable-editor')` | `data-explorer-view/variable-editor` |

## Properties

None.

## Methods

### `show(anchorEl: HTMLElement, matrix: MatrixDescriptor): void`

Opens the panel under `anchorEl` (the glyph, which gets focus back) on what the row knew:
name, class, shape, node id. The cells are not here yet — the app fetches them for
`matrix.nodeId` (the model's matrixCellsMessage builds the answer) and hands it to
deliver(). Until then the panel shows its title and a waiting line.

### `deliver(answer: MatrixCellsAnswer | null | undefined): Promise<void>`

The cells the app fetched for the panel show() opened: fills the panel in, or says why it
cannot be filled in (the answer's `message`). Ignores an answer that is not about what is
currently on screen: open A, change your mind, open B, and A's reply can still be in flight —
taking it would put A's numbers under B's title, which is worse than a slow panel.

### `close(): void`

Closes the panel; focus goes back to the glyph that opened it, if the panel held it.

### `reposition(): void`

Places the panel again under its glyph, left edges aligned, pulled in at the viewport's
edges and flipped above the glyph when there is no room below. show() and deliver() call it.

## Events

None.

## Parts it defines

`defineVariableEditor()` defines these first, under their default names, then `<dex-variable-editor>`:

- [`<dex-matrix-grid>`](matrix-grid.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
