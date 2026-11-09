# `<dex-app-shell>`

The frame of an app: a toolbar and a location bar across the top, a sidebar on each side with an activity bar beyond it, the documents in the
middle with a bottom panel under them, and a status bar along their foot. It draws the frame and
none of what is in it. The page fills it: its toolbar, location bar and status text as children
in the `toolbar`, `location` and `status` slots, its documents as plain children, and its sides
from [`<dex-shell-view>`](shell-view.md) children, each a view with an activity button, and
[`<dex-shell-action>`](shell-action.md) children, buttons the page answers itself. A bottom
view's button sits at the start of the status bar.

Each side shows one of its views and hides the rest. A press of a view's button, or of its
shortcut, shows that view, or closes the side when the view is the one shown, and sends
`dex-shell-view-changed`; a view its shortcut shows takes the focus. A side's separator resizes
it, dragged or by the arrow keys, and no side is drawn larger than the window leaves room for: a
sidebar widened on a large monitor is drawn narrower in a small window, and as wide again once
there is room. With `storage-key`, which view each side shows, which sides are open and their
sizes are kept in localStorage, and the next shell with that key opens as the user left it.

```js
import { defineAppShell } from 'data-explorer-view/app-shell';

defineAppShell(); // <dex-app-shell>, and the <dex-shell-view> and <dex-shell-action> it reads
const shell = document.querySelector('dex-app-shell');
shell.addEventListener('dex-shell-view-changed', (e) => {
  const { side, view, open } = e.detail; // the side as it is now
});
shell.addEventListener('dex-shell-action', (e) => {
  if (e.detail.actionId === 'settings') settings.show(e.detail.anchor); // the button's box
});
shell.showView('files'); // what a "Show Files" command does: it never closes a side
```

```html
<dex-app-shell storage-key="my-app:layout">
  <my-toolbar slot="toolbar"></my-toolbar>
  <dex-shell-view side="left" view="files" label="Files" icon="filesSB" shortcut="Mod+Shift+E">
    <my-file-list></my-file-list>
  </dex-shell-view>
  <dex-shell-action side="left" action="settings" label="Settings" icon="settings"></dex-shell-action>
  <my-document></my-document>
  <span slot="status">Ready</span>
</dex-app-shell>
```

A shortcut is written as `Mod+Shift+E`, where Mod is Command on macOS and Ctrl elsewhere, and a
button's tooltip names it in the platform's words. The shell hears it on the window, wherever the
focus is, unless a widget that takes the same keys for itself has spent the press.

`connectShell` fills an empty shell with the whole app, its toolbar, tabs, Explorer, inspector,
modules and dialogs, over a host the page hands it: see
[Build an app on the shell](../../README.md#build-an-app-on-the-shell) in the README.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-app-shell>` | `DexAppShell` | `defineAppShell(tag = 'dex-app-shell')` | `data-explorer-view/app-shell` |

## Properties

### `storageKey`

type `string` · default `''` · attribute `storage-key`

The localStorage key the layout is kept under (which view each side shows, which sides are
open, and their sizes), read back as each side's views first arrive. Empty, the default,
keeps nothing. Attribute `storage-key`.

### `layout`

type `ShellLayoutState` · read-only

Which view each side shows, whether it is open, and its width or height, as drawn. A size the
window has no room for is drawn smaller than the one the person chose, and as chosen again
once there is room; the size kept is the one chosen. Read-only: the buttons, the separators,
showView and toggleView change it.

## Methods

### `showView(view: string): void`

Shows the view with this id, opening its side if it was closed: what a command that brings a
view forward does. Never closes a side. Sends `dex-shell-view-changed`, and keeps the layout,
when that changes anything. A view appended in the same task is one too; an id no view has
does nothing.

### `toggleView(view: string): void`

What a press of the view's activity button does: shows it, or closes its side when it is the
view shown. Sends `dex-shell-view-changed` and keeps the layout. An id no view has does nothing.

### `anchorOf(id: string): DOMRect | null`

The box of the activity button of the view or the action with this id, in viewport px, for a
popover to open against; null when the shell draws no button for the id.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-shell-view-changed`

A side shows another view, or was opened or closed: by its activity button, its chord, or
showView / toggleView. The side as it is now. Not sent for a resize, nor when the page's own
change of the views moves the layout.

`detail` is a `ShellViewChangedDetail`:

```ts
/** What `dex-shell-view-changed` carries: a side as it is after a view was shown, or the side opened or closed. */
export interface ShellViewChangedDetail {
  /** The side that changed. */
  side: ShellSide;
  /** The view it shows, by id: kept while the side is closed, so opening it shows the same view. */
  view: string | null;
  /** Whether the side is open. */
  open: boolean;
}

/** A side of the shell that holds views: the two sidebars and the bottom panel. */
export type ShellSide = 'left' | 'right' | 'bottom';
```

### `dex-shell-action`

An action's button, or its chord, was pressed: open what it stands for, against `anchor`.

`detail` is a `ShellActionDetail`:

```ts
/** What `dex-shell-action` carries: the action pressed, and where its button is. */
export interface ShellActionDetail {
  /** The action's id: its `<dex-shell-action>`'s `action`. */
  actionId: string;
  /** The button's box in viewport px (getBoundingClientRect's), for a popover to open against. */
  anchor: { x: number; y: number; width: number; height: number };
}
```

## Parts it defines

`defineAppShell()` defines these first, under their default names, then `<dex-app-shell>`:

- [`<dex-icon>`](icon.md)
- [`<dex-shell-view>`](shell-view.md)
- [`<dex-shell-action>`](shell-action.md)

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-activity-active` | `#0078d4` |  |
| `--dex-activity-fg` | `#616161` |  |
| `--dex-bg-activity-bar` | `#f0f0f0` | The app shell (data-explorer-view/app-shell): its activity bars, toolbar row, tab bar and the line a resizer shows under the pointer. |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-secondary` | `#f8f8f8` |  |
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-bg-toolbar` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
| `--dex-shell-resizer-hover` | `#0078d4` |  |
