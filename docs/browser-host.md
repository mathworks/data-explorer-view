# Browser host

`browserHost()` (`data-explorer-view/browser-host`) is a `ShellHost` for a plain web page: the app
shell runs in a browser tab, with no backend, as it runs in an Electron window.

```js
import { connectShell, defineAppShell, installFileDrop } from 'data-explorer-view/app-shell';
import { browserHost } from 'data-explorer-view/browser-host';

defineAppShell();
const host = browserHost({
  onFolder: (root, port) => app.showFolder(root, port),
  onChanged: (path) => app.fileChanged(path),
});
const app = connectShell(document.querySelector('dex-app-shell'), { host });
installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)));
addEventListener('beforeunload', (e) => host.edited && e.preventDefault());
```

Without `onFolder` the host shows no folders (no Folder button, dropped folders passed over);
without `onChanged` it watches no files. Every other dependency is the page's own (`window`,
`document`, `navigator`) unless given.

## What works where

| | Chromium (Chrome, Edge) | Firefox, Safari |
|---|---|---|
| Open File | `showOpenFilePicker`: handles | a hidden `<input type=file multiple>`: Files |
| Open Folder | `showDirectoryPicker` | `<input webkitdirectory>`: the folder as it was picked |
| Drop | handles, files and folders (`getAsFileSystemHandle`) | entries (`webkitGetAsEntry`): a folder read through once, at the drop |
| Save | in place (`createWritable`), once the user allows writing | not possible: Save says to use Save As |
| Save As | `showSaveFilePicker` | a download |
| Changed on disk | open files looked at every 2 s while the page is shown | not seen |
| A shown folder's changes | listed again when the page is shown or focused (at most once every 3 s) | not seen |
| Unsaved edits | the shell's own dialog, and `host.edited` for `beforeunload` | the same |

A Save As download marks the document saved: the user has the file. A File (Firefox, Safari, or a
Chromium drop without handles) refers to the file on disk, and the browser refuses to read it once
another program has written it: the read says to open the file again.

## Clicks and key presses

A browser shows a file dialog, and asks whether a page may write a file, only right after a click
or a key press. Asked at any other time, a picker rejects and a file input never opens. So:

- `pickFiles` and `pickFolder` reject at once, with a message that says to try again from a click
  or a key press, when `navigator.userActivation` says none led to them.
- A save that needs leave to write, started without one (a save as the page closes, say), rejects
  with "Save again from a click or a key press, or use Save As."
- A picker opened while another is open answers that nothing was picked.

## Paths

The browser gives no paths, so the host makes them up: `/files/<n>/<name>` for the files of the
n-th pick or drop (files picked together sit in one folder, so a model's link to a dictionary picked
with it finds it), and `/<folder name>/<path in it>` for a shown folder's (a second folder of the
same name is `/<name> (2)`). A file picked again, or saved onto with Save As, keeps the path it has,
so it opens in the tab it has. `host.files` (a `WebFiles`) maps each path to what reads it; an app
may add its own, such as bytes it fetched: `await host.files.addPicked('a.sldd', { kind: 'bytes', bytes })`.

A shown folder is listed by core's listing rules (the same files, skips, order and limit as
`listFolder` from `data-explorer-core/node/folder`), served in the page over a `MessageChannel`, so
the hierarchy, Usage, search and project pages work as they do on the desktop.
