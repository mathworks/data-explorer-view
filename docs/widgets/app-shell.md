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
