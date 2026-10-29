// Copyright 2026 The MathWorks, Inc.
// A folder's hierarchy: the integration suite's workspace, its files read in the page by a
// FolderHierarchy over core's source cache, and drawn by <dex-hierarchy> through
// connectHierarchy. A chosen file is listed, where an app would open it. The checkbox marks a
// file as having unsaved changes (refresh() redraws the mark); the button reads the folder again
// (rebuild()).
import { connectHierarchy, defineHierarchy, type DexHierarchy } from 'data-explorer-view/hierarchy';
import { folderHierarchy, uriOf, WORKSPACE } from '../folders';
import { byId, startPage } from '../shell';

startPage();
defineHierarchy();

const dirty = new Set<string>();
const hierarchy = folderHierarchy(WORKSPACE, (uri) => dirty.has(uri));
const handle = connectHierarchy(byId<DexHierarchy>('tree'), hierarchy);

const log = byId('event-log');
handle.on('open', (uri) => {
  const item = document.createElement('li');
  item.textContent = uri;
  log.prepend(item);
});

const data = uriOf(`${WORKSPACE.path}/data.sldd`);
byId<HTMLInputElement>('dirty').addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).checked) dirty.add(data);
  else dirty.delete(data);
  hierarchy.refresh();
});
byId('rebuild').addEventListener('click', () => hierarchy.rebuild());
