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
