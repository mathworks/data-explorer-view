# `<dex-project-page>`

A MATLAB project's page: its name and folder, what kind of project it is, its startup and
shutdown files, shortcuts, project path, labels, locations and the projects it references, and
what the read could not read. A section with many rows has a filter, and one past its cap a Show
all; both are kept across a new page of the same project, as when its store is saved, and
cleared for another project. A Managed Simulink Project's page also names its interface and
private dictionaries and its role.

The page is drawn from the message `projectPageMessage` (or `readProjectPage`, which reads the
store) in `data-explorer-view/model` builds, the message the VS Code extension's project page is
sent. A link to a file, a folder or a referenced project is the app's to follow:

```js
import { nodeStoreFs } from 'data-explorer-core/node';
import { readProjectPage } from 'data-explorer-view/model';
import { defineProjectPage } from 'data-explorer-view/project-page';

defineProjectPage();
const page = document.querySelector('dex-project-page');
page.payload = await readProjectPage('/work/Plant/Plant.prj', nodeStoreFs);
page.addEventListener('dex-project-open', (e) => {
  // A path relative to the project's folder; a component row asks for the project in it.
  openFile(join(page.payload.root, e.detail.path), e.detail.preferProject);
});
```

The page is in the element's shadow root with its stylesheet adopted, so it draws under a
Content-Security-Policy without `style-src 'unsafe-inline'`, and its class names reach nothing
else on the page.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-project-page>` | `DexProjectPage` | `defineProjectPage(tag = 'dex-project-page')` | `data-explorer-view/project-page` |

## Properties

### `payload`

type `ProjectPagePayload | null` · default `null` · property only

The project shown: `projectPageMessage`'s answer (its `type` is ignored), or null for none.
A page of another project (another `root`) starts with every filter cleared; a page of the
same one keeps them. Setting it clears `error`.

### `error`

type `string` · default `''` · attribute `error`

Why the project could not be shown, above the page; empty for nothing to say. Attribute `error`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-project-open`

A link to a file, a folder or a project was followed, by a click, Enter or Space.

`detail` is a `ProjectOpenDetail`:

```ts
/** What `dex-project-open` carries: a link the page cannot follow itself. */
export interface ProjectOpenDetail {
  /** The path the link names, relative to the project's folder (`models/plant.slx`, `../Lib/Lib.prj`). */
  path: string;
  /** Present on a component row: open the project in that folder, not the folder. */
  preferProject?: true;
}
```

## Parts it defines

`defineProjectPage()` defines `<dex-project-page>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-primary` | `#fff` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
