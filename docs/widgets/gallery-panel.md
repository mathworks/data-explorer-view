# `<dex-gallery-panel>`

The app shell's Gallery: the [Add gallery](add-gallery.md)'s tiles as a palette that is always
open in a sidebar, under a heading that names the file an add lands in ("Add to plant.sldd"). A
click on a tile sends `dex-gallery-add` with its class and section, for the app to add one entry
of it to the active file; the panel adds nothing itself.

What it offers is the Add gallery's: every tile of a dictionary by default, or, with `classes`, a
MAT-file's or a model workspace's classes (and the tiles of the `sections` beside them, a model's
configurations). While `disabled` (nothing open, or a project), a note says what to open, and the
tiles are shown faded and take no press.

```js
import { defineGalleryPanel } from 'data-explorer-view/app-shell';

defineGalleryPanel(); // and the <dex-add-gallery> it draws
const gallery = document.querySelector('dex-gallery-panel');

function follow(tab) { // as the active tab changes
  const view = tab?.handle?.view; // the TableView connectTable last painted
  gallery.target = tab?.name ?? '';
  gallery.disabled = !tab?.doc?.editable;
  gallery.classes = view?.add?.classes ?? null;
  gallery.sections = view?.addSections ?? null;
}
gallery.addEventListener('dex-gallery-add', (e) => {
  const { className, section } = e.detail;
  activeDoc.table.addEntry({ className, section, rename: true }); // an EditableTableSource
});
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-gallery-panel>` | `DexGalleryPanel` | `defineGalleryPanel(tag = 'dex-gallery-panel')` | `data-explorer-view/app-shell` |

## Properties

### `classes`

type `readonly string[] | null` · default `null` · property only

The classes a MAT-file or a model's workspace can take a new variable of (a TableView's
`add.classes`), or null for a dictionary's every tile. The Add gallery's `classes`, forwarded.
Default null. Property only.

### `sections`

type `readonly string[] | null` · default `null` · property only

With `classes`, the sections beside the file's variables whose every tile is offered too (a
TableView's `addSections`: a model's `config`). The Add gallery's `sections`, forwarded.
Default null: none. Property only.

### `target`

type `string` · default `''` · attribute `target`

The name of the file an add lands in, the active one: the heading reads "Add to" it. Default
empty, and the heading reads "Add". Attribute `target`.

### `disabled`

type `boolean` · default `false` · attribute `disabled`

Whether the active file takes no new entry (none is open, or it is a project): a note says to
open a dictionary, a MAT-file or a model, and the tiles are shown faded and send nothing.
Default false. Attribute `disabled`.

### `note`

type `string` · default `'Open a dictionary, a MAT-file or a model to add entries.'` · attribute `note`

What the note says while `disabled`: why no entry can be added, as the app knows it ("plant.mdl
takes no edits."). Default 'Open a dictionary, a MAT-file or a model to add entries.'.
Attribute `note`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-gallery-add`

A tile was clicked: add one entry of its class, in its section, to the active file. Not sent
while the panel is disabled. The Add gallery's own `dex-add-tile` does not leave the panel.
A request.

`detail` is a `GalleryAddDetail`:

```ts
/**
 * What `dex-gallery-add` carries: the tile's class, its section ('' for a MAT-file's variable, a
 * section of the file's own by its key otherwise) and its label, as the Add gallery's
 * `dex-add-tile` names them.
 */
export interface GalleryAddDetail {
  className: string;
  section: string;
  label: string;
}
```

## Parts it defines

`defineGalleryPanel()` defines these first, under their default names, then `<dex-gallery-panel>`:

- [`<dex-add-gallery>`](add-gallery.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
