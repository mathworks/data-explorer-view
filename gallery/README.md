# Gallery

Every widget of data-explorer-view on a page of its own, and one page that composes
them, on small public files that data-explorer-core reads in the page. It is three
things at once: a way to see the widgets, the fixture the browser tests run against,
and an example of an app that uses the package. It is not part of the package (npm
packs only `dist/`, `icons/` and `src/theme/`).

```sh
npm run gallery         # the dev server
npm run gallery:build   # typecheck, then build to gallery/dist/
npm run test:gallery    # the browser tests (see below)
```

## Pages

| Page | Shows |
|---|---|
| `tree-table.html` | a data dictionary (text and zip), a MAT-file and a model, each in a `<dex-tree-table>`; its read-only switch; the events it sends |
| `property-inspector.html` | `<dex-property-inspector>` with the properties of an entry picked from a list |
| `variable-editor.html` | `<dex-variable-editor>` on a matrix, a 3-D array and a 4-D one |
| `context-menu.html` | `<dex-context-menu>`, from a right-click and from the keyboard |
| `error-dialog.html` | `<dex-error-dialog>`: an error, and a refused edit with Revert |
| `project-page.html` | a MATLAB project's page, from its project store |
| `composed.html` | table, inspector and variable editor together: the selection fills the inspector, the matrix glyph opens the editor |

Each page has the theme switch (light, dark, high contrast) in its header: it sets
`data-theme` on `<html>`, which is all `theme.css` reads.

## How it uses the package

The pages import `data-explorer-view` by its name and only through its public entries
(`/model`, `/tree-table`, `/property-inspector`, `/variable-editor`, `/context-menu`,
`/error-dialog`, `/project-page`, `/icon-assets`, `/theme.css`). Inside this repository
the name resolves to the repository itself, through `package.json`'s `exports` (a
package may import itself by name), so the pages run the committed `dist/` as an app
that installs the package does, and `gallery/tsconfig.json` checks them against the
published declarations.

- `src/shell.ts` is the part an app writes once: `theme.css`, then `useIconAssets()`
  before the first icon renders, so Vite copies every icon into the build.
- Each page in `src/pages/` calls the define function of each widget it places.
- `vite.config.ts` has what view's README asks of a Vite app: for the dev server,
  `optimizeDeps.exclude: ['data-explorer-view']` and an `optimizeDeps.include` of
  what the package imports (`tests/devServer.spec.ts` holds both lists to `dist/`);
  and `build.assetsInlineLimit: 0`, which keeps the icons files (no `data:` URLs, so the
  pages' Content-Security-Policy keeps `img-src 'self'`). Every page runs under a strict
  policy (no inline styles, no other origins); the dev server alone also allows inline
  styles, because it injects each stylesheet as a `<style>` element.

## The wiring

`src/wiring/` is what an app writes today to feed the widgets: read a file into core's
session (`documents.ts`), build the table's rows, the inspector's properties and the
variable editor's cells with view's model (`tableData.ts`), and connect the widgets'
events to those answers (`tableWiring.ts`, `inspectorWiring.ts`, `matrixWiring.ts`). The
project page is an HTML string; `projectWiring.ts` reads the project store, puts the
page in the document and handles its filters and links.

It is written by hand on purpose, so it shows what each widget asks of an app. It will
shrink as view takes over reading files for a table and connecting the inspector and the
variable editor to it.

## Tests

`tests/` are Playwright tests: every page loads with no console error, uncaught
exception or failed request, and every icon draws; each kind of file draws its rows; a
click and the arrow keys move the selection; the selection fills the inspector; the
matrix glyph opens the editor on the right cells; the menu, the dialog and the project
page answer the mouse and the keyboard; and the theme switch changes the colours of the
page and of the widgets. They check behaviour, not pixels, so they hold across engines.

They run against the built gallery in Chromium, Firefox and WebKit, and against the dev
server in Chromium (`chromium-dev`), each project on a port of its own (4791, 4792).
Playwright starts both servers. The first run needs the browsers:

```sh
npx playwright install chromium firefox webkit
npm run test:gallery                          # all four projects
npm run test:gallery -- --project=chromium    # one
```
