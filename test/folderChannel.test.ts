// Copyright 2026 The MathWorks, Inc.
//
// A folder across a message channel: serveFolder answering, where the files are, what
// folderReader asks for a hierarchy where they are not. Over a channel that structured-clones
// each message and delivers it in a task of its own (test/goldens/channel.ts), as a worker's does.
// The goldens (test/goldens/hierarchy.test.ts) hold the hierarchy across one to the hierarchy
// beside its reader; this holds the wire's own rules: what is read, what is refused, what fails,
// what is moved, and what stops.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import {
  FolderHierarchy,
  folderReader,
  serveFolder,
  type FolderReads,
  type GraphReader,
  type TablePort,
} from '../src/model/index.js';
import { channel } from './goldens/channel.js';

const file = (name: string): SourceFile => ({ uriString: `file:///w/${name}`, path: `/w/${name}` });
const A = file('a.sldd');
const B = file('b.sldd');
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (buffer: ArrayBuffer | null): string | null => (buffer ? new TextDecoder().decode(buffer) : null);
const tick = () => new Promise((done) => setTimeout(done, 5));

/** What the host's reader was asked, by path. */
let read: string[] = [];
let listed: SourceFile[] = [A, B];

function memoryFolder(contents: Record<string, ArrayBuffer>, overrides: Partial<GraphReader> = {}): FolderReads {
  return {
    files: { list: async () => listed },
    reader: (files) => {
      const known = new Set(files.map((f) => f.path));
      return {
        version: async (f) => (read.push(`version ${f.path}`), known.has(f.path) ? `v:${f.path}` : null),
        bytes: async (f) => (read.push(`bytes ${f.path}`), known.has(f.path) ? (contents[f.path] ?? null) : null),
        projectStore: async () => null,
        ...overrides,
      };
    },
  };
}

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  read = [];
  listed = [A, B];
});

function across(folder: FolderReads, options: { transfer?: boolean } = {}) {
  const [host, page] = channel();
  const server = serveFolder(folder, host, options);
  const reader = folderReader(page);
  stops.push(() => (server.dispose(), reader.dispose()));
  return { server, reader, host, page };
}

