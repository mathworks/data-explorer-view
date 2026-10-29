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
  "data-explorer-view": "github:mathworks/data-explorer-view#v0.1.0",
  "data-explorer-core": "github:mathworks/data-explorer-core#v1.47.0",
  "lit": "^3.2.0"
}
```

`data-explorer-core` and `lit` are peer dependencies: your app installs them
itself, so a page holds one copy of each. For core that matters beyond size:
the model recognises core's nodes with `instanceof`, which two copies of core
would break. This release accepts core `^1.47.0` and lit `^3.2.0`.

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
| `data-explorer-view/model` | the view model: rows, inspector pages, matrix cells, the rules for actions |
| `data-explorer-view/tree-table` | [`<dex-tree-table>`](docs/widgets/tree-table.md) and its parts ([filter bar](docs/widgets/filter-bar.md), [column filter](docs/widgets/column-filter.md), [Add gallery](docs/widgets/add-gallery.md), [matrix glyph](docs/widgets/matrix-open.md)), and the items of its context menu |
| `data-explorer-view/property-inspector` | [`<dex-property-inspector>`](docs/widgets/property-inspector.md) |
| `data-explorer-view/variable-editor` | [`<dex-variable-editor>`](docs/widgets/variable-editor.md) and the [grid](docs/widgets/matrix-grid.md) inside it |
| `data-explorer-view/context-menu` | [`<dex-context-menu>`](docs/widgets/context-menu.md) |
| `data-explorer-view/error-dialog` | [`<dex-error-dialog>`](docs/widgets/error-dialog.md) |
| `data-explorer-view/project-page` | a project's page, as HTML and the stylesheet it is drawn with |
| `data-explorer-view/icon` | [`<dex-icon>`](docs/widgets/icon.md) and `setIconBase` |
| `data-explorer-view/icon-assets` | `useIconAssets`, the icons as assets of your bundle (see below) |
| `data-explorer-view/theme.css` | the colour, font and size tokens |
| `data-explorer-view/icons/<id>.svg` | the icons |

Nothing runs on import, and the package says so (`sideEffects` in
`package.json` names only the stylesheets), so a bundler keeps only the
modules your app uses.

Each widget's page (linked above) lists its properties and attributes, its
methods, the events it sends with the shape of each `detail`, the parts it
defines and the theme tokens it reads. The same is in `custom-elements.json`
(the [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest),
named by `customElements` in `package.json`) for editors and tools. In
TypeScript the tags and events are typed: `document.createElement('dex-tree-table')`
is a `DexTreeTable`, and a listener's `e.detail` has its type with no cast:

```ts
table.addEventListener('dex-row-selected', (e) => {
  e.detail.rowIds; // string[]
});
```

## What is in it

**`model/`** builds what the widgets show from core's data model: the table's
rows, the property inspector's pages and the variable editor's cells. It also
holds the rules for filtering, and for which rows an action, a drop or a paste
acts on. It uses no DOM and no Node, so it runs in a page, a worker or a
terminal UI.

```js
import { buildRows, COLUMNS, COLUMN_LABELS } from 'data-explorer-view/model';
```

**`widgets/`** are [Lit](https://lit.dev) custom elements: the tree table (with
its filter bar, column filter and Add gallery), the property inspector, the
variable editor, the context menu, the error dialog and the project page.
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

In Vite's dev server, leave the package out of dependency pre-bundling
(`optimizeDeps: { exclude: ['data-explorer-view'] }`): a pre-bundled copy of
the module is no longer beside the icons. Vite turns icons smaller than its
`build.assetsInlineLimit` into `data:` URLs, so a Content-Security-Policy needs
`img-src data:` unless that limit is 0.

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

## License

BSD 3-Clause. See [LICENSE](LICENSE). To report a security issue, see
[SECURITY.md](SECURITY.md).
