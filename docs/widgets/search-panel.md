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
