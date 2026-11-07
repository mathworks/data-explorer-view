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
