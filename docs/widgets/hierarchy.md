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
nothing (`{ choose: true }` sends `dex-hierarchy-select`, and so `open`, as a click does). A file
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
asked before the folder is listed. A project store is answered only for a listed file. The page's
reader answers a refused question null, as core's readers answer for a file they were not given.

```js
// Where the files are: Electron's main process, over a MessageChannelMain port given to the page.
import { listedFiles, portFromMainPort, serveFolder, sourceUri } from 'data-explorer-view/serve';

const files = { list: async () => listedFiles(await listFolder(root)) }; // core's node/folder listing
const served = serveFolder({ files, reader }, portFromMainPort(port1));
watcher.on('change', (path) => served.changed([sourceUri(path)])); // or changed(): something changed

// The page.
import { FolderHierarchy, folderReader, portFromMessagePort } from 'data-explorer-view/model';

const folder = folderReader(portFromMessagePort(port2));
const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
folder.onChange((uris) => hierarchy.rebuild()); // uris: what the host saw change, when it knows
const bytes = await folder.bytes(file); // the page reads the files it opens through it too
```

The uris `changed` sends are a hint: they do not say whether a file was created, deleted or
saved, which the page learns by listing the folder again, and each call is one message, so
debouncing a watcher's bursts is the host's. A listing that stopped at its limit
(`listedFiles` keeps core's `truncated`) reaches the page as one, and the tree ends with a row
that says only the first files are shown.

Over a worker's port, or a `MessagePort`, `serveFolder(folder, port, { transfer: true })` hands
each file's bytes over rather than copying them.

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

### `selectedKey`

type `string | null` · default `null` · property only

The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing.

### `label`

type `string` · default `'Files'` · attribute `label`

What a screen reader calls the tree. Default `Files`. Attribute `label`.

### `expandTopLevel`

type `boolean` · default `false` · attribute `expand-top-level`

Open each top-level row (a folder's own row, each project's) the first time the tree shows it,
by adding its key to `expandedKeys`, as a table opens its sections; after that the row stays
as the user leaves it, through new `items` too. Another folder's rows are new rows, and open.
Off, the default, a folder opens closed. Attribute `expand-top-level`.

## Methods

### `revealRow(path: readonly HierarchyItem[], options?: { choose?: boolean }): void`

Show a row: open each row of `path` but the last (the rows from a top-level row down to it,
as FolderHierarchy's `pathTo` gives them), select the last, and scroll it into view as soon as
it is drawn, once the rows above it are read. The keyboard goes on from it. It takes no focus,
and a choice of the user's before the row is drawn leaves the scroll undone.

Sends nothing, unless `options.choose`: then `dex-hierarchy-select` for the row, as a click on
it sends, without opening or closing it. connectHierarchy's `reveal(uri)` finds the path to a
file's row.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-hierarchy-select`

A row was chosen, by a click or Enter, and is now the selected one: the file it opens, or
null for a row that is no file. Sent again each time a row is chosen.

`detail` is a `HierarchySelectDetail`:

```ts
/** What `dex-hierarchy-select` carries: the row chosen. */
export interface HierarchySelectDetail {
  /** The file the row opens (its `id`), or null for a row that is no file: a folder, External Data, a reference no file answers. */
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
   * than being in it (that only its first files are shown).
   */
  kind: NodeKind | 'notice';
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
| `--dex-bg-hover` | `#e8e8e8` |  |
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
