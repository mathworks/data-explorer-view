# `<dex-raw-viewer>`

The Raw pane: what the file holds for the selected row, unrendered. A JSON or XML record is
coloured (keys, strings, numbers, tags, attributes, comments, each in its `--dex-syntax-*`
colour), a value's bytes are a hex dump, and either is drawn in a monospaced block that scrolls
and can be selected, under a header naming its format. The text is drawn as text, never as
markup, and only its first megabyte, then a line saying how much more there is.

It knows nothing of documents: the app hands it each answer, a table source's `raw(rowId)`. A row
with no raw form draws its reason as a muted note; `raw` null, a note asking for a selection; and
`loading`, a note that the answer is on its way, in place of the last one. Copy sends
`dex-raw-copy` with the whole text (the dump, for bytes), for the app to put on the clipboard.

```js
import { defineRawViewer } from 'data-explorer-view/app-shell';

defineRawViewer();
const pane = document.querySelector('dex-raw-viewer');

handle.on('select', async ([rowId]) => { // handle: connectTable's
  if (!rowId || !doc.table.raw) return void (pane.raw = null);
  pane.loading = true;
  pane.raw = await doc.table.raw(rowId); // { format: 'json', text }, { format: 'hex', bytes }, …
  pane.loading = false;
});
pane.addEventListener('dex-raw-copy', (e) => navigator.clipboard.writeText(e.detail.text));
```

`raw` is a source's in the page alone: a workspace's documents answer it, and a table across a
message channel has none.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-raw-viewer>` | `DexRawViewer` | `defineRawViewer(tag = 'dex-raw-viewer')` | `data-explorer-view/app-shell` |

## Properties

### `raw`

type `RawView | null` · default `null` · property only

What to show: `TableSource.raw`'s answer for the selected row. Null, the default, is no
selection, and draws a note asking for one. Property only.

### `loading`

type `boolean` · default `false` · attribute `loading`

The answer for a new selection is on its way: the pane says Loading… in place of the last one,
which is no longer the selection's. Set it while `raw()` is asked. Default false. Attribute
`loading`.

### `label`

type `string` · default `''` · attribute `label`

What `raw` is for, named in the header and in the text's accessible name: the selected row's
name, or the file's for its own summary. Default empty: no name. Attribute `label`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-raw-copy`

Copy was pressed: put `text`, the whole text the pane shows (past what it draws of a long one;
a value's hex dump, for its bytes), on the clipboard. A request: the pane copies nothing itself.

`detail` is a `RawCopyDetail`:

```ts
/** What `dex-raw-copy` carries: the whole text the pane shows, which the app puts on the clipboard. */
export interface RawCopyDetail {
  text: string;
}
```

## Parts it defines

`defineRawViewer()` defines these first, under their default names, then `<dex-raw-viewer>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-badge` | `rgba(128, 128, 128, 0.18)` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-syntax-comment` | `#008000` | Syntax colours (dex-raw-viewer's JSON and XML) — light / VS Code palette |
| `--dex-syntax-keyword` | `#0451a5` |  |
| `--dex-syntax-literal` | `#0451a5` |  |
| `--dex-syntax-number` | `#098658` |  |
| `--dex-syntax-string` | `#a31515` |  |
| `--dex-syntax-title` | `#795e26` |  |
