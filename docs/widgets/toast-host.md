# `<dex-toast-host>`

The shell's toasts, in the bottom-right corner of the window. show() adds one at the bottom of
the stack. A 'status' or 'info' toast goes by itself after a few seconds; a 'warning' or an
'error' stays until its × is pressed, since what it says has to be read. A toast the pointer is
on, or whose × has the focus, waits for the user, and is timed afresh once they leave it. At most
three are shown, and a fourth takes the oldest away. A screen reader hears each one as it is
shown, politely for 'status' and 'info' and at once for a warning or an error.

A workspace's notice (what `createWorkspace({ notify })` is told) is a toast as it stands, so an
app hands the workspace's notices straight to it. It sends no events: closing a toast changes
nothing but the screen.

```js
import { defineToastHost } from 'data-explorer-view/app-shell';
import { createWorkspace } from 'data-explorer-view/model';

defineToastHost();
const toasts = document.body.appendChild(document.createElement('dex-toast-host'));

const ws = createWorkspace({ editing: true, notify: (notice) => toasts.show(notice) });
toasts.show({ level: 'info', message: 'Saved plant.sldd', ms: 2000 });
```

clear() takes every toast away and stops their timers.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->

## At a glance

| Tag | Class | Define | Entry |
|---|---|---|---|
| `<dex-toast-host>` | `DexToastHost` | `defineToastHost(tag = 'dex-toast-host')` | `data-explorer-view/app-shell` |

## Properties

None.

## Methods

### `show(toast: Toast): void`

Shows a toast at the bottom of the stack. 'status' and 'info' go by themselves after `ms`
(default 4000); 'warning' and 'error' stay until closed, whatever `ms` says. At most three
are shown: a fourth takes the oldest away.

### `clear(): void`

Takes every toast away, stops every timer, and empties what a screen reader would read.

## Events

None.

## Parts it defines

`defineToastHost()` defines `<dex-toast-host>` alone.

It has no `::part()` names and no slots.

## Theme tokens it reads

Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).

| Token | Light default | |
|---|---|---|
| `--dex-bg-hover` | `#e8e8e8` |  |
| `--dex-bg-primary` | `#fff` |  |
| `--dex-border-color-light` | `#e0e0e0` |  |
| `--dex-color-accent` | `#0078d4` |  |
| `--dex-color-error` | `#d32f2f` |  |
| `--dex-color-text` | `#333` |  |
| `--dex-color-text-secondary` | `#555` |  |
| `--dex-color-warning` | `#d83b01` |  |
| `--dex-focus-ring` | `0 0 0 2px rgba(0, 120, 212, 0.4)` |  |
| `--dex-font-family` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |  |
| `--dex-font-size` | `13px` |  |
