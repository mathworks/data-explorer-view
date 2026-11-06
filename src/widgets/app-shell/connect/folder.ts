// Copyright 2026 The MathWorks, Inc.
//
// The folder in the Explorer: read across the port the host serves it on (serveFolder there,
// folderReader here), as one folder session: its hierarchy, its Usage, its names.
//
// Lifted from data-explorer-app src/renderer/folder.ts at 0983920. The empty note may be a
// function, as connectHierarchy takes one, since the shell's note is a property of its folder
// element rather than an element of the page.

import { isGraphPath } from 'data-explorer-core';
import { createFolderSession, type FolderSession } from '../../../model/folder/folderSession.js';
import { folderReader } from '../../../model/source/folderReader.js';
import { portFromMessagePort } from '../../../model/source/ports.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import type { ProjectStore } from '../../../model/hierarchy/graphSources.js';
import type { RawSource } from '../../../model/usage/usageCells.js';
import { connectHierarchy } from '../../hierarchy/connectHierarchy.js';
import type { DexHierarchy } from '../../hierarchy/dex-hierarchy.js';

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
  /** The store of the project whose marker is `uri`, once the folder is listed; null for a file it does not list. */
  projectStore(uri: string): Promise<ProjectStore | null>;
  /** The marker (its uri) of the project in the folder `dir`, if the folder holds one. */
  projectIn(dir: string): Promise<string | undefined>;
  /** The folder's files a relationship graph draws (core's `isGraphPath`), read afresh; one that cannot be read is left out. */
  graphSources(): Promise<RawSource[]>;
  /** Hear the folder change: `uris` the files it touched, none for anything. */
  onChange(listener: (uris?: readonly string[]) => void): () => void;
  /** Stop: the tree hears nothing more, and the port is closed. */
  dispose(): void;
}

/** Show the folder `root`, read across `port`, in `tree`; a chosen file's uri goes to `open`. */
export function showFolder(
  tree: DexHierarchy,
  root: string,
  port: MessagePort,
  options: { empty: HTMLElement | ((empty: boolean) => void); open: (uri: string) => void; error: (message: string) => void },
): FolderView {
  const reader = folderReader(portFromMessagePort(port));
  const session = createFolderSession({ files: reader, reader: () => reader, watch: (changed) => reader.onChange(changed) });
  const handle = connectHierarchy(tree, session.hierarchy, { empty: options.empty, expandTopLevel: true });
  handle.on('open', options.open);
  handle.on('error', options.error);
  return {
    root,
    session,
    lists: (uri) => session.has(uri),
    resolveLink: async (link, fromUri) => session.hierarchy.resolveLink(link, fromUri),
    reveal: (uri) => void handle.reveal(uri),
    // The host answers a store only for a file it listed.
    async projectStore(uri) {
      await session.listed();
      return reader.projectStore({ uriString: uri, path: uriPath(uri) });
    },
    projectIn: async (dir) => (await session.projectIn(sourceUri(dir)))?.id,
    // Listed again, as the host answers bytes only for a file of its last listing.
    async graphSources() {
      const files = (await reader.list()).filter((f) => isGraphPath(f.path));
      const read = await Promise.all(files.map(async (f) => ({ f, bytes: await reader.bytes(f) })));
      return read.flatMap(({ f, bytes }) => (bytes ? [{ uriString: f.uriString, path: f.path, bytes }] : []));
    },
    onChange: (listener) => reader.onChange(listener),
    dispose() {
      handle.dispose();
      session.dispose();
      reader.dispose();
      port.close();
    },
  };
}
