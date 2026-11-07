# `<dex-hierarchy>`

A folder's hierarchy as a tree: each project and folder, the files in it, and under each file
the files it references (a model's referenced models and its External Data, a dictionary's
referenced dictionaries), opened one level at a time. A reference no file in the folder answers
reads as a warning; a file that closes a circular reference, or has unsaved changes, carries a
badge. It draws the rows the VS Code extension's sidebar draws for the same folder.

The rows come from a `FolderHierarchy` (`data-explorer-view/model`), which reads the folder
through core's source cache: the app lists the folder's files and reads them, and
`connectHierarchy` wires the two together. A click or Enter on a row that opens a file is the
app's to act on:

```js
import { FolderHierarchy, sourceUri } from 'data-explorer-view/model';
import { connectHierarchy, defineHierarchy } from 'data-explorer-view/hierarchy';

defineHierarchy();
const tree = document.querySelector('dex-hierarchy');

const hierarchy = new FolderHierarchy({
  // The folder's supported files, in a stable order.
  files: { list: async () => paths.sort().map((path) => ({ uriString: sourceUri(path), path })) },
  // A reader for those files: a version for each (a change of it is a change of the file), its
  // bytes, and a project's store. In Electron or Node, core's `nodeSourceReader(files)` and
  // `readProjectStoreFromDisk(path)` (`data-explorer-core/node`).
  reader: (files) => ({ ...myReader(files), projectStore: async (file) => myProjectStore(file.path) }),
});
const handle = connectHierarchy(tree, hierarchy, {
  empty: document.querySelector('#no-files'),
  expandTopLevel: true, // the folder's own row open on first show; default closed
});
handle.on('open', (uri) => openTab(uri));

// When a file in the folder is created, deleted or saved:
hierarchy.rebuild();
```

### Showing the file the app has open

`handle.reveal(uri)` shows a file in the tree, as an editor's explorer follows the active
editor: it opens the rows above the file's row, selects it and scrolls it into view, and sends
nothing (`{ choose: true }` sends `dex-hierarchy-selected`, and so `open`, as a click does). A file
can be a row in several places, under each file that references it, so the rule is fixed: the
selected row stays when it is already the file's (the user chose it there); otherwise the row is
the shallowest, and of several at one depth the first from the top. `hierarchy.pathTo(uri)`
answers that row's path, for a host that draws the rows in a tree of its own. `reveal` resolves
false, and leaves the tree as it was, for a file that is no row.

```js
tabs.onActivate((tab) => handle.reveal(tab.uri));
```

### Links that open what the tree shows

A model names the dictionaries and models it links by their file names alone. The tree resolves
such a name by its own rule (the copy in the referrer's project or folder, else the first in the
folder), and `hierarchy.resolveLink(link, fromUri)` answers by the same rule for a link, so a
table beside the tree opens the file the tree shows: give it to `connectTable` as `resolveLink`,
and a link's file arrives on `navigate` as `uri`.

```js
const table = connectTable(tableElement, doc.table, {
  resolveLink: (link, fromUri) => hierarchy.resolveLink(link, fromUri),
});
table.on('navigate', ({ link, uri }) => openTab(uri ?? fileOf(link))); // uri: the file the tree shows
```

`resolveReference(name, referrerUri)` is the same rule for a bare name.

### A folder's project

A project's row heads its group, and opens the project's marker: its `id` is the marker's uri
(a `.prj`, or a `matlab.toml`). A folder session's `projectIn(folderUri)` answers the row of the
project whose marker is in a folder, for a link that names a project by its folder (see
[folder-session.md](../folder-session.md)).

### A folder read where the files are

