// Copyright 2026 The MathWorks, Inc.
//
// What a drop from the OS holds, as the browser host reads it: files and folders. Chromium hands
// a handle for each item (`getAsFileSystemHandle`): a file's reads the file as it is now and may be
// written, like a picked one, and a folder's is listed afresh each time, like one from the
// directory picker. Firefox and Safari hand an entry (`webkitGetAsEntry`): a file is its File, and a
// folder is read through once, at the drop, into the files it holds then, as an
// `<input webkitdirectory>` gives them. A browser with neither, or a drop with no items, has only
// the drop's Files, among which a folder cannot be told from a file: each is taken for a file, and
// one that is a folder fails to read in its tab.
//
// Everything is asked of the DataTransfer before the first await. Its items can be read only while
// the drop event is being handled (the drag data store is protected once the listener returns),
// while the promises and entries they hand out live on; so dropSources is called from the drop
// listener itself, as installFileDrop calls its `drop`, and not after anything is awaited.

import type { DropItemHandle } from './fsAccess.js';
import type { WebSource } from './files.js';
import { skipDirectory, type ListedFile, type WebDir } from './walk.js';

/** One thing dropped: a file, by its name and what reads it, or a folder. */
export type DroppedItem = { kind: 'file'; name: string; source: WebSource } | { kind: 'folder'; dir: WebDir };

/** What one item of the drop handed out while the drop was being handled. */
interface Asked {
  handle: Promise<FileSystemHandle | null> | undefined;
  entry: FileSystemEntry | null;
  file: File | null;
}

/**
 * The files and folders of a drop, in the order they were dropped. Call it from the drop's
 * listener (see the file's header): what the drop holds is asked for at once, and read after.
 */
export function dropSources(data: DataTransfer): Promise<DroppedItem[]> {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file');
  if (items.length === 0) {
    return Promise.resolve(Array.from(data.files, (file): DroppedItem => ({ kind: 'file', name: file.name, source: { kind: 'file', file } })));
  }
  const asked: Asked[] = items.map((item) => ({
    handle: (item as DataTransferItem & DropItemHandle).getAsFileSystemHandle?.(),
    entry: item.webkitGetAsEntry?.() ?? null,
    file: item.getAsFile(),
  }));
  return Promise.all(asked.map(readItem)).then((all) => all.filter((item): item is DroppedItem => item !== null));
}

/** What one item is: through its handle where there is one, else its entry, else its File. */
async function readItem({ handle, entry, file }: Asked): Promise<DroppedItem | null> {
  // A handle the browser would not give (a drop from another page, say) leaves the entry and the File.
  const h = handle ? await handle.catch(() => null) : null;
  if (h?.kind === 'directory') return { kind: 'folder', dir: { kind: 'handle', handle: h as FileSystemDirectoryHandle } };
  if (h?.kind === 'file') return { kind: 'file', name: h.name, source: { kind: 'handle', handle: h as FileSystemFileHandle } };
  if (entry?.isDirectory) {
    return { kind: 'folder', dir: { kind: 'list', root: entry.name, files: await entryFiles(entry as FileSystemDirectoryEntry, '') } };
  }
  return file ? { kind: 'file', name: file.name, source: { kind: 'file', file } } : null;
}

/**
 * Every file under the directory entry `dir`, by its path in the dropped folder (`prefix` the path
 * of `dir` in it). A directory the listing would not enter is not read at all: a node_modules can
 * hold more files than the rest of the folder. One that cannot be read, or a file that cannot, is
 * passed over, as listDirectory passes over a directory it cannot read.
 */
async function entryFiles(dir: FileSystemDirectoryEntry, prefix: string): Promise<ListedFile[]> {
  const reader = dir.createReader();
  const out: ListedFile[] = [];
  // readEntries answers a batch at a time (Chromium's are 100 long), and an empty one at the end.
  for (;;) {
    let batch: FileSystemEntry[];
    try {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    } catch {
      return out;
    }
    if (batch.length === 0) return out;
    for (const entry of batch) {
      if (entry.isDirectory) {
        if (!skipDirectory(entry.name)) out.push(...(await entryFiles(entry as FileSystemDirectoryEntry, `${prefix}${entry.name}/`)));
      } else if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)).catch(() => null);
        if (file) out.push({ rel: prefix + entry.name, file });
      }
    }
  }
}
