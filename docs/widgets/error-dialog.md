# `<dex-error-dialog>`

A modal dialog that says why something the user did was refused: a title, the reason, what was
entered beside what was kept, and a detail line. It takes focus on OK (never on Revert), keeps
Tab inside itself, and gives focus back when it closes. With `showRevert`, a Revert button
sends `dex-revert` before it closes.

```js
import { defineErrorDialog } from 'data-explorer-view/error-dialog';

defineErrorDialog();
const dialog = document.body.appendChild(document.createElement('dex-error-dialog'));

dialog.show({
  title: 'Invalid Value',
  reason: 'Min must not be greater than Max.',
  invalidValue: '12',
  validValue: '3',
});
```

Its properties are what show() fills in, and are internal: use show().

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-error-dialog>` | `DexErrorDialog` | `defineErrorDialog(tag = 'dex-error-dialog')` | `data-explorer-view/error-dialog` |

## Properties

None.

## Methods

### `show(opts: {
    title?: string;
    reason?: string;
    detail?: string;
    invalidValue?: string;
    validValue?: string;
    showRevert?: boolean;
    returnFocusTo?: HTMLElement;
  }): void`

Opens the dialog, focused on OK (never on Revert, which discards the user's edit).

`title` defaults to 'Invalid Value' and `reason` to 'The entered value is not valid.';
`invalidValue` and `validValue` are shown as Entered and Previous, `detail` under them, and
`showRevert` adds the Revert button. Focus returns to `returnFocusTo` when it closes, or to
the element that had it when this was called.

### `hide(): void`

Closes the dialog and gives focus back, sending nothing.

## Events

Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on
`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is
typed with no cast, on the element, the document or the window.

### `dex-revert`

Revert was pressed: put back the value kept. The dialog closes. No detail.

`detail` is `null`.

## Parts it defines

`defineErrorDialog()` defines `<dex-error-dialog>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-bg-tertiary` | `#f5f5f5` |  |
| `--dex-border-color` | `#d0d0d0` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-mono` | `'SF Mono', 'Menlo', 'Monaco', monospace` |  |
