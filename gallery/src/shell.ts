// Copyright 2026 The MathWorks, Inc.
// What every page of the gallery shares: view's theme tokens, the icons as assets of this
// bundle, the gallery's own chrome, and the header with the page list and the theme switch.
// Its first lines, and the useIconAssets() call in startPage, are what view's README has an app
// write once.
import 'data-explorer-view/theme.css';
import { useIconAssets } from 'data-explorer-view/icon-assets';
import './gallery.css';

export type Theme = 'light' | 'dark' | 'high-contrast';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'high-contrast', label: 'High contrast' },
];

export const PAGES = [
  { file: 'tree-table.html', title: 'Tree table', about: 'A dictionary (text and zip), a MAT-file and a model, each in a table.' },
  { file: 'property-inspector.html', title: 'Property inspector', about: 'The properties of the entry picked from a list.' },
  { file: 'variable-editor.html', title: 'Variable editor', about: 'The cells of a matrix, a 3-D array and a 4-D one.' },
  { file: 'context-menu.html', title: 'Context menu', about: 'A menu of items with icons, shortcuts and a disabled item.' },
  { file: 'error-dialog.html', title: 'Error dialog', about: 'An error, and a refused edit with Revert.' },
  { file: 'project-page.html', title: 'Project page', about: "A MATLAB project's page, rendered from its project store." },
  { file: 'hierarchy.html', title: 'Hierarchy', about: 'A folder: its files, and the files each one references.' },
  { file: 'composed.html', title: 'Composed', about: 'Folder, table, inspector and variable editor together, as an app wires them.' },
  { file: 'folder.html', title: 'Served folder', about: 'A folder read across a channel, beside a table: links and the tree agree.' },
];

const STORAGE_KEY = 'dex-gallery-theme';

function isTheme(value: unknown): value is Theme {
  return THEMES.some((t) => t.id === value);
}

/** `?theme=` first (a link can name one), then the last one picked, then light. */
function initialTheme(): Theme {
  const asked = new URLSearchParams(location.search).get('theme');
  if (isTheme(asked)) return asked;
  const kept = localStorage.getItem(STORAGE_KEY);
  return isTheme(kept) ? kept : 'light';
}

/** view's theme.css reads `data-theme` on <html>; light is its default set. */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

function header(current: string, theme: Theme): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'bar';

  const home = document.createElement('a');
  home.className = 'home';
  home.href = './index.html';
  home.textContent = 'data-explorer-view';
  bar.append(home);

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Gallery pages');
  for (const page of PAGES) {
    const link = document.createElement('a');
    link.href = `./${page.file}`;
    link.textContent = page.title;
    if (page.file === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  bar.append(nav);

  const select = document.createElement('select');
  for (const t of THEMES) select.append(new Option(t.label, t.id, false, t.id === theme));
  select.addEventListener('change', () => {
    if (isTheme(select.value)) applyTheme(select.value);
  });
  bar.append(labelled('Theme', 'theme', select));
  return bar;
}

/** Sets the page up: icons, theme and header. */
export function startPage(): void {
  // Before the first icon renders: every <dex-icon> then draws from the files Vite copied.
  useIconAssets();
  const theme = initialTheme();
  applyTheme(theme);
  const current = location.pathname.split('/').pop() || 'index.html';
  document.body.prepend(header(current, theme));
}

/** `control` after a <label> naming it: the label's text alone is the control's name. */
export function labelled(text: string, id: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = text;
  control.id = id;
  wrap.append(label, control);
  return wrap;
}

/** The element with this id, or a throw naming it: the page's HTML and its script go together. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`the page has no #${id}`);
  return el as T;
}

/** The widgets' events, by the names their modules declare on HTMLElementEventMap. */
type DexEvent = Extract<keyof HTMLElementEventMap, `dex-${string}`>;

// An element in a detail (the matrix glyph's anchorEl, for one) as its tag, so the log says
// what was there without serialising the DOM.
function describe(_key: string, value: unknown): unknown {
  return value instanceof Element ? `<${value.localName}>` : value;
}

/**
 * Lists every event named in `names` that reaches `target`, newest first, with its detail: what
 * a widget tells the app, which is all an app has to listen to.
 */
export function logEvents(target: HTMLElement, names: readonly DexEvent[], log: HTMLElement): void {
  for (const name of names) {
    target.addEventListener(name, (e) => {
      const item = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = name;
      item.append(code);
      const { detail } = e;
      if (detail !== null) item.append(` ${JSON.stringify(detail, describe)}`);
      log.prepend(item);
      while (log.childElementCount > 20) log.lastElementChild?.remove();
    });
  }
}
