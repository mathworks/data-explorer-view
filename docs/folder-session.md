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
on, repaints every open dictionary's and MAT-file's table refilled, and moves their repost
subscriptions to the new hub; `ws.setUsage()` goes back to none. A model's table is refilled at
its next paint; `doc.repaint()` repaints any one table now.

`dispose()` lets the watch go, stops the reposts, and makes a later `changed()` do nothing.
