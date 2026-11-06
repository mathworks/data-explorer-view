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
