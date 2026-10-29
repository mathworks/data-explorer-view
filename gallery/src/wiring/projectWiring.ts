// Copyright 2026 The MathWorks, Inc.
// A project's page: its project store read in the page (the fixture's XML files, bundled by
// Vite), parsed by core, and drawn by view's renderer. The renderer returns HTML; the
// container, the section filters, Show all and the links are the app's, as in the VS Code
// extension's project-main.ts.
//
// Hand wiring, until view's project page is an element (see ../../README.md).
import { buildProjectPage, parseProject, projectFallbackName } from 'data-explorer-core';
import {
  newSectionState,
  PROJECT_PAGE_CSS,
  renderProjectPage,
  type PageState,
  type ProjectPagePayload,
} from 'data-explorer-view/project-page';

const FIXTURES = '../../../test/parity/artifacts/project/';
const STORES = import.meta.glob<string>('../../../test/parity/artifacts/project/*/resources/project/**/*.xml', {
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

export function projectPayload(name: string): ProjectPagePayload {
  // The folder the page names under the project's title: only the app knows it.
  const root = `test/parity/artifacts/project/${name}`;
  const parsed = parseProject(projectStore(name), projectFallbackName(`${root}/${name}.prj`));
  return { page: buildProjectPage(parsed), root };
}

export interface ProjectPageHandle {
  show(payload: ProjectPagePayload): void;
}

/** Draws pages into `container`; `open` gets the root-relative path of a link the user follows. */
export function wireProjectPage(container: HTMLElement, open: (path: string) => void): ProjectPageHandle {
  // A constructed sheet: a Content-Security-Policy without 'unsafe-inline' refuses a <style>.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PROJECT_PAGE_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  container.classList.add('dex-page');

  // Each section's filter and Show all, kept across repaints and reset for another project.
  let state: PageState = {};
  let payload: ProjectPagePayload | null = null;
  const section = (id: string) => (state[id] ??= newSectionState());
  const repaint = () => {
    if (payload) container.innerHTML = renderProjectPage(payload, state);
  };

  // Delegated: every repaint replaces the page's elements.
  container.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.classList.contains('filter') ? input.dataset.section : undefined;
    if (!id) return;
    const caret = [input.selectionStart, input.selectionEnd] as const;
    section(id).query = input.value;
    repaint();
    // The repaint replaced the input: give the new one the focus and the caret.
    const again = container.querySelector<HTMLInputElement>(`input.filter[data-section="${id}"]`);
    again?.focus();
    if (caret[0] !== null) again?.setSelectionRange(caret[0], caret[1] ?? caret[0]);
  });

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('[data-open]');
    if (link?.dataset.open) {
      open(link.dataset.open);
      return;
    }
    const expand = target.closest<HTMLElement>('[data-expand]')?.dataset.expand;
    if (expand) {
      section(expand).expanded = true;
      repaint();
    }
  });

  // The links are <a role="button"> with no href: Enter and Space are this page's to answer.
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (!link?.dataset.open) return;
    e.preventDefault();
    open(link.dataset.open);
  });

  return {
    show(next) {
      if (payload?.root !== next.root) state = {};
      payload = next;
      repaint();
    },
  };
}
