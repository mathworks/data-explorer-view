# `<dex-toolbar>`

A row of buttons, the `items` an app hands it: each an icon over a small label (beside it, in a
lower row, with `compact`), the items of one group together with a separator between groups, and
the `end` items pushed to the right. A click on an item sends `dex-toolbar-action` with its id; a
disabled one is greyed and sends nothing. Each item's tooltip is its `title`, or its label with
its shortcut after it.

The toolbar is one stop of the tab order: the arrow keys move along the items and wrap, Home and
End go to the first and the last, and Enter or Space presses the one the keyboard is on. A mouse
press takes no focus, so the focus stays where the user was working, and a cell editor open in a
table stays open: an app commits it (connectTable's `handle.commitEdit()`) before it acts on the
press. The toolbar knows nothing of files or tables. The app gives it new `items` as what they
can do changes, and does what each press asks.

```js
import { defineToolbar } from 'data-explorer-view/app-shell';

defineToolbar();
const toolbar = document.querySelector('dex-toolbar');
toolbar.items = [
  { id: 'open', label: 'Open', icon: 'openFolder', group: 'file', shortcut: 'Ctrl+O' },
  { id: 'save', label: 'Save', icon: 'saved', group: 'file', disabled: !doc.dirty },
  { id: 'undo', label: 'Undo', icon: 'undo', group: 'edit', align: 'end' },
];
toolbar.addEventListener('dex-toolbar-action', async (e) => {
  await handle.commitEdit(); // a cell editor still open commits first
  run(e.detail.actionId);
});
```

An item's `shortcut` is only shown: the toolbar listens for no key, and the app binds each chord
itself.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
