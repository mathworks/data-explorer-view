// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What connectShell builds in an empty <dex-app-shell>, and takes down again: the toolbar and the
// location bar in their rows, the Explorer (and the folder), the Gallery and Search in the left
// side, Settings and About on the left bar, the documents (the tab row and the panels) in the
// center, the Properties and Raw on the right, the Terminal and the Log in the bottom panel, the
// status text in the status bar; and the overlays every part shares, the command palette among
// them, put in the body once. dispose() takes all of it away, and every listener with it.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import { at, commandWindow, galleryPanel, open, rawViewer, searchPanel, serveFolderTo, settingsPanel, settled, startPage, tableOf, tempFolder, until } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

const OVERLAYS = [
  'dex-variable-editor',
  'dex-context-menu',
  'dex-error-dialog',
  'dex-confirm-dialog',
  'dex-toast-host',
  'dex-settings-panel',
  'dex-about-panel',
  'dex-command-palette',
];
const overlays = () => [...document.body.children].map((el) => el.localName).filter((name) => OVERLAYS.includes(name));

describe('connectShell', () => {
  it("fills the shell with the app's parts, each where it goes", () => {
    const page = startPage();
    const children = [...page.shell.children].map((el) => {
      const a = (name: string) => el.getAttribute(name);
      return [el.localName, el.slot || a('slot') || '', a('side') ?? '', a('view') ?? a('action') ?? ''].join(' ').trim();
    });
    expect(children).toEqual([
      'dex-toolbar toolbar',
      'dex-location-bar location',
      'dex-shell-view left left explorer',
      'dex-shell-view left left gallery',
      'dex-shell-view left left search',
      'dex-shell-action action left settings',
      'dex-shell-action action left about',
      'dex-shell-docs',
      'dex-shell-view right right properties',
      'dex-shell-view right right raw',
      'dex-shell-view bottom bottom terminal',
      'dex-shell-view bottom bottom log',
      'span status',
    ]);
    const content = (view: string) => [...page.shell.querySelector(`dex-shell-view[view="${view}"]`)!.children].map((el) => el.localName);
    expect(['gallery', 'search', 'raw', 'terminal', 'log'].map(content)).toEqual([
      ['dex-gallery-panel'],
      ['dex-search-panel'],
      ['dex-raw-viewer'],
      ['dex-command-window'],
      ['dex-log-panel'],
    ]);
    const props = page.shell.querySelector('dex-shell-view[view="properties"]')!;
    expect([...props.children].map((el) => el.localName)).toEqual(['dex-shell-note', 'dex-property-inspector']);
    expect(props.querySelector('.dex-inspector-empty')!.textContent).toBe('Select an entry to view its properties.');
    expect(page.shell.querySelector('dex-shell-action[action="settings"]')!.getAttribute('shortcut')).toBe('Mod+,');
    expect(page.shell.querySelector('dex-shell-action[action="about"]')!.getAttribute('icon')).toBe('info');
  });

  it('gives each view its label, its icon, which ships, and its chord, as the prototype laid them out', () => {
    const page = startPage();
    const shipped = new Set(readdirSync(join(process.cwd(), 'icons')).map((f) => f.replace(/\.svg$/, '')));
    const views = [...page.shell.querySelectorAll('dex-shell-view')].map((v) => [v.getAttribute('view'), v.getAttribute('label'), v.getAttribute('icon'), v.getAttribute('shortcut')]);
    expect(views).toEqual([
      ['explorer', 'Explorer', 'filesSB', 'Mod+Shift+E'],
      ['gallery', 'Gallery', 'gridUI', 'Mod+Shift+L'],
      ['search', 'Search', 'find', 'Mod+Shift+F'],
      ['properties', 'Properties', 'propertyInspectorSB', 'Mod+Shift+I'],
      ['raw', 'Raw', 'code', 'Mod+Shift+U'],
      ['terminal', 'Terminal', 'openTerminal', 'Ctrl+`'],
      ['log', 'Log', 'documentList', 'Mod+Shift+D'],
    ]);
    expect(views.filter(([, , icon]) => !shipped.has(icon!)).map(([, , icon]) => icon)).toEqual([]);
  });

  it("answers the chords a browser lets a page have: Raw's Cmd+Shift+U, the Terminal's literal Ctrl+` on macOS", async () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    try {
      const page = startPage();
      await settled();
      const shown = (side: 'right' | 'bottom') => (page.shell.layout[side].open ? page.shell.layout[side].view : null);
      const press = (init: KeyboardEventInit) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
      // Cmd+` switches a Mac's windows, and Cmd+Shift+W closes a Chromium window: neither is the shell's.
      press({ key: '`', code: 'Backquote', metaKey: true });
      press({ key: 'W', metaKey: true, shiftKey: true });
      await settled();
      expect([shown('right'), shown('bottom')]).toEqual(['properties', 'terminal']);
      press({ key: 'U', metaKey: true, shiftKey: true });
      press({ key: '`', code: 'Backquote', ctrlKey: true });
      await settled();
      expect([shown('right'), shown('bottom')]).toEqual(['raw', null]);
    } finally {
      Reflect.deleteProperty(navigator, 'platform');
    }
  });

  it('puts the shared overlays in the body once, and dispose() takes them, the parts and the documents away', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    expect(overlays().sort()).toEqual([...OVERLAYS].sort());
    await open(page, 'params.sldd', 'ParamMat.mat');
    const table = tableOf('params.sldd')!;
    page.handle.dispose();
    expect(overlays()).toEqual([]);
    expect(page.shell.children).toHaveLength(0);
    expect(table.isConnected).toBe(false);
    // The host is told of every file it had open, once.
    expect(page.main.closedFiles).toEqual([at('params.sldd'), at('ParamMat.mat')]);
    // Nothing answers any more: the keys, the handle's commands and opens, a change on disk.
    const reads = page.main.reads.length;
    page.main.picks.push([at('params.sldd')]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
    page.command('close-tab');
    page.command('open-file');
    void page.handle.openPaths([at('params.sldd')]);
    page.main.changed(at('params.sldd'));
    await settled();
    expect(page.main.reads.length).toBe(reads);
    expect(page.main.picks).toEqual([[at('params.sldd')]]);
    expect(page.main.closedFiles).toEqual([at('params.sldd'), at('ParamMat.mat')]);
    expect(page.shell.children).toHaveLength(0);
    // A second dispose is nothing.
    page.handle.dispose();
    expect(page.main.closedFiles).toHaveLength(2);
  });

  it("takes the modules' views down with it: none of them answers once it is disposed", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    const [terminal, search, gallery, raw, graph] = [commandWindow(), searchPanel(), galleryPanel(), rawViewer(), document.querySelector('dex-relationship-graph')!];
    const send = (el: Element, type: string, detail: object) => el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    const outputOf = () => terminal.shadowRoot!.querySelectorAll('.output .line').length;
    page.handle.dispose();
    const lines = outputOf();
    const reads = page.main.reads.length;
    send(terminal, 'dex-command-run', { line: 'ls' });
    send(search, 'dex-search-query', { query: 'Kp' });
    send(gallery, 'dex-gallery-add', { className: 'Simulink.Parameter', section: 'design', label: 'Parameter' });
    send(raw, 'dex-raw-copy', { text: 'x' });
    send(graph, 'dex-graph-open', { uri: `file://${at('params.sldd')}` });
    await settled();
    expect(outputOf()).toBe(lines);
    expect(search.results).toEqual([]);
    expect(page.main.copied).toEqual([]);
    expect(page.main.reads.length).toBe(reads);
  });

  it('a file still being read when the shell is taken down is told closed once, and opens nothing', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    const read = page.host.readFile;
    let release!: () => void;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => !!release);
    page.handle.dispose();
    expect(page.main.closedFiles).toEqual([at('params.sldd')]);
    release();
    await settled();
    expect(page.main.closedFiles).toEqual([at('params.sldd')]);
    expect(document.querySelectorAll('dex-tree-table')).toHaveLength(0);
  });

  it('a second shell in the same page has its own overlays and keeps to them', () => {
    startPage();
    const second = document.createElement('dex-app-shell');
    document.body.append(second);
    const handle = connectShell(second, { host: { pickFiles: async () => [], readFile: async () => new Uint8Array(), saveFile: async () => ({ overwritten: false }), saveFileAs: async () => null } });
    expect(document.querySelectorAll('dex-settings-panel')).toHaveLength(2);
    handle.dispose();
    expect(document.querySelectorAll('dex-settings-panel')).toHaveLength(1);
    expect(settingsPanel().isConnected).toBe(true);
  });

  it('draws no element defineShellWidgets, which is all the harness defines, leaves undefined', async () => {
    const dir = tempFolder('plant', { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    const page = startPage({ 'params.sldd': 'params.sldd', 'Plant.prj': 'params.sldd' });
    stop.push(serveFolderTo(page, dir).dispose);
    await page.handle.openPaths([at('params.sldd'), '/work/Plant.prj']);
    await until(() => !!tableOf('params.sldd')?.rows.length && !!document.querySelector('dex-project-page')?.shadowRoot);
    page.command('show-graph');
    page.command('palette');
    await settled();
    // Every element in the page and in every shadow root, as drawn.
    const tags = new Set<string>();
    const walk = (root: ParentNode): void => {
      for (const el of root.querySelectorAll('*')) {
        if (el.localName.startsWith('dex-')) tags.add(el.localName);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    expect(tags.size).toBeGreaterThan(25);
    expect([...tags].filter((tag) => !customElements.get(tag))).toEqual([]);
  });

  it('a project opens on its page, which asks for the folder it is in', async () => {
    const page = startPage({ 'Plant.prj': 'params.sldd' });
    void page.handle.openPaths(['/work/Plant.prj']);
    await until(() => !!document.querySelector<HTMLElement & { error?: string }>('.doc-panel dex-project-page')?.error);
    expect(document.querySelector<HTMLElement & { error?: string }>('.doc-panel dex-project-page')!.error).toBe('Open the folder this project is in to see its page.');
  });
});
