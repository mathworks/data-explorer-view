# data-explorer-view

Widgets and view model for Simulink data files: data dictionaries (`.sldd`),
models (`.slx`, `.mdl`), MAT-files (`.mat`) and projects. Built on
[data-explorer-core](https://github.com/mathworks/data-explorer-core), which
reads the files; this package shows them.

It is the table, property inspector and variable editor of the [Simulink Data
Explorer VS Code extension](https://github.com/mathworks/data-explorer-vscode),
as standalone web components, together with the code that turns core's data
model into what they display.

## Status

Version 1. Import from the entry points below, one for the model and one per
widget; the package exports nothing else, and the files inside it (`dist/` and
their names) are not part of its API. Semantic versioning covers every entry
but `data-explorer-view/host`: what an app uses goes, or changes in a way that
breaks it, only in a major release, and an API check in CI holds each release to
that. `data-explorer-view/host` is the VS Code extension's, which moves with
this package in step: it may change in any release. Pin a tag, and read the
release notes before you move the pin.

## Using it

```json
"dependencies": {
  "data-explorer-view": "github:mathworks/data-explorer-view#v1.7.0",
  "data-explorer-core": "github:mathworks/data-explorer-core#v1.58.0",
  "lit": "^3.2.0"
}
```

`data-explorer-core` and `lit` are peer dependencies: your app installs them
itself, so a page holds one copy of each. For core that matters beyond size:
the model recognises core's nodes with `instanceof`, which two copies of core
would break. This release accepts core `^1.58.0` and lit `^3.2.0`.

Releases are tags, and `dist/` is committed, so installing needs no build step.

## Using a widget

Each widget has an entry of its own, which exports its class, its define
function and the types of what it takes and sends. What every widget does the
same way (data in by properties, actions out by events, and how each is named)
is in [docs/widget-conventions.md](docs/widget-conventions.md):

```js
import 'data-explorer-view/theme.css';
import { setIconBase } from 'data-explorer-view/icon';
import { defineTreeTable } from 'data-explorer-view/tree-table';
import { definePropertyInspector } from 'data-explorer-view/property-inspector';
import { defineVariableEditor } from 'data-explorer-view/variable-editor';

setIconBase('./icons/'); // where your app serves icons/ (see below)
defineTreeTable();       // <dex-tree-table>, and the filter bar, column filter and Add gallery it draws
definePropertyInspector();
defineVariableEditor();
```

| Entry | What it holds |
|---|---|
| `data-explorer-view/model` | the view model: a workspace that opens files, rows, inspector pages, matrix cells, the rules for actions, a folder's hierarchy, the relationship graph and the command window's interpreter |
| `data-explorer-view/host` | the VS Code extension's host plumbing, not for an app, and outside semantic versioning: the document registry over core's module-level session, the answers posted to a webview, the inspector's page, the binary editor's srcId and the tree's file decorations |
| `data-explorer-view/serve` | for the process that holds the files and draws nothing (Electron's main, a worker): `serveFolder`, `serveTable`, `sourceUri`, `listedFiles` and the port adapters, loading nothing else (`sourceUri`, `uriPath` and `portFromMessagePort` are in `/model` too, for the page's end) |
| `data-explorer-view/tree-table` | [`<dex-tree-table>`](docs/widgets/tree-table.md) and its parts ([filter bar](docs/widgets/filter-bar.md), [column filter](docs/widgets/column-filter.md), [Add gallery](docs/widgets/add-gallery.md), [matrix glyph](docs/widgets/matrix-open.md)), and the items of its context menu |
| `data-explorer-view/property-inspector` | [`<dex-property-inspector>`](docs/widgets/property-inspector.md) |
| `data-explorer-view/variable-editor` | [`<dex-variable-editor>`](docs/widgets/variable-editor.md) and the [grid](docs/widgets/matrix-grid.md) inside it |
| `data-explorer-view/context-menu` | [`<dex-context-menu>`](docs/widgets/context-menu.md) |
| `data-explorer-view/error-dialog` | [`<dex-error-dialog>`](docs/widgets/error-dialog.md) |
| `data-explorer-view/project-page` | [`<dex-project-page>`](docs/widgets/project-page.md), a project's page, and the HTML renderer and stylesheet it draws with |
| `data-explorer-view/hierarchy` | [`<dex-hierarchy>`](docs/widgets/hierarchy.md), a folder's files and what each references, and `connectHierarchy` |
| `data-explorer-view/app-shell` | [`<dex-app-shell>`](docs/widgets/app-shell.md), an app's window, with its [views](docs/widgets/shell-view.md) and [actions](docs/widgets/shell-action.md); its parts ([toolbar](docs/widgets/toolbar.md), [tabs](docs/widgets/doc-tabs.md), [location bar](docs/widgets/location-bar.md), [Explorer](docs/widgets/explorer.md), [Settings](docs/widgets/settings-panel.md), [About](docs/widgets/about-panel.md), [toasts](docs/widgets/toast-host.md), [confirm dialog](docs/widgets/confirm-dialog.md)) and modules ([Raw](docs/widgets/raw-viewer.md), [Search](docs/widgets/search-panel.md), [Gallery](docs/widgets/gallery-panel.md), [relationship graph](docs/widgets/relationship-graph.md), [command window](docs/widgets/command-window.md), [Log](docs/widgets/log-panel.md), [command palette](docs/widgets/command-palette.md)); `connectShell`, which builds the app in it over a `ShellHost`, `defineShellWidgets`, which defines every element it draws, and `installFileDrop` |
| `data-explorer-view/browser-host` | `browserHost`, a `ShellHost` for a plain browser page with no backend (see [docs/browser-host.md](docs/browser-host.md)) |
| `data-explorer-view/icon` | [`<dex-icon>`](docs/widgets/icon.md) and `setIconBase` |
| `data-explorer-view/icon-assets` | `useIconAssets`, the icons as assets of your bundle (see below) |
| `data-explorer-view/theme.css` | the colour, font and size tokens |
| `data-explorer-view/icons/<id>.svg` | the icons |

Nothing runs on import, and the package says so (`sideEffects` in
`package.json` names only the stylesheets), so a bundler keeps only the
modules your app uses.

Each widget's page (linked above, and in the package under `docs/widgets/`)
lists its properties and attributes, its methods, the events it sends with the
shape of each `detail`, the parts it defines and the theme tokens it reads. The
same is in `custom-elements.json`
(the [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest),
named by `customElements` in `package.json`) for editors and tools. In
TypeScript the tags and events are typed: `document.createElement('dex-tree-table')`
is a `DexTreeTable`, and a listener's `e.detail` has its type with no cast, on
the element or, since every event bubbles out of its shadow root, on the
document or the window:

```ts
table.addEventListener('dex-row-selected', (e) => {
  e.detail.rowIds; // string[]
});
document.addEventListener('dex-matrix-open', (e) => {
  e.detail.matrix.nodeId; // string
});
```

## Show a file in a table

A workspace opens files in the page, with core, and gives each one a table
source; `connectTable` and `connectInspector` wire the widgets to it.

```js
import { createWorkspace } from 'data-explorer-view/model';
import { connectTable } from 'data-explorer-view/tree-table';
import { connectInspector } from 'data-explorer-view/property-inspector';

const doc = await createWorkspace().open(await file.arrayBuffer(), file.name); // a File, from an <input> or a drop
const handle = connectTable(table, doc.table);
connectInspector(inspector, handle); // follows the table's selection
```

The table then shows the file and its banners (what the read could not read,
what was held back), fetches the rows under a row as it is opened, opens the
variable editor on a matrix and fills it, keeps what the user opened and
selected when the file changes, selects the row a Data Type link names, and has
a read-only context menu (Copy Name, Copy Value) and Ctrl+F. The rest is the
app's, on the handle: `handle.on('navigate', ({ link }) => …)` for a link to
another document or a file, `handle.on('select', (rowIds) => …)`, and
`handle.selectByName(name)` for a link that arrives from another table. The
table's `readonly` stays the app's to set, and connectTable's options take
over more: `menuItems` adds the app's own menu items, `copy` puts a copy on the
app's clipboard rather than the page's (a copy that fails, on either, says so
in the error banner), and `columns` leaves out a column nothing fills in a
document. One inspector beside several tables follows the active one with
`follow(handle)`, and shows its empty state after `follow(null)`.

When the file changes, `doc.reload(bytes)` reads it again and the table
repaints. A document's uri is its identity, in every row id: by default
`file:///<name>`; to open two files that share a name, pass each one's
`sourceUri(path)` as the third argument, which spells a path as VS Code does.
`uriPath(uri)` reads one back into the path, Windows paths included, and takes
a link's `source` as it comes: the file to open for a link to another
document.
`doc.dispose()` closes a document, `ws.dispose()` all of them. A source answers
what the VS Code extension shows for the same file, read-only, unless the
workspace edits (below). A project (`doc.kind === 'project'`) opens on a page rather
than in a table: `<dex-project-page>` draws the message `readProjectPage(markerPath,
fs)` reads from its store (core's `StoreFs`; `nodeStoreFs` from
`data-explorer-core/node` in Electron or Node), the message the extension's
project page is sent, and says `dex-project-open` with the path of a link to
follow.

A source can also be across a message channel, to a worker or another
process holding the documents: `serveTable(doc.table, port)`
(`data-explorer-view/serve`) on the side that holds them, and
`connectTable(table, messageSource(port))` on the page's side, where `port` is
any `{ postMessage, onMessage }` (`TablePort`). The messages
are the extension's own table protocol (`TableHostMessage`,
`TableClientMessage`), and the table behaves as it does beside its source.

Editing is the other half of a source. An `EditableTableSource` (`isEditable(source)`)
takes one command per gesture (`edit`, `copy`, `cut`, `delete`, `paste`, `addChild`,
`addEntry`, `undo`, `redo`, `dragStart`, `dragEnd`, `drop`, `requestEditText`, and a
model's `setActiveConfigSet`, which a source without one is not asked). None
returns anything: what a command did comes back through `subscribe`, as the repaints of
what it changed and as editing changes (`select`, `beginRename`, `invalid`, `refused`,
`editText`, and the `clipboard`, `drag` and `sectionRules` a table predicts a paste or a
drop with). Across a channel the commands are the extension's editing messages
(`TableEditClientMessage`, `TableEditHostMessage`). `messageSource` sends them, and
`serveTable` hands each one to its source as it arrives, with nothing awaited first, so
the source sees gestures in the order they were made. A host that speaks more than the
wire passes `serveTable(source, port, { extra })` to receive its own messages and add
fields of its own to each `setRows`. The pieces an editable source is built from are
in `/model` too:
- `createRegisters()`: a window's clipboard, drag register and source deleters;
- `runTransfer`: what a paste or a drop means;
- the refusals' wording;
- `Notify`, where a source says what the table cannot show.

The engines behind `createWorkspace({ editing: true })` (the MAT-file, compressed
dictionary and JSON dictionary engines), and the hooks they are given (`EditSink`,
`EditIndex`, `TextStore`), are the VS Code extension's, on `data-explorer-view/host`.

## Edit a file

A workspace made with `editing: true` edits a MAT-file and a dictionary (JSON or
compressed) in the page, as the VS Code extension's editors of them do: its
`doc.editable` is true, and its table is an `EditableTableSource` for
`connectTable(table, doc.table, { editing: true })`. Every edit is one step of
the document's own undo stack, and the table's Undo and Redo walk that stack.

```js
const ws = createWorkspace({ editing: true, notify: ({ message }) => showToast(message) });
const doc = await ws.open(bytes, 'gains.mat', sourceUri(path));
const handle = connectTable(table, doc.table, { editing: true });
doc.onDirty((dirty) => markTab(dirty));
let stamp;                              // the file as this page's last save left it

async function save() {
  await handle.commitEdit();            // a cell editor still open commits first (handle = connectTable's)
  const { bytes, at } = doc.serialize(); // synchronous: the document as the save was asked for
  try {
    stamp = await writeAndStamp(path, bytes); // data-explorer-core/node/save: its mtime+size
    doc.saved(at);                      // clean as of then; the Status column moves
  } catch (err) {
    doc.notSaved(at);
    throw err;
  }
}
```

- `serialize()` throws core's refusal, in its words, when the file as it stands
  cannot be written. Nothing is then to be written. A dictionary's save keeps
  every entry no edit touched byte for byte, and refuses one that would not.
- An edit made while the bytes are being written stays unsaved.
- `handle.commitEdit()` commits a cell editor still open, as Enter would, and
  settles once the document has the edit (or has refused it), so a save or a
  close after it does not lose what was being typed. With no editor open it
  settles at once.
- The editing menu labels Undo and Redo with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z.
  The table answers those chords itself with `undoChords: true` (a host whose
  own keybindings undo, as VS Code's do, leaves it off). `handle.undo()` and
  `handle.redo()` do what the items do, for an app's Edit menu, and
  `isTypingInField(event)` tells a key typed in one of the table's fields (its
  search box, a column filter, a cell editor), which the table leaves alone.
- A document's table says where its undo stack stands (`doc.table.history`:
  `canUndo`, `canRedo`, and `onChange` when either moves), so Undo and Redo
  are offered only where there is a step: in the menu, by `handle.can('undo')`
  for an app's toolbar, and by `handle.undo()`. A source that does not say (a
  host's across a channel) has both offered wherever the document may be edited.
- The handle's `ran` says each editing menu gesture the source took, from the
  menu, a chord or `handle.run()`: its `actionId`, the `rowIds` it carried and
  how many it acted on (`count`), a task later and not where the source refused
  it, for an app's "Copied to clipboard" or "2 entries deleted".
- A host that watches the file hears its own saves too. `writeAndStamp`
  answers the file's mtime+size as its write left them, read off the written
  file, so no other program's write can pass for it. On a change, stat the
  file: where its `mtime.getTime()` and `size` are the last save's stamp, the
  change is the host's own save, and no reason to reload, which would empty the
  undo stack. Check a change heard while a save is still being written once that
  save is done, when its stamp is known.
- `doc.reload(bytes)` takes what the disk holds now, with an empty undo stack. A
  dictionary keeps what it held, and the reload rejects, for bytes that are not
  one.
- `doc.keepOver(bytes)` keeps the document's edits over a change on disk
  instead (the page's "Keep My Edits"): no step of its undo stack is the file
  any more, so it stays dirty until a save lands or a reload, and a
  dictionary's Status column is measured from `bytes`. The next save writes the
  document over the file. **In a MAT-file, a variable changed only on disk is
  not marked, and the next save writes the kept value over it.** A document the
  page does not edit reads `bytes`, as `reload` does.
- `ws.create(name, uri)` opens a new, empty data dictionary that no file holds
  yet (the app shell's New): what MATLAB writes for a new dictionary, a text
  one, edited as any JSON dictionary is (checked with MATLAB R2027a; older
  releases are unverified). It is dirty from the start, whatever is undone,
  until a save of it lands; that save writes the file.
- A file laid out in a way a save could not keep opens read-only, and its
  `notice` says why. Its table has no menu under `editing`, unless
  `connectTable` is given `readOnlyMenu: true`: then it has the read-only
  table's Copy Name and Copy Value.
- `copyText: true` adds Copy Name and Copy Value, as text through `copy`, to
  the end of the editing menu. Cmd/Ctrl+C stays the editing menu's Copy.
- The documents of a workspace share one clipboard and drag register
  (`registers`, `createRegisters()` by default), so a cut in one pastes into
  another and the original goes.
- `dragOut: true` lets a table's rows be dragged out of it, onto another part of
  the page that takes them (the app shell's Explorer, onto an open file): the
  box at the pointer goes with them, saying what the element under it says a
  drop would do (its `data-drop-hint`, a refusal with `data-drop-refused`), and
  a document that may not be edited lets its rows go too, as a copy (a
  workspace's read-only documents can). What takes
  them drops them through the target document's handle, as its own rows would:
  `handle.dropDecision(rowId, mode)` predicts the drop there (`rowId` null is
  the document as a whole: the section the entries came from, else the first
  that takes them), and `handle.drop(rowId, mode)` makes it, one edit of that
  document, settling once the document is done with it, with whether it was
  refused and why.
- What a table does not show (a move that left its original behind, an undo of
  an edit made before a reload) goes to `notify`.
- A JSON dictionary's text is the document: an edit patches the entry's own
  span of it, so the bytes of every other entry stay as they were, and undo is
  the text's. One too large for the extension's table editor opens read-only,
  and so does a compressed one with no data part (its table says why). One whose
  data part does not read opens editable, as the VS Code extension's editor
  opens it: its table says why it cannot be shown, and `serialize()` refuses.

## Show a folder

A `FolderHierarchy` reads a folder's files through core's source cache and
answers its hierarchy as rows: each project and folder, the files in it, and
under each file the files it references, with the references no file answers
and the files that close a cycle marked. `<dex-hierarchy>` draws them, and
`connectHierarchy` wires the two:

```js
import { FolderHierarchy } from 'data-explorer-view/model';
import { connectHierarchy, defineHierarchy } from 'data-explorer-view/hierarchy';

const hierarchy = new FolderHierarchy({
  files: { list: async () => files },        // the folder's SourceFiles, in a stable order
  reader: (files) => readerFor(files),       // a GraphReader: versions, bytes, project stores
});
defineHierarchy();
const handle = connectHierarchy(tree, hierarchy, { expandTopLevel: true }); // the folder's row open
handle.on('open', (uri) => openTab(uri));
handle.reveal(activeTab.uri); // show the file the app has open: its row opened up to and selected
```

The app lists the folder and reads its files: in Electron or Node, core's
`listFolder(root)`, `nodeSourceReader(files)` and `readProjectStoreFromDisk(path)`
(`data-explorer-core/node/folder`) are a listing and a reader, and
`listedFiles(listing)` turns the listing into the folder's files. A listing cut
at its limit says so (`truncated`), and the tree then ends with a row that says
only the first files are shown. `hierarchy.rebuild()` reads the
folder again when a file in it is created, deleted or saved (only what changed
is read), and `refresh()` redraws the marks for a file's unsaved changes
(`isDirty`). `resolveReference(name, referrer)` answers which file a bare name
means, by the rule the tree draws with. The rows are what the VS Code
extension's sidebar draws for the same folder.

A page with no file system (a sandboxed Electron window) has its folder read
where the files are, across one message channel: `serveFolder({ files, reader },
port)` there (Electron's main process, a worker), and `folderReader(port)` in
the page, which is both the folder's `files` and its `reader`
(`new FolderHierarchy({ files: folder, reader: () => folder })`). The host reads
only the files it listed: a question names a file by its exact uri in the host's
own listing, and any other is refused with nothing read. `changed(uris?)` on its
end tells the page's `onChange` listeners to rebuild, with the files a watcher
saw change when it knows them (a hint: the page lists again to tell what came,
went or was saved). A table beside the tree opens the file the tree
shows for a name a link holds with connectTable's `resolveLink:
(link, fromUri) => hierarchy.resolveLink(link, fromUri)`, whose answer arrives on
`navigate` as `uri`. See [the hierarchy's page](docs/widgets/hierarchy.md).

The Usage column says who uses each variable of a dictionary or a MAT-file,
and where each parameter of a model's blocks comes from: answers that are in
the files around a document, not in it. A workspace fills it from the folder
when it is given a `usage` source. `UsageGraphs` is one: a usage graph per
document, over just the files that can reach it (core's `planSummaries`), kept
until the folder changes:

```js
import { isGraphPath } from 'data-explorer-core';
import { UsageGraphs, createUsageRepostHub, createWorkspace } from 'data-explorer-view/model';

const graphFiles = files.filter((f) => isGraphPath(f.path)); // no projects
const graphs = new UsageGraphs({
  inputs: { inputsKey: () => '', candidates: async () => graphFiles, readerFor },
  cache: hierarchy.cache, // read the folder once for the tree and the column
});
const reposts = createUsageRepostHub({ watch: watchCreatesAndDeletes, graphs });
const ws = createWorkspace({ usage: graphs, usageReposts: reposts });
await ws.open(bytes, name, sourceUri(path)); // the uri the folder lists it by
```

Every paint and every fetch of rows is filled, as the extension fills its
tables. When a file of the folder changes, `graphs.invalidate()` (only what
changed is read again). A model created or deleted can change what a
dictionary's or a MAT-file's column says, so the repost hub, given the app's
watch on the folder (held only while such a table is open), drops the graphs
and repaints each of those tables once per burst. An editor that also reads
its open files names them in `inputsKey` and `candidates`. A click on a Usage
link reaches `handle.on('navigate')`: `resolveNavSource(source, referrer, {
scoped: hierarchy.resolveReference, firstMatch })` names the file to open, by
the rule the hierarchy draws with, and `selectByName` the row (a block by its
key). `parseNavTarget` reads a link target on its own.

A search over a folder's entry names (dictionary and MAT-file variables,
model-workspace variables, blocks) is a `NameIndex`: read once through the same
cache, a file reindexed (`reindex`, from an editor's unsaved bytes when the
reader's `dirtyBytes` has them) or removed at a time. `searchEntries(records,
query)` is what a result list shows, the extension's search text: each match's
name, where it is, its icon, and the name `selectByName` reveals it by (a
block's key).

```js
const names = new NameIndex({ files, reader: (files) => ({ ...readerFor(files), dirtyBytes: () => null }), cache });
const records = sortNameRecords(await names.list());
for (const item of searchEntries(records, 'Gain')) list.append(rowFor(item.label, item.description, item.iconId));
```

### Serve a folder from Electron's main process

Main serves the folder over one end of a `MessageChannelMain` and sends the page
the other. A port cannot cross `contextBridge`, so the preload hands it into the
page with `window.postMessage`, and the page takes it only from its own window:

```js
// main: data-explorer-view/serve and core's node/folder (1.50 or later) load neither view's model nor core's
import { listFolder, nodeSourceReader, readProjectStoreFromDisk, watchFolder } from 'data-explorer-core/node/folder';
import { listedFiles, portFromMainPort, serveFolder, sourceUri } from 'data-explorer-view/serve';
const { port1, port2 } = new MessageChannelMain();
const served = serveFolder({
  files: { list: async () => listedFiles(await listFolder(root)) },
  reader: (files) => ({ ...nodeSourceReader(files), projectStore: (f) => readProjectStoreFromDisk(f.path) }),
}, portFromMainPort(port1));
const watch = watchFolder(root, (paths) => served.changed(paths?.map(sourceUri)));
if (!watch.watching) console.warn(`${root} is shown but not followed: ${watch.error?.message}`);
win.webContents.postMessage('folder-port', null, [port2]);

// preload
ipcRenderer.on('folder-port', (e) => window.postMessage({ type: 'folder-port' }, '*', e.ports));

// page
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'folder-port' || !e.ports[0]) return;
  const folder = folderReader(portFromMessagePort(e.ports[0]));
  const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
  folder.onChange(() => hierarchy.rebuild());
  connectHierarchy(tree, hierarchy, { expandTopLevel: true });
});
```

Core's `watchFolder` follows the folder by `listFolder`'s rules, and calls back once per
burst of changes (a save is several events, a branch switch thousands; 300 ms of quiet ends
one), with the supported files the burst touched, or with none when anything may have
changed (a folder created or removed, an event with no name): `changed(undefined)` then
tells the page to list it all again. It never throws: a folder it cannot follow (missing,
not a directory, or Linux before Node 20) gives `watching: false` and says why in `error`,
and the folder is still shown, read again only when the app says so. `watch.dispose()` and
`served.dispose()` when the folder closes. A `.prj` project's store
(`resources/project/*.xml`) is no listed file, so a saved store is not reported, and a
project page drawn from it is not redrawn by itself.

A project row of the tree opens its marker's uri (a `.prj`, or a `matlab.toml`). The page
has no file system, so the store comes through the folder reader, which the host answers
for a listed marker once the folder has been listed (the tree lists it first; a folder
session's `listed()` resolves then):

```js
// page: open a project row on its page (core's isProjectFile; dirname and join are the app's)
handle.on('open', async (uri) => {
  const marker = uriPath(uri);
  if (!isProjectFile(marker)) return openTab(uri);
  const store = (await folder.projectStore({ uriString: uri, path: marker })) ?? {};
  projectPage.payload = projectPageMessage(store, marker, dirname(marker));
});
projectPage.addEventListener('dex-project-open', (e) => {
  // Relative to payload.root, `..` kept (`../LibProj`): a file, or a folder (a References row
  // names the referenced project's folder); preferProject asks for the project in that folder.
  const target = join(projectPage.payload.root, e.detail.path);
  if (e.detail.preferProject) openProjectIn(target);
  else openPath(target);
});
```

`readProjectPage(marker, fs)` reads the store itself, for a host with a `StoreFs` (Node,
core's `nodeStoreFs`); see [the project page's page](docs/widgets/project-page.md).

Electron notes, which the recipe above does not show:

- Electron 44's `clipboard.writeText` returns a promise: return it from the main process's
  handler, and the page's call as connectTable's `copy`, so a refusal reaches the table's
  error banner instead of passing unseen.
- An error thrown in an `ipcMain.handle` handler reaches `ipcRenderer.invoke` wrapped, as
  `Error invoking remote method '<channel>': Error: <message>`: unwrap it before a banner
  shows it.
- Vite's dev server injects stylesheets as `<style>` elements, so the dev page's
  Content-Security-Policy needs `style-src 'unsafe-inline'`; a built page does not (every
  widget sets its styles through the CSSOM).
- A channel of the app's own that takes a path from the page (to reveal a file, to open a
  tab) must confine it to the folder as `serveFolder` does: a file the host listed, by its
  exact uri, never a path the page made up.

## Show a folder with Usage and search

An app that shows a folder's tree, fills its tables' Usage column from it and
searches its names makes one `FolderSession`: the hierarchy, the usage graphs,
the name index and the repost hub, over one listing of the folder and one
cache, so a file is read once whichever of them asks first.

```js
import { createFolderSession, createWorkspace, searchEntries, sortNameRecords, sourceUri } from 'data-explorer-view/model';
import { connectHierarchy } from 'data-explorer-view/hierarchy';

const folder = createFolderSession({
  files: { list: async () => files }, // the folder's SourceFiles, in a stable order
  reader: (files) => readerFor(files), // versions, bytes, project stores (and dirtyBytes in an editor)
  watch: (changed) => {
    // Any watch that says which files changed, or a FolderReader's onChange as it is.
    const on = (event, path) => changed([sourceUri(path)]);
    watcher.on('all', on);
    return () => watcher.off('all', on);
  },
});
connectHierarchy(tree, folder.hierarchy).on('open', openTab);
const ws = createWorkspace({ usage: folder.usage, usageReposts: folder.reposts });
const records = sortNameRecords(await folder.names.list());
const matches = searchEntries(records, 'Gain');
```

`folder.changed(uris?)`, which the watch calls, says the folder changed; the
uris, when known, are the files that did. The session lists the folder once,
compares the listing with the last, and brings each part up to date: the usage
graphs are dropped, a deleted file's names removed and a new or saved file's
read again, the hierarchy rebuilt, and each open dictionary's and MAT-file's
table repainted once a burst when a model was created or deleted. A change
asked for while one runs is taken with the others as one more listing. A
workspace that outlives a folder takes the next one's with `ws.setUsage(usage,
usageReposts)`, which repaints every open table it shows (dictionaries, MAT-files
and models) refilled; `doc.repaint()` repaints one table. `folder.dispose()` stops it all. See
[the folder session's page](docs/folder-session.md).

## Build an app on the shell

`data-explorer-view/app-shell` is the window of a whole app. A toolbar and a
location bar run across the top. Each side has an activity bar and a sidebar: the Explorer (the open files,
and a folder's hierarchy under them), the Gallery (the Add gallery's tiles) and
Search on the left, the Properties and the Raw pane on the right. The open
files are tabs in the middle, and Root shows the relationship graph of them
all. The Terminal (a MATLAB-style command window) and the Log share the bottom
panel, over a status bar. Settings and About are on the activity bar, and a
command palette opens over it all. `connectShell` builds all of it in an empty
`<dex-app-shell>` and runs it over one editing workspace: it opens files in
tabs, saves them, asks before unsaved edits are lost, reloads a file that
changed on disk, follows links from file to file, and shows a folder with its
Usage and search, each as the sections above describe. With no folder shown,
the Usage column is answered over the files open. Search ranks what it finds
by name, value and type, best first, and says what each entry is. Rows dragged
from a table onto a file in the Explorer, or onto one of its sections, move
there, whichever tab is on screen; they are copied with Ctrl (Option on macOS),
and always from a file that is not edited.

```js
import 'data-explorer-view/theme.css';
import { useIconAssets } from 'data-explorer-view/icon-assets';
import { connectShell, defineShellWidgets } from 'data-explorer-view/app-shell';

defineShellWidgets(); // the shell, its parts and modules, and the widgets documents are shown in
useIconAssets();      // or setIconBase('./icons/')

const shell = document.querySelector('dex-app-shell'); // empty, and as large as the window
const app = connectShell(shell, {
  host,                                          // what the page can do with files (below)
  appName: 'My app',                             // the toolbar's name, the window's title, About's heading
  about: [{ label: 'Version', value: '1.0.0' }], // About's lines
});

// What the host hears, it hands to the shell:
app.openPaths(paths);       // files to open, each in a tab of its own (a command line, a drop)
app.showFolder(root, port); // a folder picked, served across `port` by serveFolder
app.fileChanged(path);      // a watcher saw an open file change
onWindowClose(async () => {
  if (await app.requestClose()) closeWindow(); // unsaved edits saved or discarded first
});
```

Nothing opens until the host says so: the window starts on a welcome with Open
File… and Open Folder… buttons. `app.command(id)` carries out a command
(`'new-file'`, `'save'`, `'undo'`, `'show-search'`, …) as its button or its
chord does, for a native menu's items, and `app.dispose()` takes the app down.
The settings, the layout the user left and each file's column choices are kept
in localStorage under connectShell's `storageKey` (`'dex-shell'` by default).

### The host

A `ShellHost` is what the shell asks of the page it runs in. Four members are
needed; without any of the others the shell does without, or asks in the page.
Each member is read when it is needed, so a host may replace one while the
shell runs.

| Member | When the shell calls it | Without it |
|---|---|---|
| `pickFiles()` | Open, Cmd/Ctrl+O, the welcome's Open File…; the paths chosen open | needed |
| `newFile(suggestedName)` | New, Cmd/Ctrl+N, the palette's New Data Dictionary…: where a new dictionary goes (`'untitled.sldd'` offered), or null; it opens there unsaved, and its first Save writes it through `saveFile` (MATLAB R2027a opens what it writes; older releases are unverified) | no New: the host makes no files |
| `readFile(path)` | a file opens (from the host, a link, the folder's tree, a search), and when it changed on disk | needed; a rejection is shown in the file's table |
| `saveFile(path, bytes)` | Save, Save All, and a Save chosen before a close | needed |
| `saveFileAs(path, bytes)` | Save As; the file written opens in the tab's place | needed |
| `pickFolder()` | Folder, Cmd/Ctrl+Shift+O, the welcome's Open Folder…; the folder comes back by `app.showFolder` | no Folder button: the host shows no folders |
| `closeFile(path)` | a file's tab closed, for the host to stop watching it | nothing |
| `confirmClose(names)` | a tab, or the window, is to close with unsaved edits: save, discard or cancel | the shell's own dialog in the page |
| `confirmReload(name)` | a file with unsaved edits changed on disk, or another program wrote over a save of it: reload, or keep the edits | the shell's own dialog in the page |
| `setEdited(edited)` | each repaint: whether any open file has unsaved edits (the window's edited mark, a prompt before it closes) | nothing |
| `setTitle(title)` | each repaint: `● plant.sldd — My app` | `document.title` |
| `copyText(text)` | Copy Name, Copy Value | `navigator.clipboard` |
| `reveal(path)` | a project page's link to what the shell does not open (a folder, a script) | the link does nothing |
| `revealIn` | read for a project page's links: what the file manager is called | `'Finder'` on macOS, `'the file manager'` elsewhere |

An Electron app writes its own host: each member a call over IPC to its main
process, which answers with a native dialog, the disk (core's
`data-explorer-core/node/save`) and its watcher, and serves a folder with
`serveFolder` as above, posting the page the port for `app.showFolder`. Its
native menu owns the File and Edit chords, so it passes `nativeMenu: true`, and
each item calls `app.command(id)`:

```js
// The page; window.api is the preload's bridge to main.
const host = {
  newFile: (name) => window.api.newFile(name), // a native Save dialog: the path, or null; main writes nothing yet
  pickFiles: () => window.api.openFile(),
  pickFolder: () => window.api.openFolder(), // main serves it, and posts its port for app.showFolder
  readFile: (path) => window.api.readFile(path),
  closeFile: (path) => window.api.closeFile(path),
  saveFile: (path, bytes) => window.api.saveFile(path, bytes),
  saveFileAs: (path, bytes) => window.api.saveFileAs(path, bytes),
  confirmClose: (names) => window.api.confirmClose(names), // a native message box
  setEdited: (edited) => window.api.setEdited(edited),
};
const app = connectShell(shell, { host, appName: 'My app', nativeMenu: true });
window.api.onMenu((id) => app.command(id));
```

A plain browser page, with no backend, has one ready-made:
`browserHost()` (`data-explorer-view/browser-host`) picks, reads and saves
files in the browser (in place with Chromium's File System Access API, by file
inputs and downloads elsewhere), watches the open files where it can, and
serves a picked or dropped folder in the page, so the hierarchy, Usage, search
and project pages work as on the desktop. See
[docs/browser-host.md](docs/browser-host.md) for what works in which browser.

```js
import { connectShell, defineShellWidgets, installFileDrop } from 'data-explorer-view/app-shell';
import { browserHost } from 'data-explorer-view/browser-host';

defineShellWidgets();
const host = browserHost({
  onFolder: (root, port) => app.showFolder(root, port),
  onChanged: (path) => app.fileChanged(path),
});
const app = connectShell(document.querySelector('dex-app-shell'), { host, appName: 'My app' });
installFileDrop(window, async (dt) => app.openPaths(await host.openDropped(dt)));
addEventListener('beforeunload', (e) => {
  if (host.edited) e.preventDefault(); // the browser asks before unsaved edits are lost
});
```

### What a page adds

A page tells the user something of its own with `app.notify`: a toast in the
window's corner, and the same line in the Log. An `'info'` notice (the
default) goes by itself; a `'warning'` or an `'error'` stays until it is closed.

```js
app.notify({ level: 'warning', text: 'samples/plant.slx could not be fetched: 404 Not Found' });
```

A button of its own goes on an activity bar as a `<dex-shell-action>` the page
adds to the shell after `connectShell`. The shell draws it after Settings and
About (on the right bar with `side="right"`), and a press of it, or of its
`shortcut`, sends `dex-shell-action` from the shell with the action's id and
the button's box, for the page to answer; the shell answers only its own.
`settings` and `about` are the shell's ids: an action of the page's with one
of them is not drawn. The page's actions stay its own, and `app.dispose()`
leaves them in the shell.

```js
shell.insertAdjacentHTML('beforeend', '<dex-shell-action side="left" action="samples" label="Samples" icon="documentList"></dex-shell-action>');
shell.addEventListener('dex-shell-action', (e) => {
  if (e.detail.actionId === 'samples') openSamples(); // e.detail.anchor: the button's box, for a popover
});
```

The Settings' Auto follows the system's theme: the page's media queries
(`prefers-color-scheme`, `prefers-contrast`, `forced-colors`), or the
`systemTheme` source the host passes (`{ now(), on(listener) }`). A host that
hears the theme only once the page is up, as an Electron page hears
`nativeTheme` over IPC, tells it with `app.setSystemTheme(theme)` (`'light'`,
`'dark'` or `'high-contrast'`), at once and on each change: from its first
call the shell follows what the host tells, and no longer the source.

```js
window.api.ready().then(({ theme }) => app.setSystemTheme(theme));
window.api.onTheme((theme) => app.setSystemTheme(theme));
```

About's lines can go under a heading, by `section`: the lines with none come
first, under the app's name, then each section under its heading. This
package's version is `VIEW_VERSION`, from `data-explorer-view/model`. Core
exports no version of its own: an app that shows it reads it at its build,
as it reads its own.

```js
import { VIEW_VERSION } from 'data-explorer-view/model';

const app = connectShell(shell, {
  host,
  appName: 'My app',
  about: [
    { label: 'Version', value: '1.0.0' },
    { label: 'data-explorer-view', value: VIEW_VERSION, section: 'Built on' },
  ],
});
```

### Keyboard shortcuts

Cmd on macOS is Ctrl elsewhere. The shell answers each chord wherever the focus
is, but leaves it to a text field that has the focus, except New, Open and Save,
and leaves Undo and Redo to a table, which undoes its own document.

| Keys | |
|---|---|
| Cmd/Ctrl+N | New Data Dictionary… (a host with `newFile`) |
| Cmd/Ctrl+O, Cmd/Ctrl+Shift+O | Open File…, Open Folder… |
| Cmd/Ctrl+S, Cmd/Ctrl+Shift+S, Cmd/Ctrl+Alt+S | Save, Save As…, Save All |
| Cmd/Ctrl+W | close the tab |
| Ctrl+Tab, Ctrl+Shift+Tab | the next tab, the one before |
| Cmd/Ctrl+F | the active table's search |
| Cmd/Ctrl+Z; Cmd/Ctrl+Shift+Z, and Ctrl+Y off macOS | Undo; Redo |
| Shift+F10, the ContextMenu key | the menu of the table's selected row |
| Alt+Left, Alt+Right, Alt+Up | Back, Forward, Up |
| Cmd/Ctrl+, | Settings |
| Cmd/Ctrl+Shift+P, F1 | the command palette |
| Cmd/Ctrl+Shift+E, Cmd/Ctrl+Shift+L, Cmd/Ctrl+Shift+F | the Explorer, the Gallery, Search |
| Cmd/Ctrl+Shift+I, Cmd/Ctrl+Shift+U | the Properties, Raw |
| Ctrl+\` (on macOS too), Cmd/Ctrl+Shift+D | the Terminal, the Log |

A view's chord shows it, or closes its side when it is the one shown. With
`nativeMenu: true` the shell answers only Save All, Back, Forward, Up, Settings,
the command palette and the views' chords, and the menu the rest. In a browser
tab, a few chords are the browser's whatever the page does: a browser keeps
Cmd/Ctrl+N for a new window (Chromium and Firefox both do), and Chromium keeps
Cmd/Ctrl+W, Ctrl+Tab and Ctrl+Shift+Tab for its own tabs; there the toolbar,
the tab row and the command palette do the same. The shell's own
chords keep clear of such keys: Raw is Cmd/Ctrl+Shift+U because
Cmd/Ctrl+Shift+W closes a Chromium window before the page hears it, the
Terminal is Ctrl+\` on macOS too because Cmd+\` moves between an app's windows
there, and F1 opens the command palette wherever a browser keeps
Ctrl+Shift+P for itself.

### Every part on its own

Each part of the shell is an element of its own, which an app can use without
`connectShell`, or without the shell: [`<dex-app-shell>`](docs/widgets/app-shell.md)
with its [views](docs/widgets/shell-view.md) and
[actions](docs/widgets/shell-action.md), the [toolbar](docs/widgets/toolbar.md),
the [tab row](docs/widgets/doc-tabs.md), the
[location bar](docs/widgets/location-bar.md), the
[Explorer](docs/widgets/explorer.md), the
[Settings](docs/widgets/settings-panel.md) and
[About](docs/widgets/about-panel.md) popovers, the
[toasts](docs/widgets/toast-host.md), the
[confirm dialog](docs/widgets/confirm-dialog.md), and the modules: the
[Raw pane](docs/widgets/raw-viewer.md), [Search](docs/widgets/search-panel.md),
the [Gallery](docs/widgets/gallery-panel.md), the
[relationship graph](docs/widgets/relationship-graph.md), the
[command window](docs/widgets/command-window.md), the
[Log](docs/widgets/log-panel.md) and the
[command palette](docs/widgets/command-palette.md). Each draws what it is given
and asks for the rest with its events; its page says what it takes and sends.

## What is in it

**`model/`** builds what the widgets show from core's data model: the table's
rows, the property inspector's pages and the variable editor's cells. It also
holds the rules for filtering, and for which rows an action, a drop or a paste
acts on. It uses no DOM and no Node, so it runs in a page, a worker or a
terminal UI.

```js
import { createWorkspace } from 'data-explorer-view/model';

const doc = await createWorkspace().open(bytes, name); // core reads the file
const { rows } = await doc.table.open(); // the table's rows
```

**`widgets/`** are [Lit](https://lit.dev) custom elements: the tree table (with
its filter bar, column filter and Add gallery), the property inspector, the
variable editor, the context menu, the error dialog, the folder hierarchy, the
project page, and the app shell with its parts and modules.
Importing a widget defines nothing: call its define function before the
first element is created, as above. It defines the parts the widget draws (the table's
filter bar, for example) under their default names, then the widget, under
the name you pass or its default. A name already defined by a different class
throws, naming both.

```js
import { defineTreeTable } from 'data-explorer-view/tree-table';

defineTreeTable(); // <dex-tree-table>; or defineTreeTable('my-table')
```

Every widget honours the `hidden` attribute, and sets its inline styles
through the CSSOM, so it draws on a page whose Content-Security-Policy has no
`style-src 'unsafe-inline'`. The tree table's defaults are a full editor; an
app turns parts of it off or over:

| Property (attribute) | Default | |
|---|---|---|
| `readonly` (`readonly`) | `false` | no cell editor, no `+ Add`, no row drag or drop |
| `canAdd`, `rowDrag` | `false`, `true` | the `+ Add` button; dragging rows |
| `dragOut` (`drag-out`) | `false` | rows dragged out onto the page, from a table that takes no row drag too (as a copy) |
| `expandTopLevel` (`expand-top-level`) | `false` | open the top level of the first rows, then keep what the user opened |
| `expandedIds`, `expand(ids)`, `collapse(ids)` | | which rows are open |
| `storageKey` (`storage-key`) | `'dex'` | the prefix of the localStorage keys the column choices are kept under; `null` keeps them out of storage |

**`icons/`** holds the SVG files the widgets draw
(`data-explorer-view/icons/<id>.svg`): every icon a row, an Add gallery tile or
a button can ask for. By default a widget loads them from the package's own
`icons/` folder, found from the module's URL, which works wherever the
package's files are served as installed (a static server, an import map). A
bundler moves the widgets into a chunk of its own, so an app that bundles
copies the folder to where it serves its assets and says where, before the
first icon renders:

```js
import { setIconBase } from 'data-explorer-view/icon';

setIconBase('./icons/'); // a folder URL; relative ones resolve against the page
```

Or let the bundler copy them. `data-explorer-view/icon-assets` names each icon
as `new URL('…/<id>.svg', import.meta.url)`, which bundlers that follow that
form (Vite, webpack 5, Parcel) copy into the build, and `useIconAssets()` draws
every icon from there, in place of `setIconBase`:

```js
import { useIconAssets } from 'data-explorer-view/icon-assets';

useIconAssets(); // before the first icon renders
```

With a bundler, two of its settings matter here: see [Icons with a
bundler](#icons-with-a-bundler).

**`theme.css`** holds every colour, font and size token the widgets read: light
defaults, and `[data-theme="dark"]` and `[data-theme="high-contrast"]` sets
(put the attribute on `<html>`). Each widget falls back to the light value of
every token it reads, so a widget is readable on a page that loads no theme at
all. The icons are drawn for a light background, and the dark set turns them
over with `--dex-icon-filter`; a `<dex-icon mono>` (the shell's Minimal icons)
is drawn in its text colour instead, with no filter. To match your app, declare
the `--dex-*` tokens after this file, or map them onto your own design system's
variables.

```js
import 'data-explorer-view/theme.css';
```

## Icons with a bundler

With `useIconAssets()` the bundler copies the icons, and two settings decide how
it serves them. With Vite:

- **Dev server: `optimizeDeps`.** Leave the package out of dependency
  pre-bundling: a pre-bundled copy of the module is no longer beside the icons.
  Vite then does not look inside the package for what it imports either, so
  name those for pre-bundling. Otherwise the dev server finds them as the first
  page loads, and reloads that page.
- **Build: `build.assetsInlineLimit`.** Vite turns each asset smaller than this
  (4 KB by default) into a `data:` URL in the bundle. Nearly every icon is
  smaller, so by default the page carries the whole icon set as text, and its
  Content-Security-Policy has to allow `img-src data:`. At `0` the icons stay
  files the page loads only when it draws them, under `img-src 'self'`. A
  function keeps your own small assets inlined and the icons files.

```js
// vite.config.js
export default {
  optimizeDeps: {
    exclude: ['data-explorer-view'],
    include: ['data-explorer-core', 'lit', 'lit/decorators.js', 'lit/directive.js', 'lit/directives/guard.js', 'lit/directives/live.js', 'lit/directives/repeat.js'],
  },
  build: {
    assetsInlineLimit: 0,
    // or: never inline the icons, and decide the rest as Vite would
    // assetsInlineLimit: (file) => (file.includes('/data-explorer-view/icons/') ? false : undefined),
  },
};
```

The [gallery](https://github.com/mathworks/data-explorer-view/blob/main/gallery/README.md) is built this way and runs under
`style-src 'self'; img-src 'self'` in Chromium, Firefox and WebKit.

## Developing

```sh
npm ci
npm run verify   # typecheck, import boundaries, build, API check, tests, leak check
```

After changing `src/`, run `npm run build` and commit `dist/`,
`custom-elements.json` and `docs/widgets/` with the change. CI fails when
they are not the build of `src/`. A widget's page is written below its marker
line from the manifest: change the widget's JSDoc, not the page.

`npm run check:api` compares the package with the one in the latest release
tag: the export map, every entry's export names, each widget's properties,
methods, attributes and events and the attributes it observes, the fields of
each event's detail and of each message on the wire, the theme's tokens, the
icon ids, `sideEffects` and the peer dependencies. One that is gone (or, for a
detail or a message, changed) fails it, unless `package.json`'s version is a
major bump over that tag's. What is added is reported, and so is anything on
`data-explorer-view/host`.

The gallery shows every widget on a page of its own, on small public files, and
is what the browser tests run against, in Chromium, Firefox and WebKit. It is
also an example of an app built on the package. See
[gallery/README.md](https://github.com/mathworks/data-explorer-view/blob/main/gallery/README.md).

```sh
npm run gallery        # the pages, in Vite's dev server
npm run test:gallery   # the browser tests
```

## License

BSD 3-Clause. See [LICENSE](LICENSE). To report a security issue, see
[SECURITY.md](https://github.com/mathworks/data-explorer-view/blob/main/SECURITY.md).
