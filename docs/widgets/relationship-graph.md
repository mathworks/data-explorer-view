# `<dex-relationship-graph>`

How the open models, dictionaries and MAT-files connect: the models on the left as a tree of their
references, the data files on the right, each a box in its kind's colour, a file referenced and not
open as a dashed box, and the edges between them. Every box starts closed. An open box lists the
blocks and variables that take part (every block of a model that names something in a parameter,
and a model's workspace variables under a divider), each other box shows those of its items the
open one reaches (a model open shows, in a dictionary, the variables its blocks read), and an edge
runs from each block to each variable it reads, labelled with the block parameter as the block's
property (`.Gain`). A data link is drawn in the colour of the file it links, a dictionary's green
or a MAT-file's sand.

A click on a box or an item selects it and lights what its edges reach, dimming the rest; a click
on the background clears it. A double-click asks to open the file, at the item's row for an item,
and a dashed box by the reference that names it, for the app to look for. A box's − or + asks to
hide or show its items, and the app answers by setting `expanded`; a box so opened is zoomed to
with the files it reaches (along data links, dictionary references and usages, not model
references) and the rest dimmed, until it is closed, Escape is pressed or the background clicked,
and a double-click on the background asks to close every box and fits the graph. The pointer on an
item traces what it is joined to; on an edge, the other edges fade. The wheel, the + and − buttons
and a drag of the background zoom and pan, and the fit button and fit() show the whole graph. A
Legend names the kinds. On the keyboard, the arrows move the selection to the nearest box that
way, Enter opens, Space shows or hides a box's items, Escape clears, + and − zoom and 0 fits.

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
`reveal(id)` brings a box or an item to the middle, and `zoomToReach(id)` zooms onto it and what
it reaches, for a "Show in Graph" from a table: the id of a file's box, or of an entry's item, is
`graphIdOf(graph, uri, name)` (`data-explorer-view/model`). The app shell's Show in Graph selects
it, opens its box, and zooms onto its reach.

The look is the prototype's: two columns of top-down trees, what a file references in the row
under it. What fits: the app shell at 1440 by 900 gives the graph about 900 by 610 pixels, and
fifteen files (eight models one tree five leaves wide, five dictionaries one tree three wide, two
MAT-files) draw about 1890 by 390. A fit stops at 0.7, where a label is near 8 pixels, and shows the
models from the top left, to pan from; a model opened is zoomed to with the data its blocks read at
0.77, both columns on the screen. Each file takes the width it needs in its tree, rather than the
prototype's slot of the column's widest box, and the gap between the columns is as wide as the data
links' lanes need rather than the prototype's 300 pixels: together they drew the same files 2170
wide, a label 4 pixels at a fit.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-relationship-graph>` | `DexRelationshipGraph` | `defineRelationshipGraph(tag = 'dex-relationship-graph')` | `data-explorer-view/app-shell` |

## Properties

### `graph`

type `RelationshipGraph | null` · default `null` · property only

The graph to draw, from `buildRelationshipGraph`. Null, the default, or one with no boxes,
draws a note saying what to open. A new graph whose boxes are other than the last one's is
fitted to the canvas; one with the same boxes (rebuilt after an edit) keeps the view.

### `selected`

type `string | null` · default `null` · attribute `selected`

The id of the box or item to select: a box's id (a file's uri, for a file given) or an item's,
as `graphIdOf` gives it. It is lit with what its edges reach, and the rest is dimmed. Null, the
default, selects nothing. A click changes it and sends `dex-graph-selected`; setting it sends
nothing. Attribute `selected`.

### `expanded`

type `string[]` · default `[]` · property only

The ids of the boxes that are open. An open box shows all its items, and each other box the
items of its own an open box's edges reach: a model open shows its blocks and, in each data file
they read, only the variables they read. None, the default, the graph starts with: the files
and the links between them. The app sets it, in answer to `dex-graph-expand`; the element never
changes it.

## Methods

### `fit(): void`

Scales and moves the view so the whole graph shows, centred, at no more than its own size and
no less than 0.6 of it: a graph bigger than that shows from its top left, to pan from.
Called with a draw to come (just after `graph` or `expanded` was set), it fits what that draw
lays out; before the element has a size (not on the page yet, or hidden), once it has one.

### `reveal(id: string): void`

Moves the view so the box or item `id` is at the middle of the canvas, at the scale it has; an
item of a closed box brings its box. Changes neither the selection nor which boxes are open:
an app revealing a row sets `selected` (and `expanded`) too, and may call this straight after,
since with a draw to come it reveals where that draw puts the row. An id the graph does not
hold moves nothing.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-graph-selected`

A box or an item was clicked, or chosen with an arrow key, and is now `selected`; or the
background was clicked and nothing is (`id` null). Sent again each time one is chosen.

`detail` is a `GraphSelectedDetail`:

```ts
/** What `dex-graph-selected` carries: the box or item now selected, or null for none. */
export interface GraphSelectedDetail {
  /** A box's id (a file's uri, for a file given) or an item's; null when the selection was cleared. */
  id: string | null;
}
```

### `dex-graph-open`

Open this file, at this row: a box or an item was double-clicked, or Enter pressed on it. For a
ghost, `uri` is empty and `ref` names the file to look for. A request.

`detail` is a `GraphOpenDetail`:

```ts
/**
 * What `dex-graph-open` carries: the file to open, and the row in it to reveal; or, for a file
 * referenced and not open (a ghost), the reference to find it by.
 */
export interface GraphOpenDetail {
  /** The file's uri; empty for a ghost, which is no file the app has. */
  uri: string;
  /** For an item, the name its file's table selects it by (`GraphItem.revealName`); absent for a box. */
  name?: string;
  /**
   * For a ghost, its reference as the referencing file wrote it (`GraphBox.ref`), for the app to
   * resolve as it resolves a link to a file. It may find nothing; what then is the app's to say.
   */
  ref?: string;
}
```

### `dex-graph-expand`

Show or hide this box's items: its − or + was pressed, or Space on it. A request: set `expanded`
to include the box, or to leave it out. The graph changes nothing itself.

`detail` is a `GraphExpandDetail`:

```ts
/** What `dex-graph-expand` carries: the box whose items to show or hide. */
export interface GraphExpandDetail {
  /** The box. */
  id: string;
  /** True to show its items, false to hide them. */
  expanded: boolean;
}
```

## Parts it defines

`defineRelationshipGraph()` defines these first, under their default names, then `<dex-relationship-graph>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-disabled` | `#999` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-graph-edge-data-link` | `#7c8a60` |  |
| `--dex-graph-edge-model-ref` | `#6788a4` |  |
| `--dex-graph-edge-param-usage` | `#8d7ea4` |  |
| `--dex-graph-edge-sldd-ref` | `#658d72` |  |
| `--dex-graph-edge-ws-usage` | `#618d7e` |  |
| `--dex-graph-ghost-fg` | `#666` |  |
| `--dex-graph-item-bg` | `rgba(0, 0, 0, 0.04)` |  |
| `--dex-graph-item-border` | `rgba(0, 0, 0, 0.1)` |  |
| `--dex-graph-mat-bg` | `#f4f0e8` |  |
| `--dex-graph-mat-border` | `#918267` |  |
| `--dex-graph-mat-selected` | `#7d653e` |  |
| `--dex-graph-model-bg` | `#e8f0f7` | The relationship graph (dex-relationship-graph): each kind of box's surface, border and selected border, each kind of edge (the legend's swatches too), the items inside a box (a model's workspace variables in a tint of the workspace edge), and a ghost's label. Hues darkened until every line and border is 3:1 against the canvas. |
| `--dex-graph-model-border` | `#6c8899` |  |
| `--dex-graph-model-selected` | `#436e8a` |  |
| `--dex-graph-sldd-bg` | `#e8f4ec` |  |
| `--dex-graph-sldd-border` | `#6a8c7a` |  |
| `--dex-graph-sldd-selected` | `#3e7456` |  |
| `--dex-graph-ws-item-bg` | `rgba(107, 155, 139, 0.08)` |  |
| `--dex-graph-ws-item-border` | `rgba(107, 155, 139, 0.25)` |  |
