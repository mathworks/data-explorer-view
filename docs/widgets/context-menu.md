# `<dex-context-menu>`

A context menu: the items an app hands it, at a point of the viewport, with icons, shortcuts,
separators and disabled items that say why (their `reason`, as a tooltip and to a screen
reader). A choice sends `dex-action` with the item's id and closes the menu; Escape, a click
elsewhere or a scroll close it. However it closes, it sends `dex-menu-closed`, so whoever filled
it knows its items are gone. The keyboard moves along every item, disabled ones included.

The tree table asks for a menu with `dex-table-context-menu`; the items for its selection come
from `buildContextMenuItems` (`data-explorer-view/tree-table`):

```js
import { defineContextMenu } from 'data-explorer-view/context-menu';

defineContextMenu();
const menu = document.body.appendChild(document.createElement('dex-context-menu'));

table.addEventListener('dex-table-context-menu', (e) => {
  const { x, y, rowId } = e.detail;
  menu.show(x, y, [
    { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
    { id: 'sep', label: '', separator: true },
    { id: 'delete', label: 'Delete', disabled: true, reason: 'This file is read-only' },
  ]);
});
menu.addEventListener('dex-action', (e) => run(e.detail.actionId));
```

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-context-menu>` | `DexContextMenu` | `defineContextMenu(tag = 'dex-context-menu')` | `data-explorer-view/context-menu` |

## Properties

None.

## Methods

### `show(x: number, y: number, items: ContextMenuItem[]): void`

Opens the menu with these items, its top-left corner at (`x`, `y`) in viewport pixels
(a contextmenu event's clientX and clientY), moved in to fit the viewport. A menu already
open is replaced: it closes first, and says so (`dex-menu-closed`).

### `close(): void`

Closes the menu, choosing nothing. An open menu says so (`dex-menu-closed`).

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-menu-closed`

The open menu closed, whichever way: after a choice (and its `dex-action`), on Escape, a
click, a right-click or a scroll outside it, on close(), or as show() replaced its items.
connectTable hears it, so that a menu several tables share forgets which one opened it. No
detail.

`detail` is `null`.

### `dex-action`

An item that is not disabled was chosen, by a click or Enter; the menu closes.

`detail` is a `ActionDetail`:

```ts
export interface ActionDetail {
  actionId: string;
}
```

## Parts it defines

`defineContextMenu()` defines `<dex-context-menu>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-disabled` | `#999` |  |
| `--dex-color-text-muted` | `#666` |  |
| `--dex-context-menu-active` | `rgba(0, 0, 0, 0.06)` |  |
| `--dex-context-menu-bg` | `rgba(252, 252, 252, 0.96)` |  |
| `--dex-context-menu-border` | `rgba(0, 0, 0, 0.08)` |  |
| `--dex-context-menu-hover` | `rgba(0, 0, 0, 0.04)` |  |
| `--dex-context-menu-separator` | `rgba(0, 0, 0, 0.08)` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
