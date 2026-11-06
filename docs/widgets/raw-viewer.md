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
