// Copyright 2026 The MathWorks, Inc.
// A project's page: core reads the project store in the page, view renders it. A link to a
// file is the app's to open; here it is listed, and a referenced project the gallery has is
// shown.
import { byId, labelled, startPage } from '../shell';
import { projectPayload, PROJECTS, wireProjectPage } from '../wiring/projectWiring';

startPage();

const log = byId('event-log');
const select = document.createElement('select');
for (const name of PROJECTS) select.append(new Option(name, name));

const page = wireProjectPage(byId('project'), (path) => {
  const item = document.createElement('li');
  item.textContent = path;
  log.prepend(item);
  const name = path.split('/').filter(Boolean).pop();
  if (PROJECTS.some((p) => p === name)) show(name!);
});

function show(name: string): void {
  select.value = name;
  page.show(projectPayload(name));
}

select.addEventListener('change', () => show(select.value));
byId('toolbar').append(labelled('Project', 'project-picker', select));
show(PROJECTS[0]);
