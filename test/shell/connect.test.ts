// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What connectShell builds in an empty <dex-app-shell>, and takes down again: the toolbar and the
// location bar in their rows, the Explorer and the folder in the left side, Settings and About on
// the left bar, the documents (the tab row and the panels) in the center, the Properties on the
// right, the status text in the status bar; and the overlays every part shares, put in the body
// once. dispose() takes all of it away, and every listener with it.
import { describe, expect, it } from 'vitest';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import { at, open, settingsPanel, settled, startPage, tableOf, until } from './harness.js';

const OVERLAYS = ['dex-variable-editor', 'dex-context-menu', 'dex-error-dialog', 'dex-confirm-dialog', 'dex-toast-host', 'dex-settings-panel', 'dex-about-panel'];
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
      'dex-shell-action action left settings',
      'dex-shell-action action left about',
      'dex-shell-docs',
      'dex-shell-view right right properties',
      'span status',
    ]);
    const props = page.shell.querySelector('dex-shell-view[view="properties"]')!;
    expect([...props.children].map((el) => el.localName)).toEqual(['dex-shell-note', 'dex-property-inspector']);
    expect(props.querySelector('.dex-inspector-empty')!.textContent).toBe('Select an entry to view its properties.');
    expect(page.shell.querySelector('dex-shell-action[action="settings"]')!.getAttribute('shortcut')).toBe('Mod+,');
    expect(page.shell.querySelector('dex-shell-action[action="about"]')!.getAttribute('icon')).toBe('info');
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

  it('a project opens on its page, which asks for the folder it is in', async () => {
    const page = startPage({ 'Plant.prj': 'params.sldd' });
    void page.handle.openPaths(['/work/Plant.prj']);
    await until(() => !!document.querySelector<HTMLElement & { error?: string }>('.doc-panel dex-project-page')?.error);
    expect(document.querySelector<HTMLElement & { error?: string }>('.doc-panel dex-project-page')!.error).toBe('Open the folder this project is in to see its page.');
  });
});
