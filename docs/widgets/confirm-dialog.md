# `<dex-confirm-dialog>`

A question with buttons, asked in the page, for a host that has no dialogs of its own (a browser
page): "Do you want to save the changes you made to plant.sldd?", "gains.mat changed on disk."
show() opens it and resolves to the id of the button pressed; Escape, a click outside it and
close() resolve to the question's `cancelId`. It opens focused on the primary button, never on a
danger one (Don't Save, Reload), keeps Tab among its buttons while it is open, and gives the focus
back where it was when it closes. It sends no events: the promise is the answer.

```js
import { defineConfirmDialog } from 'data-explorer-view/app-shell';

defineConfirmDialog();
const confirm = document.body.appendChild(document.createElement('dex-confirm-dialog'));

const answer = await confirm.show({
  title: 'Save Changes',
  message: 'Do you want to save the changes you made to plant.sldd?',
  detail: "Your changes will be lost if you don't save them.",
  buttons: [
    { id: 'save', label: 'Save', kind: 'primary' },
    { id: 'discard', label: "Don't Save", kind: 'danger' },
    { id: 'cancel', label: 'Cancel' },
  ],
  cancelId: 'cancel',
});
```

A second show() while one is open answers the first with its `cancelId` and asks the second in
its place. The dialog paints at z-index 10000, as [`<dex-error-dialog>`](error-dialog.md) does,
so where both are open the one later in the document is on top: append it last in the body,
outside any element that makes a stacking context of its own.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-confirm-dialog>` | `DexConfirmDialog` | `defineConfirmDialog(tag = 'dex-confirm-dialog')` | `data-explorer-view/app-shell` |

## Properties

None.

## Methods

### `show(options: ConfirmOptions): Promise<string>`

Opens the dialog with `options` and resolves to the id of the button pressed, or to
`options.cancelId` on Escape, a click on the backdrop, close(), or the element leaving the
page. A second show() while one is open answers the first with the first's `cancelId` and
asks the second in its place. Focus opens on the first primary button, or with none on the
first that is not a danger one, and returns, when the dialog closes, to the element that had
it when the first of these questions was asked. On an element that is not on the page it
resolves to `cancelId` at once.

### `close(): void`

Closes the dialog, answering show() with its `cancelId`; does nothing while closed.

## Events

None.

## Parts it defines

`defineConfirmDialog()` defines `<dex-confirm-dialog>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-accent-hover` | `#005a9e` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
