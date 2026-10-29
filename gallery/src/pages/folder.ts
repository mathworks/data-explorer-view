// Copyright 2026 The MathWorks, Inc.
// A folder served across a channel, beside a table, as an app whose page cannot read files wires
// them (a sandboxed Electron window, a webview): the folder is read where the files are
// (serveFolder), and the page's hierarchy and table read it through one port (folderReader). The
// tree opens its top level (expandTopLevel); a file chosen there opens in the table, read through
// the same port; a link in the table opens the file the tree shows for the name it holds
// (resolveLink), in another of the folder's folders if need be; and the tree shows the file the
// table shows (reveal), as an explorer follows its editor.
//
// Both ends are in this page, over a MessageChannel, for the gallery's sake: in an app the first
// half runs in Electron's main process, or a worker, and only the port crosses. That half imports
// only data-explorer-view/serve, the entry made for it.
//
// `?limit=N` lists only the folder's first N files, as core's `listFolder` does past its limit:
// the tree then ends with a row that says so.
import ctrlA from '../../../test-integration/fixtures/usageorder/ctrlA.slx?url';
import plantB from '../../../test-integration/fixtures/usageorder/plantB.slx?url';
import sharedParams from '../../../test-integration/fixtures/usageorder/sharedParams.sldd?url';
import workspaceData from '../../../test-integration/fixtures/workspace/data.sldd?url';
import workspaceModel from '../../../test-integration/fixtures/workspace/model.slx?url';
import workspaceParams from '../../../test-integration/fixtures/workspace/params.sldd?url';
import type { SourceFile } from 'data-explorer-core';
import { connectHierarchy, defineHierarchy, type DexHierarchy } from 'data-explorer-view/hierarchy';
import { createWorkspace, FolderHierarchy, folderReader, sourceUri, uriPath, type Doc, type LinkTarget } from 'data-explorer-view/model';
import { listedFiles, portFromMessagePort, serveFolder, type FolderReads } from 'data-explorer-view/serve';
import { connectTable, defineTreeTable, type TableHandle } from 'data-explorer-view/tree-table';
import { byId, startPage } from '../shell';

startPage();
defineHierarchy();
defineTreeTable();

const channel = new MessageChannel();

// --- Where the files are --------------------------------------------------------------------------
// The two models of usageorder in one folder and the dictionary they share in another, and the
// integration suite's workspace beside them. A file's version is its URL (the build's files do not
// change); there is no project store to walk.

const ROOT = '/fixtures/served';
const URLS: Readonly<Record<string, string>> = {
  'data/sharedParams.sldd': sharedParams,
  'models/ctrlA.slx': ctrlA,
  'models/plantB.slx': plantB,
  'workspace/data.sldd': workspaceData,
  'workspace/model.slx': workspaceModel,
  'workspace/params.sldd': workspaceParams,
};

function served(): FolderReads {
  const urls = new Map(Object.entries(URLS).map(([rel, url]) => [`${ROOT}/${rel}`, url]));
  const paths = [...urls.keys()].sort();
  const limit = Number(new URLSearchParams(location.search).get('limit')) || paths.length;
  return {
    // A listing as core's listFolder answers one: the first files, and whether there were more.
    files: { list: async () => listedFiles({ files: paths.slice(0, limit), truncated: paths.length > limit }) },
    reader: (listed) => {
      const known = new Set(listed.map((f) => f.path));
      const urlOf = (file: SourceFile) => (known.has(file.path) ? urls.get(file.path) : undefined);
      return {
        version: async (file) => urlOf(file) ?? null,
        bytes: async (file) => {
          const url = urlOf(file);
          const response = url ? await fetch(url) : undefined;
          return response?.ok ? response.arrayBuffer() : null;
        },
        projectStore: async () => null,
      };
    },
  };
}

// Each file's bytes handed over, not copied: a MessagePort takes a transfer list.
serveFolder(served(), portFromMessagePort(channel.port1), { transfer: true });

// --- The page ---------------------------------------------------------------------------------------

const folder = folderReader(portFromMessagePort(channel.port2));
const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
const tree = connectHierarchy(byId<DexHierarchy>('folder'), hierarchy, { expandTopLevel: true });
folder.onChange(() => hierarchy.rebuild());

const stage = byId('stage');
const shown = byId('shown');
const log = byId('event-log');
const ws = createWorkspace();
let current: { uri: string; doc: Doc; handle: TableHandle; table: HTMLElement } | null = null;
// The last file asked for: one asked for before it, read after it, is not shown.
let opening = 0;

/** The file a link opens: the one the folder's tree shows for it, else the one it names, by its uri or beside the file it is in. */
function linkedUri(link: LinkTarget, resolved: string | undefined, fromUri: string): string {
  if (resolved) return resolved;
  const named = uriPath(link.kind === 'file' ? link.file : link.source);
  if (named.startsWith('/')) return sourceUri(named);
  const from = uriPath(fromUri);
  return sourceUri(`${from.slice(0, from.lastIndexOf('/'))}/${named}`);
}

/** The row a link selects in the file it opens, by name. */
const linkedName = (link: LinkTarget): string | undefined =>
  link.kind === 'file' ? undefined : link.kind === 'block' ? link.block : link.name;

async function open(uri: string, select?: string): Promise<void> {
  const ask = ++opening;
  if (current?.uri !== uri) {
    const path = uriPath(uri);
    const bytes = await folder.bytes({ uriString: uri, path });
    if (ask !== opening) return;
    if (!bytes) {
      shown.textContent = `${path} is not in the folder.`;
      return;
    }
    const doc = await ws.open(bytes, path.slice(path.lastIndexOf('/') + 1), uri);
    if (ask !== opening) return void doc.dispose();
    current?.handle.dispose();
    current?.table.remove();
    current?.doc.dispose();
    const table = document.createElement('dex-tree-table');
    table.readonly = true;
    table.storageKey = 'dex-gallery:folder';
    stage.append(table);
    const handle = connectTable(table, doc.table, {
      // A name a link holds means the file the tree shows for it.
      resolveLink: (link, fromUri) => hierarchy.resolveLink(link, fromUri),
    });
    handle.on('navigate', ({ link, uri: resolved }) => void open(linkedUri(link, resolved, uri), linkedName(link)));
    current = { uri, doc, handle, table };
    shown.textContent = path.slice(ROOT.length + 1);
    const item = document.createElement('li');
    item.textContent = uri;
    log.prepend(item);
  }
  if (select) current?.handle.selectByName(select);
  // The tree shows the file the table shows.
  await tree.reveal(uri);
}

tree.on('open', (uri) => void open(uri));
