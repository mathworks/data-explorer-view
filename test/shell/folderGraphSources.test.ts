// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The folder's files for the relationship graph (connect/folder.ts, FolderView.graphSources), as
// the host serves them: each build lists the folder again (a file new or gone is in the next graph)
// and reads only the files whose version moved since the last build, the rest kept as they were
// read. A folder of hundreds of files is otherwise every file read on every change.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { portFromMessagePort } from '../../src/model/source/ports.js';
import { serveFolder, type FolderReads } from '../../src/serve/index.js';
import { showFolder, type FolderView } from '../../src/widgets/app-shell/connect/folder.js';
import { fixture, folderReads, tempFolder } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  document.body.replaceChildren();
});

/** `dir` shown in a tree, read across a channel, and the files the host read the bytes of. */
function shown(dir: string): { view: FolderView; read: string[] } {
  const read: string[] = [];
  const reads = folderReads(dir);
  const counting: FolderReads = {
    ...reads,
    reader: (files) => {
      const reader = reads.reader(files);
      return { ...reader, bytes: (file) => (read.push(path.basename(file.path)), reader.bytes(file)) };
    },
  };
  const { port1, port2 } = new MessageChannel();
  const served = serveFolder(counting, portFromMessagePort(port1));
  const tree = document.createElement('dex-hierarchy');
  document.body.append(tree);
  const view = showFolder(tree, dir, port2, { empty: () => {}, open: () => {}, error: () => {} });
  stop.push(() => (view.dispose(), served.dispose(), port1.close()));
  return { view, read };
}

const names = (sources: { path: string }[]) => sources.map((s) => path.basename(s.path)).sort();

/** Once the tree has read what it shows (the host reads files for it too), the reads are the graph's alone. */
async function quiet(read: string[]): Promise<void> {
  for (let still = 0; still < 3; ) {
    const before = read.length;
    await new Promise((r) => setTimeout(r, 20));
    still = read.length === before ? still + 1 : 0;
  }
  read.length = 0;
}

describe("the folder's files for the graph", () => {
  it('reads a file again only once its version moved, and lists the folder each time', async () => {
    const dir = tempFolder('plant', { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    const { view, read } = shown(dir);
    await quiet(read);
    expect(names(await view.graphSources())).toEqual(['params.sldd', 'shadow_ws.slx']);
    expect(read.sort()).toEqual(['params.sldd', 'shadow_ws.slx']);
    // Nothing changed: nothing read.
    read.length = 0;
    expect(names(await view.graphSources())).toEqual(['params.sldd', 'shadow_ws.slx']);
    expect(read).toEqual([]);
    // One file written, one new: those two are read, and the graph has the new one.
    writeFileSync(path.join(dir, 'params.sldd'), `\n\n\n\n${readFileSync(fixture('params.sldd'), 'utf8')}`);
    copyFileSync(fixture('shared_gain.slx'), path.join(dir, 'shared_gain.slx'));
    const third = await view.graphSources();
    expect(names(third)).toEqual(['params.sldd', 'shadow_ws.slx', 'shared_gain.slx']);
    expect(read.sort()).toEqual(['params.sldd', 'shared_gain.slx']);
    // The bytes it kept are the file's as read.
    const params = third.find((s) => s.path.endsWith('params.sldd'))!;
    expect(new TextDecoder().decode(params.bytes).startsWith('\n\n\n\n')).toBe(true);
  });
});
