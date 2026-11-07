// Copyright 2026 The MathWorks, Inc.
//
// The workspace folder in the Folder view: read across the port the host serves it on (serveFolder
// there, folderReader here), as one folder session: its hierarchy, its Usage, its names. Its tree
// is a FolderTree over the hierarchy, every entry of each folder as its row opens, for a host that
// lists entries; for one that lists none, the hierarchy's own tree, as before.
//
// Lifted from data-explorer-app src/renderer/folder.ts at 0983920. The empty note may be a
// function, as connectHierarchy takes one, since the shell's note is a property of its folder
// element rather than an element of the page.

import { isGraphPath, type SourceFile } from 'data-explorer-core';
import { createFolderSession, type FolderSession } from '../../../model/folder/folderSession.js';
import { FolderTree } from '../../../model/hierarchy/folderTree.js';
import { folderReader } from '../../../model/source/folderReader.js';
import { portFromMessagePort } from '../../../model/source/ports.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import type { ProjectStore } from '../../../model/hierarchy/graphSources.js';
import type { RawSource } from '../../../model/usage/usageCells.js';
import { connectHierarchy } from '../../hierarchy/connectHierarchy.js';
import type { DexHierarchy, HierarchyMenuDetail, RowMark } from '../../hierarchy/dex-hierarchy.js';

/** A folder shown in a tree, read across its port: what the shell asks of it. */
export interface FolderView {
  /** The folder's path, as the host named it. */
  readonly root: string;
  /** Its session: the hierarchy, the Usage graphs and the names its search reads. */
  readonly session: FolderSession;
  /** Whether the folder's last listing holds the file of `uri`. */
  lists(uri: string): boolean;
  /** The uri of the file a link opens by the tree's rule, or none. */
  resolveLink(link: LinkTarget, fromUri: string): Promise<string | null | undefined>;
  /** Select the row of the file `uri`, opening the rows above it. */
  reveal(uri: string): void;
  /** Mark each file's rows as its tab stands, by its uri (the tree's `marks`). */
  setMarks(marks: ReadonlyMap<string, RowMark>): void;
  /**
   * Read the folder again (⟳): its listing, so the index takes what changed, and every open row's
   * entries, which no listing of data files says changed (a note written into it).
   */
  readAgain(): Promise<void>;
  /** The store of the project whose marker is `uri`, once the folder is listed; null for a file it does not list. */
  projectStore(uri: string): Promise<ProjectStore | null>;
  /** The marker (its uri) of the project in the folder `dir`, if the folder holds one. */
  projectIn(dir: string): Promise<string | undefined>;
  /**
   * The folder's files a relationship graph draws (core's `isGraphPath`), listed afresh: a file whose
   * version is the one last read is kept as it was read, the rest are read now; one that cannot be
   * read is left out.
   */
  graphSources(): Promise<RawSource[]>;
  /** Hear the folder change: `uris` the files it touched, none for anything. */
  onChange(listener: (uris?: readonly string[]) => void): () => void;
  /** Stop: the tree hears nothing more, and the port is closed. */
  dispose(): void;
}

/**
 * Show the folder `root`, read across `port`, in `tree`; a chosen file's uri goes to `open`, and a
 * row's menu asked for (a right click, Shift+F10) to `menu`.
 */
export function showFolder(
  tree: DexHierarchy,
  root: string,
  port: MessagePort,
  options: {
    empty: HTMLElement | ((empty: boolean) => void);
    open: (uri: string) => void;
    error: (message: string) => void;
    menu?: (detail: HierarchyMenuDetail) => void;
    /** The index could not be read, where the tree shows the folder's entries all the same (its row says so): why, once. */
    indexFailed?: (message: string) => void;
  },
): FolderView {
  const reader = folderReader(portFromMessagePort(port));
  const session = createFolderSession({ files: reader, reader: () => reader, watch: (changed) => reader.onChange(changed) });
  // The rows' menus are the shell's: a right click and Shift+F10 ask for them.
  tree.rowMenu = true;
  // Every entry of each folder, for a host that lists them; the hierarchy's rows for one that does
  // not, which FolderTree learns from its first answer.
  // Let go of with the folder: a draw still under way as another folder is shown fails on the
  // closed reader, and is no failure of the folder shown now.
  let stopped = false;
  const rows = new FolderTree({
    hierarchy: session.hierarchy,
    entries: (dir) => reader.entries(dir),
    root,
    indexFailed: (err) => {
      if (!stopped) options.indexFailed?.(err instanceof Error ? err.message : String(err));
    },
  });
  const handle = connectHierarchy(tree, session.hierarchy, { empty: options.empty, expandTopLevel: true, tree: rows });
  // The graph's files as last read, by uri, with the version they were read at.
  const read = new Map<string, { version: string; bytes: ArrayBuffer }>();
  const readNow = async (file: SourceFile): Promise<ArrayBuffer | null> => {
    const version = await reader.version(file);
    const kept = read.get(file.uriString);
    if (kept && version !== null && kept.version === version) return kept.bytes;
    const bytes = await reader.bytes(file);
    if (bytes && version !== null) read.set(file.uriString, { version, bytes });
    else read.delete(file.uriString);
    return bytes;
  };
  handle.on('open', options.open);
  handle.on('error', options.error);
  if (options.menu) handle.on('menu', options.menu);
  return {
    root,
    session,
    lists: (uri) => session.has(uri),
    resolveLink: async (link, fromUri) => session.hierarchy.resolveLink(link, fromUri),
    reveal: (uri) => void handle.reveal(uri),
    setMarks: (marks) => handle.setMarks(marks),
    async readAgain() {
      await session.changed();
      // Drawn again from the graph there is: the tree asks each open folder for its entries anew.
      session.hierarchy.refresh();
    },
    // The host answers a store only for a file it listed.
    async projectStore(uri) {
      await session.listed();
      return reader.projectStore({ uriString: uri, path: uriPath(uri) });
    },
    projectIn: async (dir) => (await session.projectIn(sourceUri(dir)))?.id,
    // Listed again, as the host answers bytes only for a file of its last listing; a file listed
    // no more is let go.
    async graphSources() {
      const files = (await reader.list()).filter((f) => isGraphPath(f.path));
      const listed = new Set(files.map((f) => f.uriString));
      for (const uri of [...read.keys()]) if (!listed.has(uri)) read.delete(uri);
      const answers = await Promise.all(files.map(async (f) => ({ f, bytes: await readNow(f) })));
      return answers.flatMap(({ f, bytes }) => (bytes ? [{ uriString: f.uriString, path: f.path, bytes }] : []));
    },
    onChange: (listener) => reader.onChange(listener),
    dispose() {
      stopped = true;
      handle.dispose();
      session.dispose();
      reader.dispose();
      port.close();
    },
  };
}
