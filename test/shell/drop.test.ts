// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Files dragged from the OS onto the page (connect/drop.ts, lifted from data-explorer-app's
// dropOpen, whose cases these are): handed to the host as they were dropped, files and folders
// alike, while a drag that carries no files is left to the widgets (a table's own row drag). And
// what the lift added: any element can be the target, and the listeners can be taken away.
import { afterEach, describe, expect, it } from 'vitest';
import { installFileDrop } from '../../src/widgets/app-shell/connect/drop.js';

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
