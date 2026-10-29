# data-explorer-view

Widgets and view model for Simulink data files: data dictionaries (`.sldd`),
models (`.slx`, `.mdl`), MAT-files (`.mat`) and projects. Built on
[data-explorer-core](https://github.com/mathworks/data-explorer-core), which
reads the files; this package shows them.

It is the table, property inspector and variable editor of the [Simulink Data
Explorer VS Code extension](https://github.com/mathworks/data-explorer-vscode),
as standalone web components, together with the code that turns core's data
model into what they display.

## Status

Version 0.x: the API will change. Import from the entry points below, one for
the model and one per widget. The module paths of 0.1.0
(`data-explorer-view/model/<path>.js`, `data-explorer-view/widgets/<path>.js`)
still work during 0.x and go before 1.0.0. Pin a tag, and read the release
notes before you move the pin.

## Using it

```json
"dependencies": {
  "data-explorer-view": "github:mathworks/data-explorer-view#v0.2.0",
  "data-explorer-core": "github:mathworks/data-explorer-core#v1.48.0",
  "lit": "^3.2.0"
}
```

`data-explorer-core` and `lit` are peer dependencies: your app installs them
itself, so a page holds one copy of each. For core that matters beyond size:
the model recognises core's nodes with `instanceof`, which two copies of core
would break. This release accepts core `^1.48.0` and lit `^3.2.0`.

Releases are tags, and `dist/` is committed, so installing needs no build step.

## Using a widget

Each widget has an entry of its own, which exports its class, its define
function and the types of what it takes and sends:

```js
import 'data-explorer-view/theme.css';
import { setIconBase } from 'data-explorer-view/icon';
import { defineTreeTable } from 'data-explorer-view/tree-table';
import { definePropertyInspector } from 'data-explorer-view/property-inspector';
import { defineVariableEditor } from 'data-explorer-view/variable-editor';

setIconBase('./icons/'); // where your app serves icons/ (see below)
defineTreeTable();       // <dex-tree-table>, and the filter bar, column filter and Add gallery it draws
definePropertyInspector();
defineVariableEditor();
```

| Entry | What it holds |
|---|---|
| `data-explorer-view/model` | the view model: a workspace that opens files, rows, inspector pages, matrix cells, the rules for actions, a folder's hierarchy |
| `data-explorer-view/host` | for a host that serves the wire format, not for an app: the document registry over core's module-level session, the answers posted to a webview, the inspector's page (also in `/model` until 1.0, deprecated there) |
| `data-explorer-view/tree-table` | [`<dex-tree-table>`](docs/widgets/tree-table.md) and its parts ([filter bar](docs/widgets/filter-bar.md), [column filter](docs/widgets/column-filter.md), [Add gallery](docs/widgets/add-gallery.md), [matrix glyph](docs/widgets/matrix-open.md)), and the items of its context menu |
| `data-explorer-view/property-inspector` | [`<dex-property-inspector>`](docs/widgets/property-inspector.md) |
| `data-explorer-view/variable-editor` | [`<dex-variable-editor>`](docs/widgets/variable-editor.md) and the [grid](docs/widgets/matrix-grid.md) inside it |
| `data-explorer-view/context-menu` | [`<dex-context-menu>`](docs/widgets/context-menu.md) |
| `data-explorer-view/error-dialog` | [`<dex-error-dialog>`](docs/widgets/error-dialog.md) |
| `data-explorer-view/project-page` | [`<dex-project-page>`](docs/widgets/project-page.md), a project's page, and the HTML renderer and stylesheet it draws with |
| `data-explorer-view/hierarchy` | [`<dex-hierarchy>`](docs/widgets/hierarchy.md), a folder's files and what each references, and `connectHierarchy` |
| `data-explorer-view/icon` | [`<dex-icon>`](docs/widgets/icon.md) and `setIconBase` |
| `data-explorer-view/icon-assets` | `useIconAssets`, the icons as assets of your bundle (see below) |
| `data-explorer-view/theme.css` | the colour, font and size tokens |
| `data-explorer-view/icons/<id>.svg` | the icons |

Nothing runs on import, and the package says so (`sideEffects` in
`package.json` names only the stylesheets), so a bundler keeps only the
modules your app uses.

Each widget's page (linked above, and in the package under `docs/widgets/`)
lists its properties and attributes, its methods, the events it sends with the
shape of each `detail`, the parts it defines and the theme tokens it reads. The
same is in `custom-elements.json`
(the [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest),
named by `customElements` in `package.json`) for editors and tools. In
TypeScript the tags and events are typed: `document.createElement('dex-tree-table')`
is a `DexTreeTable`, and a listener's `e.detail` has its type with no cast, on
the element or, since every event bubbles out of its shadow root, on the
document or the window:

```ts
table.addEventListener('dex-row-selected', (e) => {
  e.detail.rowIds; // string[]
});
document.addEventListener('dex-matrix-open', (e) => {
  e.detail.matrix.nodeId; // string
});
```

## Show a file in a table (preview)

A workspace opens files in the page, with core, and gives each one a table
source; `connectTable` and `connectInspector` wire the widgets to it.

```js
import { createWorkspace } from 'data-explorer-view/model';
import { connectTable } from 'data-explorer-view/tree-table';
import { connectInspector } from 'data-explorer-view/property-inspector';

const doc = await createWorkspace().open(await file.arrayBuffer(), file.name); // a File, from an <input> or a drop
const handle = connectTable(table, doc.table);
connectInspector(inspector, handle); // follows the table's selection
```

The table then shows the file and its banners (what the read could not read,
what was held back), fetches the rows under a row as it is opened, opens the
variable editor on a matrix and fills it, keeps what the user opened and
selected when the file changes, selects the row a Data Type link names, and has
a read-only context menu (Copy Name, Copy Value) and Ctrl+F. The rest is the
app's, on the handle: `handle.on('navigate', ({ link }) => …)` for a link to
another document or a file, `handle.on('select', (rowIds) => …)`, and
`handle.selectByName(name)` for a link that arrives from another table. The
table's `readonly` stays the app's to set, and connectTable's options take
over more: `menuItems` adds the app's own menu items, `copy` puts a copy on the
app's clipboard rather than the page's (a copy that fails, on either, says so
in the error banner), and `columns` leaves out a column nothing fills in a
document. One inspector beside several tables follows the active one with
`follow(handle)`, and shows its empty state after `follow(null)`.

When the file changes, `doc.reload(bytes)` reads it again and the table
repaints. A document's uri is its identity, in every row id: by default
`file:///<name>`; to open two files that share a name, pass each one's
`sourceUri(path)` as the third argument, which spells a path as VS Code does.
`uriPath(uri)` reads one back into the path, Windows paths included, and takes
a link's `source` as it comes: the file to open for a link to another
document.
`doc.dispose()` closes a document, `ws.dispose()` all of them. A source answers
what the VS Code extension shows for the same file, read-only; editing comes in
a later release. A project (`doc.kind === 'project'`) opens on a page rather
than in a table: `<dex-project-page>` draws the message `readProjectPage(markerPath,
fs)` reads from its store (core's `StoreFs`; `nodeStoreFs` from
`data-explorer-core/node` in Electron or Node), the message the extension's
project page is sent, and says `dex-project-open` with the path of a link to
follow.

A source can also be across a message channel, to a worker or another
process holding the documents: `serveTable(doc.table, port)` on the side that
holds them, and `connectTable(table, messageSource(port))` on the page's side,
where `port` is any `{ postMessage, onMessage }` (`TablePort`). The messages
are the extension's own table protocol (`TableHostMessage`,
`TableClientMessage`), and the table behaves as it does beside its source.

## Show a folder (preview)

A `FolderHierarchy` reads a folder's files through core's source cache and
answers its hierarchy as rows: each project and folder, the files in it, and
under each file the files it references, with the references no file answers
and the files that close a cycle marked. `<dex-hierarchy>` draws them, and
`connectHierarchy` wires the two:

```js
import { FolderHierarchy } from 'data-explorer-view/model';
import { connectHierarchy, defineHierarchy } from 'data-explorer-view/hierarchy';

const hierarchy = new FolderHierarchy({
  files: { list: async () => files },        // the folder's SourceFiles, in a stable order
  reader: (files) => readerFor(files),       // a GraphReader: versions, bytes, project stores
});
defineHierarchy();
const handle = connectHierarchy(tree, hierarchy, { expandTopLevel: true }); // the folder's row open
handle.on('open', (uri) => openTab(uri));
handle.reveal(activeTab.uri); // show the file the app has open: its row opened up to and selected
```

The app lists the folder and reads its files: in Electron or Node, core's
`nodeSourceReader(files)` and `readProjectStoreFromDisk(path)`
(`data-explorer-core/node`) are a reader. `hierarchy.rebuild()` reads the
folder again when a file in it is created, deleted or saved (only what changed
is read), and `refresh()` redraws the marks for a file's unsaved changes
(`isDirty`). `resolveReference(name, referrer)` answers which file a bare name
means, by the rule the tree draws with. The rows are what the VS Code
extension's sidebar draws for the same folder.

A page with no file system (a sandboxed Electron window) has its folder read
where the files are, across one message channel: `serveFolder({ files, reader },
port)` there (Electron's main process, a worker), and `folderReader(port)` in
the page, which is both the folder's `files` and its `reader`
(`new FolderHierarchy({ files: folder, reader: () => folder })`). The host reads
only the files it listed: a question names a file by its exact uri in the host's
own listing, and any other is refused with nothing read. `changed()` on its end
tells the page's `onChange` listeners to rebuild. A table beside the tree opens the file the tree
shows for a name a link holds with connectTable's `resolveLink:
(link, fromUri) => hierarchy.resolveLink(link, fromUri)`, whose answer arrives on
`navigate` as `uri`. See [the hierarchy's page](docs/widgets/hierarchy.md).

The Usage column says who uses each variable of a dictionary or a MAT-file,
and where each parameter of a model's blocks comes from: answers that are in
the files around a document, not in it. A workspace fills it from the folder
when it is given a `usage` source. `UsageGraphs` is one: a usage graph per
document, over just the files that can reach it (core's `planSummaries`), kept
until the folder changes:

```js
import { isGraphPath } from 'data-explorer-core';
import { UsageGraphs, createUsageRepostHub, createWorkspace } from 'data-explorer-view/model';

const graphFiles = files.filter((f) => isGraphPath(f.path)); // no projects
const graphs = new UsageGraphs({
  inputs: { inputsKey: () => '', candidates: async () => graphFiles, readerFor },
  cache: hierarchy.cache, // read the folder once for the tree and the column
});
const reposts = createUsageRepostHub({ watch: watchCreatesAndDeletes, graphs });
const ws = createWorkspace({ usage: graphs, usageReposts: reposts });
await ws.open(bytes, name, sourceUri(path)); // the uri the folder lists it by
```

Every paint and every fetch of rows is filled, as the extension fills its
tables. When a file of the folder changes, `graphs.invalidate()` (only what
changed is read again). A model created or deleted can change what a
dictionary's or a MAT-file's column says, so the repost hub, given the app's
watch on the folder (held only while such a table is open), drops the graphs
and repaints each of those tables once per burst. An editor that also reads
its open files names them in `inputsKey` and `candidates`. A click on a Usage
link reaches `handle.on('navigate')`: `resolveNavSource(source, referrer, {
scoped: hierarchy.resolveReference, firstMatch })` names the file to open, by
the rule the hierarchy draws with, and `selectByName` the row (a block by its
key). `parseNavTarget` reads a link target on its own.

## What is in it

**`model/`** builds what the widgets show from core's data model: the table's
rows, the property inspector's pages and the variable editor's cells. It also
holds the rules for filtering, and for which rows an action, a drop or a paste
acts on. It uses no DOM and no Node, so it runs in a page, a worker or a
terminal UI.

```js
import { createWorkspace } from 'data-explorer-view/model';

const doc = await createWorkspace().open(bytes, name); // core reads the file
const { rows } = await doc.table.open(); // the table's rows
```

**`widgets/`** are [Lit](https://lit.dev) custom elements: the tree table (with
its filter bar, column filter and Add gallery), the property inspector, the
variable editor, the context menu, the error dialog, the folder hierarchy and
the project page.
Importing a widget defines nothing: call its define function before the
first element is created, as above. It defines the parts the widget draws (the table's
filter bar, for example) under their default names, then the widget, under
the name you pass or its default. A name already defined by a different class
throws, naming both.

```js
import { defineTreeTable } from 'data-explorer-view/tree-table';

defineTreeTable(); // <dex-tree-table>; or defineTreeTable('my-table')
```

Every widget honours the `hidden` attribute, and sets its inline styles
through the CSSOM, so it draws on a page whose Content-Security-Policy has no
`style-src 'unsafe-inline'`. The tree table's defaults are a full editor; an
app turns parts of it off or over:

| Property (attribute) | Default | |
|---|---|---|
| `readonly` (`readonly`) | `false` | no cell editor, no `+ Add`, no row drag or drop |
| `canAdd`, `rowDrag` | `false`, `true` | the `+ Add` button; dragging rows |
| `expandTopLevel` (`expand-top-level`) | `false` | open the top level of the first rows, then keep what the user opened |
| `expandedIds`, `expand(ids)`, `collapse(ids)` | | which rows are open |
| `storageKey` (`storage-key`) | `'dex'` | the prefix of the localStorage keys the column choices are kept under; `null` keeps them out of storage |

**`icons/`** holds the SVG files the widgets draw
(`data-explorer-view/icons/<id>.svg`): every icon a row, an Add gallery tile or
a button can ask for. By default a widget loads them from the package's own
`icons/` folder, found from the module's URL, which works wherever the
package's files are served as installed (a static server, an import map). A
bundler moves the widgets into a chunk of its own, so an app that bundles
copies the folder to where it serves its assets and says where, before the
first icon renders:

```js
import { setIconBase } from 'data-explorer-view/icon';

setIconBase('./icons/'); // a folder URL; relative ones resolve against the page
```

Or let the bundler copy them. `data-explorer-view/icon-assets` names each icon
as `new URL('…/<id>.svg', import.meta.url)`, which bundlers that follow that
form (Vite, webpack 5, Parcel) copy into the build, and `useIconAssets()` draws
every icon from there, in place of `setIconBase`:

```js
import { useIconAssets } from 'data-explorer-view/icon-assets';

useIconAssets(); // before the first icon renders
```

With a bundler, two of its settings matter here: see [Icons with a
bundler](#icons-with-a-bundler).

**`theme.css`** holds every colour, font and size token the widgets read: light
defaults, and `[data-theme="dark"]` and `[data-theme="high-contrast"]` sets
(put the attribute on `<html>`). Each widget falls back to the light value of
every token it reads, so a widget is readable on a page that loads no theme at
all. The icons are drawn for a light background, and the dark set turns them
over with `--dex-icon-filter`. To match your app, declare the `--dex-*` tokens
after this file, or map them onto your own design system's variables.

```js
import 'data-explorer-view/theme.css';
```

`theme/global.css` still works during 0.x (the tokens plus a full-window page
layout) and goes before 1.0.0.

## Icons with a bundler

With `useIconAssets()` the bundler copies the icons, and two settings decide how
it serves them. With Vite:

- **Dev server: `optimizeDeps`.** Leave the package out of dependency
  pre-bundling: a pre-bundled copy of the module is no longer beside the icons.
  Vite then does not look inside the package for what it imports either, so
  name those for pre-bundling. Otherwise the dev server finds them as the first
  page loads, and reloads that page.
- **Build: `build.assetsInlineLimit`.** Vite turns each asset smaller than this
  (4 KB by default) into a `data:` URL in the bundle. Nearly every icon is
  smaller, so by default the page carries the whole icon set as text, and its
  Content-Security-Policy has to allow `img-src data:`. At `0` the icons stay
  files the page loads only when it draws them, under `img-src 'self'`. A
  function keeps your own small assets inlined and the icons files.

```js
// vite.config.js
export default {
  optimizeDeps: {
    exclude: ['data-explorer-view'],
    include: ['data-explorer-core', 'lit', 'lit/decorators.js', 'lit/directive.js', 'lit/directives/live.js'],
  },
  build: {
    assetsInlineLimit: 0,
    // or: never inline the icons, and decide the rest as Vite would
    // assetsInlineLimit: (file) => (file.includes('/data-explorer-view/icons/') ? false : undefined),
  },
};
```

The [gallery](gallery/README.md) is built this way and runs under
`style-src 'self'; img-src 'self'` in Chromium, Firefox and WebKit.

## Developing

```sh
npm ci
npm run verify   # typecheck, import boundaries, build, API check, tests, leak check
```

After changing `src/`, run `npm run build` and commit `dist/`,
`custom-elements.json` and `docs/widgets/` with the change. CI fails when
they are not the build of `src/`. A widget's page is written below its marker
line from the manifest: change the widget's JSDoc, not the page.

`npm run check:api` compares the manifest with the one in the latest release
tag. A widget, property, method, attribute or event that is gone or renamed
fails it, unless `package.json`'s version is a major bump (while 0.x, a minor
one) over that tag's.

The gallery shows every widget on a page of its own, on small public files, and
is what the browser tests run against, in Chromium, Firefox and WebKit. It is
also an example of an app built on the package. See
[gallery/README.md](gallery/README.md).

```sh
npm run gallery        # the pages, in Vite's dev server
npm run test:gallery   # the browser tests
```

## License

BSD 3-Clause. See [LICENSE](LICENSE). To report a security issue, see
[SECURITY.md](SECURITY.md).