A page that cannot read files (a sandboxed Electron window, an embedded browser view) has its
folder read where the files are, across one message channel, in the wire format beside the
table's (`data-explorer-view/model`'s `FolderRequestMessage`, `FolderAnswerMessage`,
`FolderChangedMessage`). `serveFolder(folder, port)` answers from the same `files` and `reader`
a hierarchy beside its files is given; `folderReader(port)` is both of them on the page's side.
The host's end is on `data-explorer-view/serve`, which loads nothing else, so a main process
that bundles it bundles a few kilobytes. `portFromMainPort(port)` (Electron's `MessagePortMain`,
by its shape) and `portFromMessagePort(port)` (a page's, a worker's) make the ports; the README
shows the whole of it in Electron, main, preload and page.

The page is not trusted, and the host reads only the files it listed. A question names its file
by uri, which is matched exactly against the host's own last listing, and the file read is the
listing's own, never a path the page sends. Any other uri is refused and nothing is read for it:
one outside the folder, one with `..` in it, a prefix that looks like the folder's, another
scheme, another spelling of a listed file (nothing is decoded, resolved or normalised), or one
asked before the folder is listed. A project store is answered only for a listed file (a folder
session's `listed()` resolves once the folder has been listed). The page's
reader answers a refused question null, as core's readers answer for a file they were not given.

```js
// Where the files are: Electron's main process, over a MessageChannelMain port given to the page.
import { listedFiles, portFromMainPort, serveFolder, sourceUri } from 'data-explorer-view/serve';

const files = { list: async () => listedFiles(await listFolder(root)) }; // core's node/folder listing
const served = serveFolder({ files, reader }, portFromMainPort(port1));
watchFolder(root, (paths) => served.changed(paths?.map(sourceUri))); // core's node/folder; no paths: anything

// The page.
import { FolderHierarchy, folderReader, portFromMessagePort } from 'data-explorer-view/model';

const folder = folderReader(portFromMessagePort(port2));
const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
folder.onChange((uris) => hierarchy.rebuild()); // uris: what the host saw change, when it knows
const bytes = await folder.bytes(file); // the page reads the files it opens through it too
```

The uris `changed` sends are a hint: they do not say whether a file was created, deleted or
saved, which the page learns by listing the folder again, and each call is one message. Core's
`watchFolder` (`data-explorer-core/node/folder`, 1.50 or later) reports a burst of a watcher's
events once, by the listing's rules, and says `watching: false`, with its `error`, for a folder
it cannot follow. A listing that stopped at its limit
(`listedFiles` keeps core's `truncated`) reaches the page as one, and the tree ends with a row
that says only the first files are shown.

Over a worker's port, or a `MessagePort`, `serveFolder(folder, port, { transfer: true })` hands
each file's bytes over rather than copying them.

### A folder as a file browser shows it

A `FolderTree` (`data-explorer-view/model`) draws the same folder one level at a time: its
folders, its data files (each the hierarchy's own row, with its references under it) and its
other files. Its rows carry three fields the hierarchy's never do, which the tree draws:

- `dimmed`: a file the app does not open. Its row is in the muted ink, `aria-disabled`, and a
  click or Enter selects it and sends `dex-hierarchy-selected` with `uri: null`, so nothing opens.
- `relation`: what a reference is to the row above it ("model reference", "data dictionary",
  "referenced dictionary", "MAT-file"), drawn after the name in the muted ink.
- `path`: the row's folder or file, for re-rooting and the menu, as the host spells it (a
  reference row's too). `rowPath(item)` answers it, or for a row the hierarchy made, its file's
  path read back from its uri.

`connectHierarchy(element, hierarchy, { tree })` draws a tree's rows in place of the hierarchy's:
every ask for rows goes to it (the top level, a row's rows, `reveal`, the walk back to the row the
user chose), and the hierarchy's refreshes and rebuilds still draw again.

```js
const tree = new FolderTree({ hierarchy, entries: (dir) => folder.entries(dir), root });
const handle = connectHierarchy(element, hierarchy, { tree, expandTopLevel: true });
```

### Marks: how each file stands in the tabs

`marks` (or `handle.setMarks(marks)`) is a map from a file's uri (a row's `id`) to how its tab
stands, in the tabs' own vocabulary, on every row of that file: `open`, a bar in the accent at the
row's left edge (a border in forced colours); `active`, the active tab, `aria-current="true"` and a
fill lighter than the selection's (it is not the tree's selection, which may be another row);
`unsaved`, the ● after the label (the index's own unsaved mark is the same badge, so a row never
shows two); `preview`, the label in italics. Set it again as the tabs change; an empty map marks
nothing.

```js
handle.setMarks(new Map(tabs.map((t) => [t.uri, { open: true, active: t.active, unsaved: t.dirty, preview: t.preview }])));
```

### A row's menu

With `rowMenu` (attribute `row-menu`), a right click on a row, or Shift+F10 or the ContextMenu key
on the focused row, sends `dex-hierarchy-menu` with the row (`item`) and where to draw the menu:
the pointer, or for the keyboard (`keyboard: true`) the row's lower left. The browser's own menu
is kept away, both keys are spent, and the tree names them (`aria-keyshortcuts`). The tree draws
no menu: the app does (a `<dex-context-menu>`), and a connected tree hands it on as the handle's
`menu`. Off, the default, the right click and both keys are the browser's, as they always were.

```js
element.rowMenu = true;
handle.on('menu', ({ item, x, y, keyboard }) => contextMenu.show(x, y, menuFor(item), { focusFirst: keyboard === true }));
```

### Several rows at once

With `multiSelect` (attribute `multi-select`), Cmd+click on macOS, or Ctrl+click elsewhere, takes a
row into the selection, or out of it, without opening it, and so does Cmd+Space or Ctrl+Space on the
focused row: `selectedKeys` holds every selected row
(`selectedKey` the last taken in), `selectedItems` their items in the tree's order, and
`dex-hierarchy-selection-changed` says so. A plain click and Enter still select one row and send
`dex-hierarchy-selected`, as without it. The tree is a multi-selectable one to a screen reader
(`aria-multiselectable`), each row's `aria-selected` following `selectedKeys`. A row the app selects
(`revealRow`, `selectedKey`) is the selection alone. Act on the rows from their row menu, which the
keyboard reaches too (the shell's Folder view: Compare Selected for two files).

```js
element.multiSelect = true;
element.addEventListener('dex-hierarchy-selection-changed', (e) => (compareButton.disabled = e.detail.items.length !== 2));
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-hierarchy>` | `DexHierarchy` | `defineHierarchy(tag = 'dex-hierarchy')` | `data-explorer-view/hierarchy` |

## Properties

### `items`

type `HierarchyItem[]` · default `[]` · property only

The top-level rows. Replacing them asks `loadChildren` again for every open row. Default none.

### `loadChildren`

type `((item: HierarchyItem) => Promise<HierarchyItem[]>) | null` · default `null` · property only

What answers the rows under a row, as it is first opened: a FolderHierarchy's `children`.
Null, the default, opens every row onto nothing.

### `expandedKeys`

type `string[]` · default `[]` · property only

The keys of the open rows. The tree changes it as the user opens and closes rows; a row
whose key is here opens as soon as it is shown. Default none.

### `marks`

type `ReadonlyMap<string, RowMark>` · default `new Map()` · property only

How each file's rows stand in the tabs, by the file's uri (a row's `id`): open, the active
tab, unsaved, a preview. Setting it redraws the rows; it sends nothing. Default none.

### `selectedKey`

type `string | null` · default `null` · property only

The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing.

### `rowMenu`

type `boolean` · default `false` · attribute `row-menu`

Whether a row's menu is the app's: a right click on a row, or Shift+F10 or the ContextMenu key
on the focused row, sends `dex-hierarchy-menu`, the browser's own menu kept away and both keys
spent, and the tree names the keys (`aria-keyshortcuts`). False, the default, leaves the right
click and both keys to the browser, as they always were. Attribute `row-menu`.

### `label`

type `string` · default `'Files'` · attribute `label`

What a screen reader calls the tree. Default `Files`. Attribute `label`.

### `expandTopLevel`

type `boolean` · default `false` · attribute `expand-top-level`

Open each top-level row (a folder's own row, each project's) the first time the tree shows it,
by adding its key to `expandedKeys`, as a table opens its sections; after that the row stays
as the user leaves it, through new `items` too. Another folder's rows are new rows, and open.
Off, the default, a folder opens closed. Attribute `expand-top-level`.

### `multiSelect`

type `boolean` · default `false` · attribute `multi-select`

Cmd+click (macOS) or Ctrl+click takes a row into the selection, or out of it, without opening it,
and so does Cmd+Space or Ctrl+Space on the focused row: `selectedKeys` holds every selected row
and `dex-hierarchy-selection-changed` says so. A plain click or Enter selects that row alone, as
before. Default false: one row at a time. Attribute `multi-select`.

### `selectedKeys`

type `string[]` · default `[]` · property only

With `multiSelect`: the keys of every selected row, `selectedKey` (the last taken in) among them. Property only.

### `selectedItems`

type `HierarchyItem[]` · read-only

The items of `selectedKeys` among the rows loaded, in the tree's order.

## Methods

### `revealRow(path: readonly HierarchyItem[], options?: { choose?: boolean }): void`

Show a row: open each row of `path` but the last (the rows from a top-level row down to it,
as FolderHierarchy's `pathTo` gives them), select the last, and scroll it into view as soon as
it is drawn, once the rows above it are read. The keyboard goes on from it. It takes no focus,
and a choice of the user's before the row is drawn leaves the scroll undone.

Sends nothing, unless `options.choose`: then `dex-hierarchy-selected` for the row, as a click
on it sends, without opening or closing it. connectHierarchy's `reveal(uri)` finds the path to
a file's row.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-hierarchy-selection-changed`

With `multiSelect`, the user changed which rows are selected (a Cmd/Ctrl+click, a plain click or Enter).

`detail` is a `HierarchySelectionChangedDetail`:

```ts
/** What `dex-hierarchy-selection-changed` carries: every selected row, in the tree's order. */
export interface HierarchySelectionChangedDetail {
  keys: string[];
  items: HierarchyItem[];
}

/** One row of a folder's hierarchy, as a tree draws it. */
export interface HierarchyItem {
  /** What the row reads: a file's name, a project's or a folder's, `External Data`, or the name a reference names. */
  label: string;
  /**
   * A file's kind, `group` for a project, a folder or a model's External Data, `missing` for a
   * reference no file answers, or `notice` for the row that says something of the folder rather
   * than being in it (that only its first files are shown). `other` only on a FolderTree's row of
   * a file the app does not open (`dimmed`): FolderHierarchy never makes one.
   */
  kind: NodeKind | 'notice' | 'other';
  /** What a group is (`kind` is `group`). */
  groupKind?: GroupKind;
  /** The uri of the file the row opens: a file's own, a project's marker. None on a row that is no file. */
  id?: string;
  /**
   * A file row's mark: `cycle` when it closes a circular reference, else `modified` when it has
   * unsaved changes, else null. Not on a row that is no file.
   */
  health?: HealthState | null;
  /** `collapsed` when the row has rows under it (`children()` answers them), `none` when it has none. */
  collapsible: 'none' | 'collapsed';
  /** What follows the label: why the row is unlike the others (`unresolved reference`, `↻ circular reference`). */
  description?: string;
  /** More than the label says, for a tooltip. */
  tooltip?: string;
  /** Its icon's id in the package's icons/. None on an unresolved reference, which draws a warning. */
  icon?: string;
  /**
   * The row among its siblings, after its parent's key: the same row has the same key after a
   * rebuild, so a tree keeps what was open.
   */
  key: string;
  // The three below are a FolderTree's (folderTree.ts), for the Folder view: absent on every row
  // FolderHierarchy makes, so the VS Code extension's trees, drawn from these rows, never see them.
  /** A file the app does not open (FolderTree's other files): drawn dimmed, opens nothing. */
  dimmed?: boolean;
  /**
   * The row's path in the host's scheme: a folder's (for re-rooting) or a file's (for Reveal and
   * Copy Path). Only on a FolderTree's rows: an entry's path, and a reference's file's spelled as
   * the root is. FolderHierarchy's rows have none: `rowPath(item)` reads a file's from its uri.
   */
  path?: string;
  /** What a reference row is to its parent, in words ("model reference", "data dictionary", "referenced dictionary"). */
  relation?: string;
}

export type NodeKind = SourceType | 'missing' | 'group';

export type SourceType = 'model' | 'sldd' | 'mat' | 'project';

export type GroupKind = 'external-data' | 'project' | 'folder';

export type HealthState = 'cycle' | 'modified';
```

### `dex-hierarchy-selected`

A row was chosen, by a click or Enter, and is now the selected one: the file it opens, or
null for a row that is no file (or a dimmed one). Sent again each time a row is chosen.

`detail` is a `HierarchySelectedDetail`:

```ts
/** What `dex-hierarchy-selected` carries: the row chosen. */
export interface HierarchySelectedDetail {
  /**
   * The file the row opens (its `id`), or null for a row that is no file: a folder, External Data,
   * a reference no file answers; and for a `dimmed` row, a file the app does not open.
   */
  uri: string | null;
  /** The row's key, as `selectedKey` now holds it. */
  key: string;
  /** The row. */
  item: HierarchyItem;
}

/** One row of a folder's hierarchy, as a tree draws it. */
export interface HierarchyItem {
  /** What the row reads: a file's name, a project's or a folder's, `External Data`, or the name a reference names. */
  label: string;
  /**
   * A file's kind, `group` for a project, a folder or a model's External Data, `missing` for a
   * reference no file answers, or `notice` for the row that says something of the folder rather
   * than being in it (that only its first files are shown). `other` only on a FolderTree's row of
   * a file the app does not open (`dimmed`): FolderHierarchy never makes one.
   */
  kind: NodeKind | 'notice' | 'other';
  /** What a group is (`kind` is `group`). */
  groupKind?: GroupKind;
  /** The uri of the file the row opens: a file's own, a project's marker. None on a row that is no file. */
  id?: string;
  /**
   * A file row's mark: `cycle` when it closes a circular reference, else `modified` when it has
   * unsaved changes, else null. Not on a row that is no file.
   */
  health?: HealthState | null;
  /** `collapsed` when the row has rows under it (`children()` answers them), `none` when it has none. */
  collapsible: 'none' | 'collapsed';
  /** What follows the label: why the row is unlike the others (`unresolved reference`, `↻ circular reference`). */
  description?: string;
  /** More than the label says, for a tooltip. */
  tooltip?: string;
  /** Its icon's id in the package's icons/. None on an unresolved reference, which draws a warning. */
  icon?: string;
  /**
   * The row among its siblings, after its parent's key: the same row has the same key after a
   * rebuild, so a tree keeps what was open.
   */
  key: string;
  // The three below are a FolderTree's (folderTree.ts), for the Folder view: absent on every row
  // FolderHierarchy makes, so the VS Code extension's trees, drawn from these rows, never see them.
  /** A file the app does not open (FolderTree's other files): drawn dimmed, opens nothing. */
  dimmed?: boolean;
  /**
   * The row's path in the host's scheme: a folder's (for re-rooting) or a file's (for Reveal and
   * Copy Path). Only on a FolderTree's rows: an entry's path, and a reference's file's spelled as
   * the root is. FolderHierarchy's rows have none: `rowPath(item)` reads a file's from its uri.
   */
  path?: string;
  /** What a reference row is to its parent, in words ("model reference", "data dictionary", "referenced dictionary"). */
  relation?: string;
}

export type NodeKind = SourceType | 'missing' | 'group';

export type SourceType = 'model' | 'sldd' | 'mat' | 'project';

export type GroupKind = 'external-data' | 'project' | 'folder';

export type HealthState = 'cycle' | 'modified';
```

### `dex-hierarchy-menu`

A row's menu is asked for: a right click on it (the browser's own menu kept away), or Shift+F10
or the ContextMenu key on the focused row (`keyboard`, at the row's lower left). The tree
draws no menu: the app does, for the row's `item`.

`detail` is a `HierarchyMenuDetail`:

```ts
/** What `dex-hierarchy-menu` carries: the row whose menu is asked for, and where to show it. */
export interface HierarchyMenuDetail {
  /** The row. */
  item: HierarchyItem;
  /** Where the menu's left edge goes, in the viewport's pixels: the pointer's, or for the keyboard the row's left edge. */
  x: number;
  /** Where the menu's top edge goes, in the viewport's pixels: the pointer's, or for the keyboard the row's bottom edge. */
  y: number;
  /** Asked by the keyboard (Shift+F10, the ContextMenu key): the menu takes the focus to its first item. */
  keyboard?: true;
}

/** One row of a folder's hierarchy, as a tree draws it. */
export interface HierarchyItem {
  /** What the row reads: a file's name, a project's or a folder's, `External Data`, or the name a reference names. */
  label: string;
  /**
   * A file's kind, `group` for a project, a folder or a model's External Data, `missing` for a
   * reference no file answers, or `notice` for the row that says something of the folder rather
   * than being in it (that only its first files are shown). `other` only on a FolderTree's row of
   * a file the app does not open (`dimmed`): FolderHierarchy never makes one.
   */
  kind: NodeKind | 'notice' | 'other';
  /** What a group is (`kind` is `group`). */
  groupKind?: GroupKind;
  /** The uri of the file the row opens: a file's own, a project's marker. None on a row that is no file. */
  id?: string;
  /**
   * A file row's mark: `cycle` when it closes a circular reference, else `modified` when it has
   * unsaved changes, else null. Not on a row that is no file.
   */
  health?: HealthState | null;
  /** `collapsed` when the row has rows under it (`children()` answers them), `none` when it has none. */
  collapsible: 'none' | 'collapsed';
  /** What follows the label: why the row is unlike the others (`unresolved reference`, `↻ circular reference`). */
  description?: string;
  /** More than the label says, for a tooltip. */
  tooltip?: string;
  /** Its icon's id in the package's icons/. None on an unresolved reference, which draws a warning. */
  icon?: string;
  /**
   * The row among its siblings, after its parent's key: the same row has the same key after a
   * rebuild, so a tree keeps what was open.
   */
  key: string;
  // The three below are a FolderTree's (folderTree.ts), for the Folder view: absent on every row
  // FolderHierarchy makes, so the VS Code extension's trees, drawn from these rows, never see them.
  /** A file the app does not open (FolderTree's other files): drawn dimmed, opens nothing. */
  dimmed?: boolean;
  /**
   * The row's path in the host's scheme: a folder's (for re-rooting) or a file's (for Reveal and
   * Copy Path). Only on a FolderTree's rows: an entry's path, and a reference's file's spelled as
   * the root is. FolderHierarchy's rows have none: `rowPath(item)` reads a file's from its uri.
   */
  path?: string;
  /** What a reference row is to its parent, in words ("model reference", "data dictionary", "referenced dictionary"). */
  relation?: string;
}

export type NodeKind = SourceType | 'missing' | 'group';

export type SourceType = 'model' | 'sldd' | 'mat' | 'project';

export type GroupKind = 'external-data' | 'project' | 'folder';

export type HealthState = 'cycle' | 'modified';
```

## Parts it defines

`defineHierarchy()` defines these first, under their default names, then `<dex-hierarchy>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-modified` | `#b45309` | The Status column's "Modified". |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-color-warning` | `#d83b01` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-row-height` | `28px` |  |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
