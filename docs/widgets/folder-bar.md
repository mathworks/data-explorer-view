# `<dex-folder-bar>`

The top row of a folder view: ↑, the path of the folder shown as segments, outermost first
(/ › Users › delite › complex_dataflow), then ⟳ and ⋯. The last segment is the folder shown, and
is not a button. The bar works out no path and moves nowhere itself. Each press is a request:
`dex-folder-up`, `dex-folder-go` with the folder a segment stands for, `dex-folder-refresh`, and
`dex-folder-menu`, which asks the app to show its menu. The app moves (re-roots), then gives the
bar the new segments. It says by `canUp` whether there is a folder above, and by `refresh` what ⟳
is. The bar sits beside the [location bar](location-bar.md) in spirit, and looks like it.

```js
import { defineFolderBar } from 'data-explorer-view/app-shell';

defineFolderBar();
const bar = document.querySelector('dex-folder-bar');
bar.segments = [
  { label: '/', path: '/' },
  { label: 'Users', path: '/Users' },
  { label: 'delite', path: '/Users/delite' },
  { label: 'complex_dataflow', path: '/Users/delite/complex_dataflow' },
];
bar.canUp = true;
bar.addEventListener('dex-folder-up', () => reroot(parentOf(root)));
bar.addEventListener('dex-folder-go', (e) => reroot(e.detail.path));
bar.addEventListener('dex-folder-refresh', () => readAgain());
bar.addEventListener('dex-folder-menu', (e) => {
  // e.detail.anchor: the button's box. e.detail.segments: the folders a `…` holds, when it was that.
  // e.detail.keyboard: Enter or Space pressed it, so the menu takes the keyboard (focusFirst).
  showMenu(e.detail.anchor, e.detail.segments, { focusFirst: e.detail.keyboard === true });
});

async function reroot(path) {
  bar.busy = true; // ↑, the segments and ⟳ wait; ⋯ stays usable
  try {
    if (await host.openFolderAt(path)) bar.segments = segmentsOf(path);
  } finally {
    bar.busy = false;
  }
}
```

`refresh` is `read` (Read Again, the default), `pick` (Pick Again, for a folder the host can
only ask the user for again, such as a browser's snapshot of a folder) or `none` (no ⟳). Either
button sends `dex-folder-refresh`.

A path too long for the bar folds the folders after the first into a `…` button, and keeps as
many of the last ones as fit. If the first folder does not fit beside the current one, it is
folded too. The `…` sends `dex-folder-menu` with the folders it holds, so the app can list them.
If the current folder alone does not fit, its name ends in an ellipsis. Each segment's tooltip is
its folder's path.

Every button is a tab stop, a disabled one included. Alt+↑ (⌥↑ on a Mac) anywhere in the bar is
↑. The bar takes that press for itself even when ↑ cannot be used, so it never reaches a
listener of the page's. `mono` draws the icons of ↑, ⟳ and ⋯ in the text's colour.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-folder-bar>` | `DexFolderBar` | `defineFolderBar(tag = 'dex-folder-bar')` | `data-explorer-view/app-shell` |

## Properties

### `segments`

type `FolderSegment[]` · default `[]` · property only

The path of the folder shown, outermost first; the last is the folder shown, drawn as the
current one, which is no button. Replace the array to change it. Default none.

### `canUp`

type `boolean` · default `false` · attribute `can-up`

↑ can be used: the host gives a folder above the one shown. Off, the default, disables it
(a browser's picked folder has none above it). Attribute `can-up`.

### `refresh`

type `'read' | 'pick' | 'none'` · default `'read'` · attribute `refresh`

What ⟳ does, by its name: `read` (Read Again, the default) for a folder the host reads again,
`pick` (Pick Again) for one it can only ask the user for again (a browser's snapshot of a
folder), `none` for no ⟳. Either sends `dex-folder-refresh`. Attribute `refresh`.

### `busy`

type `boolean` · default `false` · attribute `busy`

A move or a read is under way: ↑, the segments, the `…` and ⟳ are disabled, and the bar says
aria-busy, until the app turns it off. ⋯ stays usable. Off, the default. Attribute `busy`.

### `mono`

type `boolean` · default `false` · attribute `mono`, reflected

Draws the icons of ↑, ⟳ and ⋯ in one colour, the text's (`<dex-icon mono>`), as the shell's
Minimal icon style draws its glyphs; off, the default, draws them in their files' colours.
Attribute `mono`, reflected so a page's stylesheet can follow it.

## Methods

None.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-folder-up`

↑ was pressed, or Alt+↑ in the bar, while `canUp` said there is a folder above and the bar was not `busy`.

`detail` is `null`.

### `dex-folder-go`

A segment was pressed, not the current folder's, while the bar was not `busy`: its folder's
path. The bar changes nothing itself; the app re-roots, and gives it the new segments.

`detail` is a `FolderGoDetail`:

```ts
/** What `dex-folder-go` carries: the folder of the segment pressed. */
export interface FolderGoDetail {
  /** The segment's `path`. */
  path: string;
}
```

### `dex-folder-refresh`

⟳ was pressed (Read Again, or Pick Again as `refresh` says) while the bar was not `busy`.

`detail` is `null`.

### `dex-folder-menu`

⋯ (Folder Actions) was pressed, or the `…` of a folded path while the bar was not `busy`: the
app shows its menu against the button's box, the folders the `…` holds when it was that.

`detail` is a `FolderMenuDetail`:

```ts
/** What `dex-folder-menu` carries: where the button pressed is, and the folders it stands for. */
export interface FolderMenuDetail {
  /** The button's box in viewport px (getBoundingClientRect's), for a menu to open against. */
  anchor: { x: number; y: number; width: number; height: number };
  /**
   * The segments the `…` button stands for, outermost first: those a path too long for the bar
   * folded away, for the menu to list. Absent when Folder Actions (⋯) was pressed.
   */
  segments?: FolderSegment[];
  /**
   * Pressed by the keyboard (Enter or Space on the button), not a pointer: the menu is to take the
   * keyboard at once (a context menu's `focusFirst`), as a menu button's menu does. Absent for a
   * pointer's press.
   */
  keyboard?: true;
}

/** One segment of the folder's path: what it reads and the folder it re-roots to. */
export interface FolderSegment {
  /** What the segment reads: a folder's name (`complex_dataflow`), or the top of the path (`/`, `C:`). */
  label: string;
  /** The folder's path, in the host's scheme: what a press on the segment asks to go to, and its tooltip. */
  path: string;
}
```

## Parts it defines

`defineFolderBar()` defines these first, under their default names, then `<dex-folder-bar>`:

- [`<dex-icon>`](icon.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-active` | `#e0e0e0` |  |
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-disabled` | `#999` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
