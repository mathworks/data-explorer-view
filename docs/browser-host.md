# Browser host

`browserHost()` (`data-explorer-view/browser-host`) is a `ShellHost` for a plain web page: the app
shell runs in a browser tab, with no backend, as it runs in an Electron window.

```js
import { connectShell, defineShellWidgets, installFileDrop } from 'data-explorer-view/app-shell';
import { browserHost } from 'data-explorer-view/browser-host';

defineShellWidgets();
const host = browserHost({
  onFolder: (root, port) => app.showFolder(root, port),
  onChanged: (path) => app.fileChanged(path),
});
const app = connectShell(document.querySelector('dex-app-shell'), { host });
installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)));
addEventListener('beforeunload', (e) => {
  if (!host.edited) return;
  e.preventDefault();
  e.returnValue = ''; // what older browsers ask on
});
```

Without `onFolder` the host shows no folders (no Folder button, dropped folders passed over);
without `onChanged` it watches no files. Every other dependency is the page's own (`window`,
`document`, `navigator`) unless given. `host.openFolder(dir)` shows a folder the app has a handle
or a file list for; `host.openDropped(dt)` must be called from the drop's listener, before anything
is awaited, since a browser lets a page read a drop only then.

## What works where

The left column needs Chromium's File System Access API, which a browser gives only to a page in a
secure context (served over https, or from localhost). A page over plain http, and Brave (which
turns the API off), get the right column.

| | Chromium (Chrome, Edge), secure context | Firefox, Safari, plain http, Brave |
|---|---|---|
| New | `showSaveFilePicker`: the file named there, saved in place from its first Save | `untitled.sldd`, kept in the page: each Save downloads it |
| Open File | `showOpenFilePicker`: handles | a hidden `<input type=file multiple>`: Files |
| Open Folder | `showDirectoryPicker` | `<input webkitdirectory>`: the folder as it was picked |
| Drop | handles, files and folders (`getAsFileSystemHandle`) | entries (`webkitGetAsEntry`): a folder read through once, at the drop, up to 10,000 files |
| Save | in place (`createWritable`), once the user allows writing | a download, under the file's name |
| Save As | `showSaveFilePicker` | a download |
| Changed on disk | open files looked at every 2 s while the page is shown | not seen |
| A shown folder's changes | listed again when the page is shown or focused (at most once every 3 s) | not seen |
| Unsaved edits | the shell's own dialog, and `host.edited` for `beforeunload` | the same |

A download marks the document saved: the user has the file. The page holds the file as it
downloaded it from then on, so the tab, and the file opened again, show what was saved; the file on
disk is as it was, and the shell says "Downloaded plant.sldd" rather than "Saved". The same holds
in Chromium for a file the page has no handle to (a drop without handles, or bytes of the app's
own): its Save is a download too, and Save As there writes a file the page may then save in place.
A File (the right column, or a Chromium drop without handles) refers to the file on disk, and a
browser may refuse to read it once another program has written it (Chromium does; Firefox may):
the read then says to open the file again.

New (`host.newFile`) says where the shell's new dictionary goes. With the save picker, the browser
makes the file named there, or empties the one that was there, as the picker closes (Chromium does,
before the page hears of the file). So the host writes a new dictionary there at once, which MATLAB
opens, and a New the user then discards leaves that rather than a file of no bytes; the first Save
writes the user's dictionary over it, and the page watches the file from New on, as it watches a
file it opened. A file a tab has open is not made a new file: the picker has emptied it, and the
shell writes the tab's copy back (or, where that write fails, keeps a tab the page edits unsaved,
for a Save to write it). With no save picker, the page keeps the file itself, under the name the shell offers,
holding a new dictionary, and each Save of it is a download, as for any file the page has no
handle to.

Safari before 16.4 never says a file dialog was cancelled: an Open File or Open Folder cancelled
there leaves nothing to answer, and the next one works as usual.

## Clicks and key presses

A browser shows a file dialog, and asks whether a page may write a file, only right after a click
or a key press. Asked at any other time, a picker rejects and a file input never opens. So:

- `pickFiles` and `pickFolder` reject at once, with a message that says to try again from a click
  or a key press, when `navigator.userActivation` says none led to them. New and Save As say the
  same when the browser refuses its save picker for want of one. A browser keeps Cmd/Ctrl+N for a
  new window (Chromium and Firefox both do), so in a browser tab New is the toolbar's or the command
  palette's.
- A save that needs leave to write, started without one (a save as the page closes, say), rejects
  with "Save again from a click or a key press, or use Save As."
- A picker opened while another is open answers that nothing was picked.

## Paths

The browser gives no paths, so the host makes them up. A path is the host's own and opaque: an app
opens the paths the host answers and builds or parses none. What a path does promise: files picked
or dropped together sit beside each other (a model's link to a dictionary picked with it finds it),
a shown folder's files keep their places in it (its links and project pages work), two folders of
one name are kept apart, and a file picked again, or saved onto with Save As, keeps the path it
has, so it opens in the tab it has. Since a path means nothing to the user, `host.pathTitle(path)`
says what does, and the shell's tooltips show that: a picked file's name, or a shown folder's file
by its place in the folder (`plant/models/ctrlA.slx`).

`host.files` answers what a path holds (`get`, `has`), and takes a file of the app's own: bytes it
fetched, say, `await host.files.addPicked('a.sldd', { kind: 'bytes', bytes })`, whose path the app
then opens. Each file added that way is in a folder of its own, as a file picked on its own is.

Files of the app's own that link to each other go in a group it names, with
`host.files.addToGroup(group, files)`: the group is one folder, made when its first file comes, and
every file added to it later sits beside those it has. So files fetched at different times still
find each other: the samples a page fetches when they are asked for, after a file its address
named, and a model's link to a dictionary fetched after it. Two groups, and every pick, are folders
apart. A group holds one file of a name: one added under a name the group has takes its place, at
its path, and a tab open on it takes the new file as it takes a change on disk. Files of one name
from two places on a site go in two groups (a group per site folder, say).

A page adds each file once, and keeps the path it is answered: asked for the file again, it opens
that path (the file's tab, if it has one) rather than fetching and adding it again. The same file
added again, equal bytes or a File of the same size and date, changes nothing; another version of
it replaces the one held, and an open tab reloads, or asks first about its unsaved edits.

```js
const opened = new Map(); // url → path, each file fetched and added once
async function openSamples(urls) {
  const fresh = await Promise.all(urls.filter((url) => !opened.has(url)).map(async (url) => ({
    url,
    name: url.slice(url.lastIndexOf('/') + 1),
    source: { kind: 'bytes', bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) },
  })));
  const paths = await host.files.addToGroup('samples', fresh);
  fresh.forEach((file, i) => opened.set(file.url, paths[i]));
  await app.openPaths(urls.map((url) => opened.get(url)));
}
```

A shown folder is listed by core's listing rules (the same files, skips, order and limit as
`listFolder` from `data-explorer-core/node/folder`), served in the page over a `MessageChannel`, so
the hierarchy, Usage, search and project pages work as they do on the desktop.
