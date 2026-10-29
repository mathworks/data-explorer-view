// Copyright 2026 The MathWorks, Inc.
// The projects the project page shows: their stores read in the page (the fixture's XML files,
// bundled by Vite) and turned into the message `<dex-project-page>` draws (projectPageMessage), as
// an app does with a store it read.
import { projectPageMessage, type SetProjectMessage } from 'data-explorer-view/model';

const FIXTURES = '../../test/parity/artifacts/project/';
const STORES = import.meta.glob<string>('../../test/parity/artifacts/project/*/resources/project/**/*.xml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const PROJECTS = ['MyProj', 'LibProj'] as const;

/** The project's store as core's parser takes it: each file's text by its path from the root. */
function projectStore(name: string): Record<string, string> {
  const prefix = `${FIXTURES}${name}/`;
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(STORES)) {
    if (path.startsWith(prefix)) files[path.slice(prefix.length)] = text;
  }
  return files;
}

/** The message the project's page is drawn from. The folder it names is only the app's to know. */
export function projectMessage(name: string): SetProjectMessage {
  const root = `test/parity/artifacts/project/${name}`;
  return projectPageMessage(projectStore(name), `${root}/${name}.prj`, root);
}
