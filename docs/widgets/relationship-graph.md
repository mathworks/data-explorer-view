# `<dex-relationship-graph>`

How the open models, dictionaries and MAT-files connect, as the prototype's relationship graph
drew it: the models on the left as a tree of their references, the data files on the right, each
a box in its kind's colour, a file referenced and not open as a dashed box, and the edges between
them. Every box starts closed. An open box lists the blocks and variables that take part (a
model's workspace variables under a divider), each other box shows those of its items the open
one reaches (a model open shows, in a dictionary, the variables its blocks read), and an edge
runs from each block to each variable it reads, labelled with the block parameter.

A click on a box or an item selects it and lights what its edges reach, dimming the rest; a click
on the background clears it. A double-click asks to open the file, at the item's row for an item,
and a dashed box by the reference that names it, for the app to look for. A box's − or + asks to
hide or show its items, and the app answers by setting `expanded`. The wheel, the + and − buttons
and a drag of the background zoom and pan, and the fit button and fit() show the whole graph. A
Legend names the kinds. On the keyboard, the arrows move the selection to the nearest box that
way, Enter opens, Space shows or hides a box's items, + and − zoom and 0 fits.

```js
import { defineRelationshipGraph } from 'data-explorer-view/app-shell';
import { buildRelationshipGraph } from 'data-explorer-view/model';

defineRelationshipGraph();
const view = document.querySelector('dex-relationship-graph');
view.graph = buildRelationshipGraph(openFiles); // each open file's { uriString, path, bytes }

view.addEventListener('dex-graph-expand', (e) => {
  const { id, expanded } = e.detail;
  view.expanded = expanded ? [...view.expanded, id] : view.expanded.filter((x) => x !== id);
});
view.addEventListener('dex-graph-open', (e) => {
  const { uri, name, ref } = e.detail; // uri empty, ref set: a file referenced and not open
  if (uri) openFile(uri).then((tab) => name && tab.handle.selectByName(name));
  else findAndOpen(ref);
});
```

A graph rebuilt from the same files (after an edit) keeps the view, and its ids are the same, so
`selected` and `expanded` still hold; a graph of other files is fitted to the canvas afresh.
`reveal(id)` brings a box or an item to the middle, for a "Show in Graph" from a table: the id of
a file's box, or of an entry's item, is `graphIdOf(graph, uri, name)` (`data-explorer-view/model`).

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
