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
| The Folder view's ⟳ | reads the folder again | Pick Again: the folder is the list the browser gave when it was picked |
| Unsaved edits | the shell's own dialog, and `host.edited` for `beforeunload` | the same |

A download marks the document saved: the user has the file. The page holds the file as it
downloaded it from then on, so the tab, and the file opened again, show what was saved; the file on
disk is as it was, and the shell says "Downloaded plant.sldd" rather than "Saved". A browser tells
the page nothing of a download once it has handed it over: one the browser blocked, or the user
cancelled in its download prompt, still leaves the tab saved, and the page's copy is the one to
download again (Save As). The same holds
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
has, so it opens in the tab it has. A file inside the shown folder, picked or made there by New or
Save As (Chromium), takes its place in the folder, though the folder has not listed it yet, so the
folder's tree and the file's tab are one file. Since a path means nothing to the user, `host.pathTitle(path)`
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

## The Folder view

The shell's Folder view moves within the folder the user picked or dropped, and only there: a
browser gives a page no folder but the ones the user chose, so the picked folder is the top of the
path, and ↑ goes nowhere from it (`host.folderParent` answers null there). A folder of it (a folder
row's Use as Folder, a segment of the path, ↑ back up) is served as the shell's workspace folder
(`host.openFolderAt`), its files at the paths they had under the picked folder, so a tab open on one
of them is still its tab. Each folder's entries are read as its row opens: through the directory's
handle, or from the list of files the browser gave when the folder was picked, which holds every
file then and no folder without a file in it. A hidden entry (a name starting with `.`) is left out
of the rows, as a file browser leaves it out. The recent folders are this session's picked and
dropped ones, newest first; the page keeps none past a reload, so a folder is picked again then.
There is no Reveal: a page cannot show a file in the file manager.

## Files from the web

`host.fetchUrls(urls)` fetches data files from web addresses, a link's `?url=` values say, and
answers the paths to open them by, in the addresses' order, with `null` for each that did not
open and a line saying why (`https://x/a.sldd could not be fetched: 404 Not Found`) for the page to
tell. It never rejects.

```js
const host = browserHost({ onFolder, onChanged, openFromUrl: true });
const { paths, problems } = await host.fetchUrls(new URLSearchParams(location.search).getAll('url'));
for (const text of problems) app.notify({ level: 'warning', text });
await app.openPaths(paths.filter((p) => p !== null));
```

An address may come from a link anyone wrote, so the host holds every one to the same rules:

- Only `https:`, or an address on the page's own origin (the `origin` option, `location.origin` by
  default), which is how a page serves its samples over `http://localhost`.
- No user name or password in the address (`https://user:token@…`): the address is what a link to
  the file writes back, so whatever it holds would go to everyone the link is shared with.
- Only a file this app opens: `.sldd`, `.slx`, `.mdl` or `.mat`. A project (`.prj`, `matlab.toml`)
  is refused, since its page reads the folder around it, which one address does not give. A name
  with an escaped slash in it (`%2F`, `%5C`) is refused too.
- A GitHub or GitLab file page is a web page around the file: the raw file behind it is fetched.
  github.com's `/<owner>/<repo>/blob/<ref>/<path>` and `/<owner>/<repo>/raw/<ref>/<path>` are
  fetched from `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`, and a GitLab
  project's `/-/blob/` from its `/-/raw/` on the same host (gitlab.com, or a company's own); the
  page's query and fragment are dropped. Any other address is fetched as given, its query kept and
  its fragment dropped. GitHub Enterprise is not rewritten: its `/blob/` cannot be told from any
  other site's path.
- The fetch sends no cookies (`credentials: 'omit'`), so a private file is refused by its server
  rather than read with the credentials of whoever opens the link, and no referrer, since the
  page's address can hold the other files' addresses. It follows redirects.
- A file is at most 64 MB: one whose server declares more is refused before a byte is read, and one
  that streams past it is refused once it does. The fetch and the read together have 30 s.
- A server that answers with a web page (`text/html`: a sign-in page, a file page not rewritten) is
  refused; `text/plain`, which raw.githubusercontent.com answers, is read as the file.
- A browser lets a page read another origin's file only when that server says it may (CORS). It
  tells the page nothing more of a refusal than of a name that does not resolve, so either says
  "that server doesn't let pages read its files (CORS)", or "the browser is offline" when the
  browser says it is. raw.githubusercontent.com lets every page read its files.

Each file joins the group of its address's folder (`addToGroup`, the folder of the address
fetched), so a model and its dictionary from one repo folder sit beside each other and link,
whichever was fetched first; files of two folders, or two hosts, are folders apart. Each address is
fetched once, by the address fetched (a file page and its raw file are one): asked for again (twice
in one call, by a later call, or while its first fetch still runs), it answers the path it has. One
that failed is fetched afresh the next time it is asked for. `host.files.urlOf(path)` says the
address the file at a path was fetched from, as it was first given, for a page's links to write
back. Two addresses of one name in one folder (`a.sldd?v=1`, `a.sldd?v=2`) share a path, as two
files of a name in a group do: the one fetched last is there, and is the one `urlOf` names; the
other, asked for again, is fetched again and takes its place.

A fetched file is bytes the page holds, with nothing to write them through: its Save is a download,
as for a file the page has no handle to.

With `openFromUrl: true` the host also has `fetchUrl(url)`, which gives the shell Open from URL: it
resolves to the one file's path, or rejects with the line saying why. Leave it off unless the page's
Content-Security-Policy lets it fetch from other origins (`connect-src 'self' https:`): under
`connect-src 'self'`, every address on another origin is refused, and the browser says so to the
page only as it says a CORS refusal. `fetchUrls` is there either way, for the addresses a page's own
link names.
