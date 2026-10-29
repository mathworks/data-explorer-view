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
const handle = connectHierarchy(tree, hierarchy, { empty: document.querySelector('#no-files') });
handle.on('open', (uri) => openTab(uri));

// When a file in the folder is created, deleted or saved:
hierarchy.rebuild();
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

### `selectedKey`

type `string | null` · default `null` · property only

The key of the selected row, or null. The tree changes it as the user chooses; setting it sends nothing.

### `label`

type `string` · default `'Files'` · attribute `label`

What a screen reader calls the tree. Default `Files`. Attribute `label`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-hierarchy-select`

A row was chosen, by a click or Enter, and is now the selected one: the file it opens, or
null for a row that is no file. Sent again each time a row is chosen.

`detail` is a `HierarchySelectDetail`:

```ts
export interface HierarchySelectDetail {
  /** The file the row opens (its `id`), or null for a row that is no file: a folder, External Data, a reference no file answers. */
  uri: string | null;
  /** The row's key, as `selectedKey` now holds it. */
  key: string;
  /** The row. */
  item: HierarchyItem;
}

export interface HierarchyItem {
  /** What the row reads: a file's name, a project's or a folder's, `External Data`, or the name a reference names. */
  label: string;
  /** A file's kind, `group` for a project, a folder or a model's External Data, or `missing` for a reference no file answers. */
  kind: NodeKind;
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
