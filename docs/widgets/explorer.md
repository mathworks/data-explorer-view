# `<dex-explorer>`

The open files, as the app shell's Explorer lists them: Root first, the row for every open file
at once, then each kind of file under a heading of its own (Simulink Models, Data Dictionaries,
MAT-Files, Projects, Other, always in that order, and a heading only over files). A file with
sections has a twisty that opens it onto them (a dictionary's Design Data, Configurations, …),
and a file with unsaved changes shows ● after its name, as its tab in the shell does.

It draws what it is given and asks for the rest. A click on a row sends `dex-explorer-open` for
it, unpinned, for an app that shows it in a preview tab; a double-click or Enter sends it pinned;
a right-click on a file sends `dex-explorer-menu` with the point to open a menu at. Which row is
the current one is the app's: `selected` names the row highlighted, a click changes nothing of
it, and a `selected` that moves to a section of a closed file opens the file and scrolls the row
into view. The arrow keys walk the rows: Right opens a file or goes into it, Left closes it or
goes from a section back to its file, and Home and End go to the first and the last.

```js
import { defineExplorer } from 'data-explorer-view/app-shell';

defineExplorer();
const explorer = document.querySelector('dex-explorer');
explorer.files = [
  {
    id: uri, label: 'plant.sldd', group: 'sldd', icon: 'simulinkDataDictionary_FT', title: path, dirty: true,
    sections: [{ id: 'design', label: 'Design Data' }, { id: 'config', label: 'Configurations' }],
  },
];
explorer.selected = { fileId: uri }; // { fileId: null } is Root
explorer.addEventListener('dex-explorer-open', (e) => {
  const { fileId, sectionId, pin } = e.detail; // fileId null: Root
  show(fileId, sectionId, { preview: !pin });
});
explorer.addEventListener('dex-explorer-menu', (e) => {
  menu.show(e.detail.x, e.detail.y, fileItems(e.detail.fileId)); // a <dex-context-menu>
});
```

Which files are open onto their sections is the element's own, and a file that leaves `files` is
forgotten, so it comes back closed. `focusRow(at)` gives the keyboard to a row (`{ fileId: null }`
for Root), and says whether it took it: the shell calls it when its tab row hides at Root with the
focus on a tab.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-explorer>` | `DexExplorer` | `defineExplorer(tag = 'dex-explorer')` | `data-explorer-view/app-shell` |

## Properties

### `files`

type `ExplorerFile[]` · default `[]` · property only

The open files, in the order each heading lists them. Replacing them keeps open each file
still here (by its `id`) and forgets the rest. Default none: Root alone.

### `selected`

type `ExplorerSelection | null` · default `null` · property only

The row to highlight: Root, a file, or a section of a file. Null, the default, highlights
none. The app sets it; the element never changes it, and setting it sends nothing. Moved to
another row, it scrolls that row into view once it is drawn; moved to a section of a closed
file, it opens the file, then or once a later `files` lists the section. The user may close
it again, and it stays closed until `selected` next moves to one of its sections.

### `rootLabel`

type `string` · default `'Root'` · attribute `root-label`

What the first row, the one for every open file at once, reads. Default `Root`. Attribute `root-label`.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-explorer-open`

Open this row: Root, a file or a section. Unpinned for a click, pinned for a double-click or
Enter. A request: the explorer changes nothing itself, not even `selected`.

`detail` is a `ExplorerOpenDetail`:

```ts
/** What `dex-explorer-open` carries: the row to open, and whether to open it for good. */
export interface ExplorerOpenDetail {
  /** The file, or null for Root. */
  fileId: string | null;
  /** The file's section; absent for the file itself, and for Root. */
  sectionId?: string;
  /**
   * True for a double-click or Enter: the user means to keep it, as a pinned tab. False for a
   * single click, which an app may show in a preview tab that the next click reuses. A
   * double-click is two clicks first, so it sends two unpinned requests before the pinned one:
   * the preview takes the row, then is pinned.
   */
  pin: boolean;
}
```

### `dex-explorer-menu`

Show this file's menu at this point of the viewport: a file's row was right-clicked. A request.

`detail` is a `ExplorerMenuDetail`:

```ts
/** What `dex-explorer-menu` carries: the file whose menu to show, and where, in viewport pixels. */
export interface ExplorerMenuDetail {
  /** The file right-clicked. */
  fileId: string;
  /** The pointer's clientX. */
  x: number;
  /** The pointer's clientY. */
  y: number;
}
```

## Parts it defines

`defineExplorer()` defines these first, under their default names, then `<dex-explorer>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-color-accent-bg` | `#cde4f7` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-selection-fg` | `#333` | The ink on a selected row, whose surface is --dex-color-accent-bg. |
