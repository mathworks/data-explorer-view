# Folder session

`createFolderSession` (`data-explorer-view/model`) is a folder read once for everything an app
shows of it:

| Part | What it is | Feeds |
|---|---|---|
| `hierarchy` | a `FolderHierarchy`: each project and folder, the files in it, what each references | `connectHierarchy`, a table's `resolveLink` |
| `usage` | a `UsageGraphs`: who uses each variable, where each block parameter comes from | a workspace's `usage` |
| `names` | a `NameIndex`: every entry, variable and block name | `searchEntries` |
| `reposts` | a `UsageRepostHub`: a data table's repaint when a model comes or goes | a workspace's `usageReposts` |
| `cache` | the one source cache all four read through | another folder pass of the app's |

All four read **one listing** of the folder (`files.list()`, asked once when first needed and
once per change) through **one reader** (`reader(files)`) and **one cache**, so a file is read
once whichever part asks first, and a change is one listing for all of them.

`has(uri)` says whether the last listing holds a file: whether a document the app has open is the
folder's, and so whether to fill its Usage column from the folder. It is false until the first
listing has answered (the session lists when a part first asks, or on `changed()`).

The Usage column's id is `UsedBy`. A model's table fills it from the model itself; a dictionary's
or a MAT-file's only from the folder's usage graphs, so for such a file opened from outside the
folder nothing fills it. Leave the column out of that table with connectTable's `columns`:

```js
connectTable(table, doc.table, {
  columns: (column) => column !== 'UsedBy' || doc.kind === 'model' || folder.has(doc.uri),
});
```

`columns` is asked again on every whole paint, so a file the folder comes to hold (once the first
listing answers, or after a change) gets its column at its next paint.

## Options

| Option | |
|---|---|
| `files` | the folder: `{ list(): Promise<SourceFile[]> }`, its supported files in a stable order (folder order decides which of two same-named files a name means) |
| `reader(files)` | versions, bytes and project stores for those files (a `GraphReader`), and for an app that edits, `dirtyBytes(file)`: an open file's unsaved bytes, which the names prefer and nothing caches. A `FolderReader` (`folderReader(port)`) is one |
| `watch` | optional: `(changed) => stop`, where `changed(uris?)` is called for each change and `stop` is a function or `{ dispose() }`. A `FolderReader`'s `onChange` is one. Without it the app calls `changed()` |
| `cache` | optional: the source cache to read through |
| `isDirty(uri)` | optional: marks the hierarchy rows of a file with unsaved changes |
| `repostDelayMs`, `repostTimers` | optional: the repost hub's trailing window and timers |

## A change

`changed(uris?)` says the folder changed. `uris`, when given, are the files that did (created,
deleted or saved); absent, anything may have. The session lists the folder once, compares the
listing with the last, and then:

- drops the usage graphs (the per-file summaries in the cache outlive it: only what changed is
  read again);
- removes a deleted file's names, and reads again a created file's and, with `uris`, a saved
  one's; without `uris` every name is read again, through the cache (a `stat` a file);
- rebuilds the hierarchy;
- for a model created or deleted, owes each subscribed data table one repaint per burst (the
  repost hub's window, 300 ms). A dictionary saved owes none: only a model can add or remove a
  block that uses a variable.

A `changed()` asked for while one runs waits, and every one asked for meanwhile is taken together
as one more listing. Each resolves when the session is up to date.

## A workspace that outlives a folder

A workspace takes its usage source at `createWorkspace({ usage, usageReposts })`, or later:
`ws.setUsage(folder.usage, folder.reposts)` fills the Usage column from the new source from then
on. Every paint reads the source, a model's as much as a dictionary's: a dictionary entry's cell
names the blocks that use it, and a model block's cell resolves each parameter to the file that
holds it (`Gain=SharedGain (sharedParams.sldd)`, its link naming that file by uri, where the file
alone could only name it by its basename). So every open table that is shown (one with a
subscriber) is painted again, refilled: dictionaries, MAT-files and models; one with none is
refilled at its next paint, and a project has no table. The repost subscriptions move to the new
hub and stay a dictionary's and a MAT-file's alone: no other model changes what a model's table
says. `ws.setUsage()` goes back to none. `doc.repaint()` repaints any one table now.

`dispose()` lets the watch go, stops the reposts, and makes a later `changed()` do nothing.
