// Copyright 2026 The MathWorks, Inc.
// The app shell, as a team's web app hosts it with no backend: an empty <dex-app-shell>, filled by
// connectShell over the browser's own host (data-explorer-view/browser-host), every element it
// draws defined by defineShellWidgets. The gallery's files open in tabs as files the user picked
// would (host.files.addPicked, then the shell's openPaths), and a folder of models and the
// dictionaries they share is shown in the Explorer, served in this page by the host, as a folder
// the user picked or dropped is (host.openFolder). A file or a folder dropped on the window opens
// too. The theme is the shell's own: its Settings, kept in the page's storage with its layout.
// About says what the app is built on, view's version (VIEW_VERSION) under a heading of its own.
//
// The page has no gallery header: the window is the app's, and the app's title is the page's.
import 'data-explorer-view/theme.css';
import { useIconAssets } from 'data-explorer-view/icon-assets';
import { connectShell, defineShellWidgets, installFileDrop, type DexAppShell } from 'data-explorer-view/app-shell';
import { browserHost, type ListedFile } from 'data-explorer-view/browser-host';
import { VIEW_VERSION } from 'data-explorer-view/model';
import ctrlA from '../../../test-integration/fixtures/usageorder/ctrlA.slx?url';
import plantB from '../../../test-integration/fixtures/usageorder/plantB.slx?url';
import sharedParams from '../../../test-integration/fixtures/usageorder/sharedParams.sldd?url';
import workspaceData from '../../../test-integration/fixtures/workspace/data.sldd?url';
import workspaceModel from '../../../test-integration/fixtures/workspace/model.slx?url';
import workspaceParams from '../../../test-integration/fixtures/workspace/params.sldd?url';
import { FIXTURES } from '../fixtures';
import '../app.css';

// The folder the Explorer shows: the two models of usageorder and the dictionary they share, and
// the integration suite's workspace (a model, the dictionary it links, and one it does not).
const FOLDER: Readonly<Record<string, string>> = {
  'data/sharedParams.sldd': sharedParams,
  'models/ctrlA.slx': ctrlA,
  'models/plantB.slx': plantB,
  'workspace/data.sldd': workspaceData,
  'workspace/model.slx': workspaceModel,
  'workspace/params.sldd': workspaceParams,
};

async function bytesOf(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

// Before the first icon renders: every <dex-icon> then draws from the files Vite copied.
useIconAssets();
defineShellWidgets();

const shell = document.querySelector<DexAppShell>('dex-app-shell')!;
const host = browserHost({
  onFolder: (root, port) => app.showFolder(root, port),
  onChanged: (path) => app.fileChanged(path),
});
const app = connectShell(shell, {
  host,
  appName: 'Data Explorer',
  storageKey: 'gallery-app',
  about: [{ label: 'data-explorer-view', value: VIEW_VERSION, section: 'Built on' }],
});
installFileDrop(window, async (data) => app.openPaths(await host.openDropped(data)));
addEventListener('beforeunload', (e) => {
  if (!host.edited) return;
  e.preventDefault();
  e.returnValue = ''; // what older browsers ask on
});

/**
 * The folder shown, then the gallery's files open, the last one active: the text dictionary, so
 * the page shows a file's rows first, not the banner of a model kept for viewing only.
 */
async function start(): Promise<void> {
  const files: ListedFile[] = await Promise.all(
    Object.entries(FOLDER).map(async ([rel, url]) => ({ rel, file: new File([await bytesOf(url)], rel.slice(rel.lastIndexOf('/') + 1)) })),
  );
  await host.openFolder({ kind: 'list', root: 'plant', files });
  const opened = [...FIXTURES].reverse();
  const paths = await Promise.all(opened.map(async (f) => host.files.addPicked(f.name, { kind: 'bytes', bytes: await bytesOf(f.url) })));
  await app.openPaths(paths);
}

// Said in the console, which the gallery's tests fail on.
start().catch((err: unknown) => console.error(err));
