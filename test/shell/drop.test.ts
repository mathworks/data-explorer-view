// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Files dragged from the OS onto the page (connect/drop.ts, lifted from data-explorer-app's
// dropOpen, whose cases these are): handed to the host as they were dropped, files and folders
// alike, while a drag that carries no files is left to the widgets (a table's own row drag). And
// what the lift added: any element can be the target, and the listeners can be taken away.
import { afterEach, describe, expect, it } from 'vitest';
import { installFileDrop } from '../../src/widgets/app-shell/connect/drop.js';
import { DexShellDocs } from '../../src/widgets/app-shell/connect/dex-shell-docs.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import type { ShellHost } from '../../src/widgets/app-shell/connect/types.js';
import { docsArea, settled, startPage, until } from './harness.js';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.body.replaceChildren();
  document.body.className = '';
});

/** A drag event carrying files, as one from the OS does. */
function fileDrag(type: string, names: string[], relatedTarget: EventTarget | null = null): Event {
  const files = names.map((n) => new File(['x'], n));
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
  Object.defineProperty(e, 'relatedTarget', { value: relatedTarget });
  return e;
}

const names = (data: DataTransfer) => Array.from(data.files).map((f) => f.name);

describe('files dropped onto the window', () => {
  it('go to the host as they were dropped, files and folders alike', () => {
    const dropped: string[][] = [];
    stops.push(installFileDrop(window, (data) => dropped.push(names(data))));
    const over = fileDrag('dragover', ['plant.sldd']);
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('drop-target')).toBe(true);
    window.dispatchEvent(fileDrag('drop', ['plant.sldd', 'project', 'run.mat']));
    expect(dropped).toEqual([['plant.sldd', 'project', 'run.mat']]);
    expect(document.body.classList.contains('drop-target')).toBe(false);
  });

  it('leave a drag that carries no files to the widgets', () => {
    const opened: DataTransfer[] = [];
    stops.push(installFileDrop(window, (data) => opened.push(data)));
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['text/plain'], files: [] } });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(opened).toEqual([]);
  });

  it('a drag that leaves the window takes the mark away', () => {
    stops.push(installFileDrop(window, () => {}));
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    window.dispatchEvent(fileDrag('dragleave', ['plant.sldd']));
    expect(document.body.classList.contains('drop-target')).toBe(false);
  });
});

describe('files dropped onto an element', () => {
  it('are heard there, before its children see the drag, and mark it while a drag is over it', () => {
    const zone = document.createElement('div');
    const child = document.createElement('span');
    zone.append(child);
    document.body.append(zone);
    const dropped: string[][] = [];
    let childSaw = false;
    child.addEventListener('drop', () => (childSaw = true));
    stops.push(installFileDrop(zone, (data) => dropped.push(names(data))));
    child.dispatchEvent(fileDrag('dragover', ['a.sldd']));
    expect(zone.classList.contains('drop-target')).toBe(true);
    // Between its own children, the mark stays; out of it, it goes.
    child.dispatchEvent(fileDrag('dragleave', ['a.sldd'], zone));
    expect(zone.classList.contains('drop-target')).toBe(true);
    zone.dispatchEvent(fileDrag('dragleave', ['a.sldd'], document.body));
    expect(zone.classList.contains('drop-target')).toBe(false);
    child.dispatchEvent(fileDrag('drop', ['a.sldd']));
    expect(dropped).toEqual([['a.sldd']]);
    expect(childSaw).toBe(false);
  });

  it('are not heard once the listeners are taken away', () => {
    const zone = document.createElement('div');
    document.body.append(zone);
    const dropped: string[][] = [];
    const stop = installFileDrop(zone, (data) => dropped.push(names(data)));
    zone.dispatchEvent(fileDrag('dragover', ['a.sldd']));
    stop();
    expect(zone.classList.contains('drop-target')).toBe(false);
    const e = fileDrag('drop', ['a.sldd']);
    zone.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(dropped).toEqual([]);
  });
});

