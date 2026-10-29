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

Version 0.x: the API will change. Today every module is reachable by its path;
designed entry points (one for the model, one per widget) replace that before
1.0.0. Pin a tag, and read the release notes before you move the pin.

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

## What is in it

**`model/`** builds what the widgets show from core's data model: the table's
rows, the property inspector's pages and the variable editor's cells. It also
holds the rules for filtering, and for which rows an action, a drop or a paste
acts on. It uses no DOM and no Node, so it runs in a page, a worker or a
terminal UI.

```js
import { buildRows } from 'data-explorer-view/model/rows/rowBuilder.js';
```

**`widgets/`** are [Lit](https://lit.dev) custom elements: the tree table (with
its filter bar, column filter and Add gallery), the property inspector, the
variable editor, the context menu, the error dialog and the project page.
Importing a widget's module defines its element.

```js
import 'data-explorer-view/widgets/tree-table/dex-tree-table.js';
```

Icons are loaded from `icons/<id>.svg` under the page's base URL
(`import.meta.env.BASE_URL`, which Vite sets); this release does not ship the
icon files.

**`theme/global.css`** holds the colour and font tokens the widgets read,
with light defaults and `[data-theme="dark"]` and `[data-theme="high-contrast"]`
sets. Load it once in the page; override the tokens to match your app.

```js
import 'data-explorer-view/theme/global.css';
```

## Developing

```sh
npm ci
npm run verify   # typecheck, import boundaries, build, tests, leak check
```

After changing `src/`, run `npm run build` and commit `dist/` with the change.
CI fails when `dist/` is not the build of `src/`.

## License

BSD 3-Clause. See [LICENSE](LICENSE). To report a security issue, see
[SECURITY.md](SECURITY.md).