describe('a folder across a channel', () => {
  it('lists the folder and reads its files through the host', async () => {
    const { reader } = across(memoryFolder({ '/w/a.sldd': bytes('A'), '/w/b.sldd': bytes('B') }));
    expect(await reader.list()).toEqual([A, B]);
    expect(await reader.version(A)).toBe('v:/w/a.sldd');
    expect(text(await reader.bytes(B))).toBe('B');
    expect(await reader.projectStore(A)).toBeNull();
  });

  it('matches each answer to its question, in whatever order the reads finish', async () => {
    let releaseA!: () => void;
    const slowA = new Promise<void>((done) => (releaseA = done));
    const contents: Record<string, ArrayBuffer> = { '/w/a.sldd': bytes('A'), '/w/b.sldd': bytes('B') };
    const { reader } = across(
      memoryFolder(contents, {
        bytes: async (f) => {
          if (f.path === A.path) await slowA;
          return contents[f.path] ?? null;
        },
      }),
    );
    await reader.list();
    const first = reader.bytes(A);
    const second = reader.bytes(B);
    expect(text(await second)).toBe('B');
    releaseA();
    expect(text(await first)).toBe('A');
  });

  it('reads only the files the host listed, at the paths the host listed them', async () => {
    const { reader } = across(memoryFolder({ '/w/a.sldd': bytes('A') }));
    // Before any listing, nothing is the folder's.
    expect(await reader.bytes(A)).toBeNull();
    await reader.list();
    // A file the listing does not hold, and a listed uri sent with another path.
    expect(await reader.bytes(file('secret.sldd'))).toBeNull();
    expect(text(await reader.bytes({ uriString: A.uriString, path: '/etc/passwd' }))).toBe('A');
    expect(read).toEqual(['bytes /w/a.sldd']);
  });

  it('keeps the latest listing, whichever answers last', async () => {
    let releaseFirst!: () => void;
    const held = new Promise<void>((done) => (releaseFirst = done));
    let lists = 0;
    const folder: FolderReads = {
      files: {
        list: async () => {
          const n = ++lists;
          if (n === 1) {
            await held;
            return [A];
          }
          return [B];
        },
      },
      reader: (files) => ({
        version: async (f) => (files.some((g) => g.uriString === f.uriString) ? 'v' : null),
        bytes: async () => null,
        projectStore: async () => null,
      }),
    };
    const { reader } = across(folder);
    const first = reader.list();
    expect(await reader.list()).toEqual([B]);
    releaseFirst();
    expect(await first).toEqual([A]);
    // The later listing is the folder: B is in it, A is not.
    expect(await reader.version(B)).toBe('v');
    expect(await reader.version(A)).toBeNull();
  });

  it("rejects with the host's message when its listing or its reader throws", async () => {
    const { reader } = across(
      memoryFolder({}, {
        version: async () => {
          throw new Error('EACCES: permission denied');
        },
      }),
    );
    await reader.list();
    await expect(reader.version(A)).rejects.toThrow('EACCES: permission denied');
    const failing = across({
      files: {
        list: async () => {
          throw new Error('the folder is gone');
        },
      },
      reader: () => {
        throw new Error('never asked');
      },
    });
    await expect(failing.reader.list()).rejects.toThrow('the folder is gone');
    // A hierarchy over it fails with the same message, for connectHierarchy's `error`.
    const hierarchy = new FolderHierarchy({ files: failing.reader, reader: () => failing.reader });
    await expect(hierarchy.roots()).rejects.toThrow('the folder is gone');
  });

  it("tells the page's listeners when the host says the folder changed", async () => {
    const { server, reader } = across(memoryFolder({}));
    const heard: string[] = [];
    const stop = reader.onChange(() => heard.push('changed'));
    server.changed();
    await tick();
    expect(heard).toEqual(['changed']);
    stop();
    server.changed();
    await tick();
    expect(heard).toEqual(['changed']);
  });

  it('moves the bytes with `transfer`, and copies them without', async () => {
    for (const transfer of [false, true]) {
      const buffer = bytes('moved');
      const { reader } = across(memoryFolder({ '/w/a.sldd': buffer }), { transfer });
      await reader.list();
      expect(text(await reader.bytes(A))).toBe('moved');
      // Moved: the host's buffer is detached. Copied: it is the host's still.
      expect(buffer.byteLength, `transfer ${transfer}`).toBe(transfer ? 0 : 5);
    }
  });

  it('reads an answer in the shape a reader can use, or as a file it cannot read', async () => {
    // A host that is not serveFolder: it answers what its own channel gives it.
    const [host, page] = channel();
    const answers: Record<string, unknown> = {
      list: [A, { uriString: 3 }, B],
      version: 42,
      bytes: new Uint8Array([0, 65, 66, 0]).subarray(1, 3),
      projectStore: { 'resources/project/a.xml': '<a/>', 'b.xml': 7, ['__proto__']: '<p/>' },
    };
    const unlisten = host.onMessage((m) => {
      const { id, ask } = m as { id: number; ask: string };
      host.postMessage({ type: 'folderAnswer', id, value: answers[ask] });
    });
    const reader = folderReader(page);
    stops.push(() => (unlisten(), reader.dispose()));
    expect(await reader.list()).toEqual([A, B]);
    expect(await reader.version(A)).toBeNull();
    expect(text(await reader.bytes(A))).toBe('AB');
    const store = await reader.projectStore(A);
    expect(Object.keys(store!)).toEqual(['resources/project/a.xml', '__proto__']);
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    answers.list = 'not a list';
    await expect(reader.list()).rejects.toThrow("The folder's host sent no list of its files.");
  });

  it('leaves alone what is not its own, and hears nothing once disposed', async () => {
    const [host, page] = channel();
    const sent: unknown[] = [];
    const recording: TablePort = { postMessage: (m) => (sent.push(m), host.postMessage(m)), onMessage: (l) => host.onMessage(l) };
    const server = serveFolder(memoryFolder({}), recording);
    // A table's messages, and a request with no id, are not the folder's.
    page.postMessage({ type: 'ready' });
    page.postMessage({ type: 'folderRequest', ask: 'list' });
    await tick();
    expect(sent).toEqual([]);

    const reader = folderReader(page);
    const waiting = reader.list();
    server.dispose();
    await tick();
    expect(sent).toEqual([]);
    reader.dispose();
    await expect(waiting).rejects.toThrow('This folder reader is closed.');
    await expect(reader.version(A)).rejects.toThrow('This folder reader is closed.');
  });
});

describe('the host end', () => {
  it('imports nothing at run time, so a main process that bundles it bundles nothing else', () => {
    // dist/, as an app installs it (built before the tests, by `npm run verify`).
    const built = readFileSync(resolve(import.meta.dirname, '../dist/model/source/serveFolder.js'), 'utf8');
    expect(built.match(/^\s*import\b.*$/gm) ?? []).toEqual([]);
  });
});
