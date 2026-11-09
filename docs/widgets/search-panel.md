# `<dex-search-panel>`

The app shell's Search: a box, the scope it searches under it ("Open files and the folder"), and
the matches grouped by file, each group headed by the file's name and how many it holds, each row
an entry's icon, its name with the match marked, and where it is in the file (a block's path
through its model). It searches nothing itself: a pause in the typing sends `dex-search-query`,
the app sets `results` in answer, and Enter or a click on a result sends `dex-search-open` with
the file and the name to reveal the entry by.

The focus stays in the box: Down and Up move through the results, and each new `results` starts
on the first. Escape empties the box. A count says how many results there are, and when the list
stopped at its cap; "No matches" when a query has none, and "Searching…" while `searching` is
set.

```js
import { defineSearchPanel } from 'data-explorer-view/app-shell';
import { searchEntries, sortNameRecords } from 'data-explorer-view/model';

defineSearchPanel();
const search = document.querySelector('dex-search-panel');
search.scope = 'Open files and the folder';
const records = sortNameRecords(await folder.names.list()); // a folder session's name index

search.addEventListener('dex-search-query', (e) => {
  search.results = e.detail.query ? searchEntries(records, e.detail.query) : [];
});
search.addEventListener('dex-search-open', async (e) => {
  const tab = await openFile(e.detail.sourceUri);
  tab.handle.selectByName(e.detail.revealName); // a block by its key
});
```

focusInput() puts the focus in the box with its text selected, for a chord that shows Search.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-search-panel>` | `DexSearchPanel` | `defineSearchPanel(tag = 'dex-search-panel')` | `data-explorer-view/app-shell` |

## Properties

### `results`

type `SearchItem[]` · default `[]` · property only

The matches to show for the query in the box, in the order the app gives them (searchEntries'
items: by name, then by file). They are drawn grouped by file, each file where its first
result is. Shown only while the box holds a query. Default none. Property only.

### `query`

type `string` · default `''` · attribute `query`

What the box holds. The user's typing sets it (and asks for it, once the typing pauses); an
app that sets it, to restore a search, asks for nothing, and sets `results` itself. Default
empty. Attribute `query`.

### `searching`

type `boolean` · default `false` · attribute `searching`

Whether the app is still working out the results of the query: "Searching…" stands in for
the count, and the list is marked busy. Default false. Attribute `searching`.

### `scope`

type `string` · default `''` · attribute `scope`

What the search covers, said under the box: "Open files and the folder", say. Default
empty, which draws no line. Attribute `scope`.

## Methods

### `focusInput(): void`

Puts the focus in the box, its text selected so the next keystroke types over it.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-search-query`

Search for this: the typing paused (150 ms), Escape emptied the box, or Enter came before the
pause. Answer by setting `results` (and `searching` while they are worked out). An empty
query asks for none. A request.

`detail` is a `SearchQueryDetail`:

```ts
/** What `dex-search-query` carries: the text to search for. */
export interface SearchQueryDetail {
  /** What the box holds, as typed; empty when the user cleared it. */
  query: string;
}
```

### `dex-search-open`

Open this result: reveal `revealName` in the file `sourceUri`. Enter or a click. A request.

`detail` is a `SearchOpenDetail`:

```ts
/** What `dex-search-open` carries: the result to open. */
export interface SearchOpenDetail {
  /** The file it is in: its entry's `sourceUri`. */
  sourceUri: string;
  /** The name to reveal it by in that file's table (`selectByName`): its `revealName`, a block's key. */
  revealName: string;
}
```

## Parts it defines

`defineSearchPanel()` defines these first, under their default names, then `<dex-search-panel>`:

- [`<dex-icon>`](icon.md)

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
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-input-placeholder-fg` | `#767676` |  |
| `--dex-match-highlight-bg` | `rgba(234, 92, 0, 0.33)` | A search match inside text. |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
