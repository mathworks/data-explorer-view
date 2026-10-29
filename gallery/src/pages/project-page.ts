// Copyright 2026 The MathWorks, Inc.
// A project's page: core reads the project store in the page, and <dex-project-page> draws the
// message projectPageMessage builds from it. A link to a file is the app's to open; here it is
// listed, and a referenced project the gallery has is shown.
import { defineProjectPage, type DexProjectPage } from 'data-explorer-view/project-page';
import { projectMessage, PROJECTS } from '../projects';
import { byId, labelled, startPage } from '../shell';

startPage();
defineProjectPage();

const log = byId('event-log');
const page = byId<DexProjectPage>('project');
const select = document.createElement('select');
for (const name of PROJECTS) select.append(new Option(name, name));

page.addEventListener('dex-project-open', (e) => {
  const { path } = e.detail;
  const item = document.createElement('li');
  item.textContent = path;
  log.prepend(item);
  const name = path.split('/').filter(Boolean).pop();
  if (PROJECTS.some((p) => p === name)) show(name!);
});

function show(name: string): void {
  select.value = name;
  page.payload = projectMessage(name);
}

select.addEventListener('change', () => show(select.value));
byId('toolbar').append(labelled('Project', 'project-picker', select));
show(PROJECTS[0]);