describe("the shell's documents, while files are dragged over the page", () => {
  // installFileDrop marks the element the files will be dropped on (the body, for the window), and
  // a page's stylesheet was to draw the mark: the shell's page has none, so nothing showed where the
  // files would go. The documents' area draws it now, while any element from it up to the page is
  // marked, and only then: a page that installs no drop opens nothing dropped, and shows no cue.
  const cssOf = (styles: unknown): string =>
    [styles]
      .flat(Infinity)
      .map((sheet) => (sheet as { cssText: string }).cssText)
      .join('\n')
      .replace(/\s+/g, ' ');

  it('are outlined while a drag of files is over the window, and not once it leaves or drops', async () => {
    startPage();
    stops.push(installFileDrop(window, () => {}));
    expect(docsArea().dropping).toBe(false);
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    await until(() => docsArea().dropping);
    expect(docsArea().hasAttribute('dropping')).toBe(true);
    window.dispatchEvent(fileDrag('dragleave', ['plant.sldd']));
    await until(() => !docsArea().dropping);
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    await until(() => docsArea().dropping);
    window.dispatchEvent(fileDrag('drop', ['plant.sldd']));
    await until(() => !docsArea().dropping);
    // A dashed outline in the accent, over the panels and the welcome, which takes no pointer.
    const css = cssOf(DexShellDocs.styles);
    const cue = /:host\(\[dropping\]\) \.panels::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(cue).toContain('border: 2px dashed var(--dex-color-accent, #0078d4);');
    expect(cue).toContain('pointer-events: none;');
    expect(css).toMatch(/@media \(forced-colors: active\) \{ :host\(\[dropping\]\) \.panels::after \{ border-color: Highlight;/);
  });

  it('follow a drop installed on the shell, or on an element around it', async () => {
    const page = startPage();
    stops.push(installFileDrop(page.shell, () => {}));
    page.shell.dispatchEvent(fileDrag('dragover', ['a.sldd']));
    await until(() => docsArea().dropping);
    page.shell.dispatchEvent(fileDrag('dragleave', ['a.sldd'], document.body));
    await until(() => !docsArea().dropping);
  });

  it('follow a shell connected before it was put in the page, and one inside a shadow root', async () => {
    // The elements around the documents were read once, as the shell was connected: a shell not in
    // the page yet had none of the page's, and one in a shadow root stopped at that root.
    const host: ShellHost = {
      pickFiles: async () => [],
      readFile: async () => new Uint8Array(),
      saveFile: async () => ({ overwritten: false }),
      saveFileAs: async () => null,
    };
    stops.push(installFileDrop(window, () => {}));
    const early = document.createElement('dex-app-shell');
    const handle = connectShell(early, { host });
    stops.push(() => handle.dispose());
    document.body.append(early);
    const docs = early.querySelector('dex-shell-docs')!;
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    await until(() => docs.dropping);
    window.dispatchEvent(fileDrag('dragleave', ['plant.sldd']));
    await until(() => !docs.dropping);
    handle.dispose();

    const outer = document.body.appendChild(document.createElement('div'));
    const shadowed = document.createElement('dex-app-shell');
    outer.attachShadow({ mode: 'open' }).append(shadowed);
    const inner = connectShell(shadowed, { host });
    stops.push(() => inner.dispose());
    const docsInside = shadowed.querySelector('dex-shell-docs')!;
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    await until(() => docsInside.dropping);
    window.dispatchEvent(fileDrag('drop', ['plant.sldd']));
    await until(() => !docsInside.dropping);
  });

  it('show nothing for a page that installs no drop, and stop following once the shell is taken down', async () => {
    const page = startPage();
    window.dispatchEvent(fileDrag('dragover', ['plant.sldd']));
    await settled();
    expect(docsArea().dropping).toBe(false);
    const docs = docsArea();
    page.handle.dispose();
    document.body.classList.add('drop-target');
    await settled();
    expect(docs.dropping).toBe(false);
  });
});
