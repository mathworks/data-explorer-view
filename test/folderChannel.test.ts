// Copyright 2026 The MathWorks, Inc.
//
// A folder across a message channel: serveFolder answering, where the files are, what
// folderReader asks for a hierarchy where they are not. Over a channel that structured-clones
// each message and delivers it in a task of its own (test/goldens/channel.ts), as a worker's does.
// The goldens (test/goldens/hierarchy.test.ts) hold the hierarchy across one to the hierarchy
// beside its reader; this holds the wire's own rules: what is read, what is refused, what fails,
// what is moved, and what stops.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import { nodeSourceReader, readProjectStoreFromDisk } from 'data-explorer-core/node';
import {
  FolderHierarchy,
  folderFileList,
  folderReader,
  sourceUri,
  type GraphReader,
  type TablePort,
} from '../src/model/index.js';
import { listedFiles, serveFolder, type FolderReads } from '../src/serve/index.js';
import { channel } from './goldens/channel.js';

const file = (name: string): SourceFile => ({ uriString: `file:///w/${name}`, path: `/w/${name}` });
const A = file('a.sldd');
const B = file('b.sldd');
const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (buffer: ArrayBuffer | null): string | null => (buffer ? new TextDecoder().decode(buffer) : null);
/**
 * Until `test` holds: for an answer that is on its way. Never a fixed wait, which a loaded machine
 * outruns; a test that something did NOT happen waits for an answer sent after it instead (a
 * channel delivers in order).
 */
const until = (test: () => boolean): Promise<void> => expect.poll(test, { timeout: 10_000, interval: 5 }).toBe(true);

/** What the host's reader was asked, by path. */
let read: string[] = [];
let listed: readonly SourceFile[] = [A, B];

function memoryFolder(contents: Record<string, ArrayBuffer>, overrides: Partial<GraphReader> = {}): FolderReads {
  return {
    files: { list: async () => listed },
    reader: (files) => {
      const known = new Set(files.map((f) => f.path));
      return {
        version: async (f) => (read.push(`version ${f.path}`), known.has(f.path) ? `v:${f.path}` : null),
        bytes: async (f) => (read.push(`bytes ${f.path}`), known.has(f.path) ? (contents[f.path] ?? null) : null),
        projectStore: async (f) => (read.push(`projectStore ${f.path}`), null),
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
    await until(() => heard.length === 1);
    stop();
    // A listener still listening hears the next change: the one let go of heard the same message.
    const still: string[] = [];
    reader.onChange(() => still.push('changed'));
    server.changed();
    await until(() => still.length === 1);
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
    const answered = new Set<unknown>();
    stops.push(page.onMessage((m) => void answered.add((m as { id?: unknown }).id)));
    const delivered: unknown[] = [];
    stops.push(host.onMessage((m) => void delivered.push(m)));
    // A table's messages, and a request with no id, are not the folder's. A list asked after them
    // is, and its answer, which would come after any of theirs, is the only one.
    page.postMessage({ type: 'ready' });
    page.postMessage({ type: 'folderRequest', ask: 'list' });
    page.postMessage({ type: 'folderRequest', id: 9_000, ask: 'list' });
    await until(() => answered.has(9_000));
    expect(sent).toEqual([{ type: 'folderAnswer', id: 9_000, value: [A, B] }]);
    sent.length = 0;

    const reader = folderReader(page);
    const waiting = reader.list();
    server.dispose();
    // Once the reader's question has reached the host's end, another host there answers a list
    // asked after it: an answer the disposed one still sent would have come first.
    await until(() => delivered.some((m) => (m as { id?: unknown }).id === 1));
    stops.push(serveFolder(memoryFolder({}), host).dispose);
    page.postMessage({ type: 'folderRequest', id: 9_001, ask: 'list' });
    await until(() => answered.has(9_001));
    expect(sent).toEqual([]);
    reader.dispose();
    await expect(waiting).rejects.toThrow('This folder reader is closed.');
    await expect(reader.version(A)).rejects.toThrow('This folder reader is closed.');
  });
});

describe('a listing cut short', () => {
  it('says so across the channel, and a listing of them all says nothing', async () => {
    listed = folderFileList([A], true);
    const { reader, page } = across(memoryFolder({}));
    const raw: Record<string, unknown>[] = [];
    stops.push(page.onMessage((m) => void raw.push(m as Record<string, unknown>)));
    const cut = await reader.list();
    expect([...cut]).toEqual([A]);
    expect(cut.truncated).toBe(true);
    // On the wire, beside the files: an array's own flag would not survive the clone.
    expect(raw.find((m) => m.type === 'folderAnswer')).toEqual({ type: 'folderAnswer', id: 1, value: [A], truncated: true });
    listed = [A, B];
    const all = await reader.list();
    expect(all.truncated).toBeUndefined();
    expect(raw.filter((m) => m.type === 'folderAnswer')[1]).toEqual({ type: 'folderAnswer', id: 2, value: [A, B] });
  });

  it("keeps core's listing's flag, each path under its sourceUri", () => {
    const cut = listedFiles({ files: ['/w/a.sldd', 'C:\\w\\b.sldd'], truncated: true });
    expect([...cut]).toEqual([A, { uriString: 'file:///c%3A/w/b.sldd', path: 'C:\\w\\b.sldd' }]);
    expect(cut.truncated).toBe(true);
    expect(listedFiles({ files: ['/w/a.sldd'], truncated: false }).truncated).toBeUndefined();
    expect(listedFiles({ files: [] }).truncated).toBeUndefined();
  });

  it('ends a hierarchy across the channel with a row that says only the first files are shown', async () => {
    listed = folderFileList([A, B], true);
    const { reader } = across(memoryFolder({}));
    const roots = await new FolderHierarchy({ files: reader, reader: () => reader }).roots();
    expect(roots.map((r) => [r.kind, r.label])).toEqual([
      ['group', 'w'],
      ['notice', 'Only the first 2 files are shown'],
    ]);
  });
});

describe('what changed', () => {
  async function hearing(uris?: readonly string[][]) {
    const { server, reader, page } = across(memoryFolder({}));
    const heard: { args: number; uris: readonly string[] | undefined }[] = [];
    reader.onChange((...args: (readonly string[] | undefined)[]) => void heard.push({ args: args.length, uris: args[0] }));
    const raw: unknown[] = [];
    stops.push(page.onMessage((m) => void raw.push(m)));
    for (const batch of uris ?? []) server.changed(batch);
    return { server, heard, raw };
  }

  it('carries the uris the host names, as it names them', async () => {
    const touched = Object.freeze([A.uriString, sourceUri('/w/my plant@corp.slx')]);
    const { heard, raw } = await hearing([touched]);
    await until(() => heard.length === 1);
    expect(heard).toEqual([{ args: 1, uris: [A.uriString, 'file:///w/my%20plant%40corp.slx'] }]);
    expect(raw).toEqual([{ type: 'folderChanged', uris: [A.uriString, 'file:///w/my%20plant%40corp.slx'] }]);
  });

  it('leaves them absent when the host names none: something changed', async () => {
    const { server, heard, raw } = await hearing();
    server.changed();
    await until(() => heard.length === 1);
    expect(heard).toEqual([{ args: 0, uris: undefined }]);
    expect(raw).toEqual([{ type: 'folderChanged' }]);
  });

  it('passes a burst through as it comes, one change a call, in order', async () => {
    const { server, heard } = await hearing([[A.uriString], [B.uriString], [A.uriString, B.uriString]]);
    server.changed();
    server.changed([]);
    await until(() => heard.length === 5);
    expect(heard.map((h) => h.uris)).toEqual([[A.uriString], [B.uriString], [A.uriString, B.uriString], undefined, []]);
  });

  it('reads uris that are not a list of strings as none: something changed', async () => {
    const [host, page] = channel();
    const reader = folderReader(page);
    stops.push(() => reader.dispose());
    const heard: (readonly string[] | undefined)[] = [];
    reader.onChange((uris) => void heard.push(uris));
    host.postMessage({ type: 'folderChanged', uris: 'file:///w/a.sldd' });
    host.postMessage({ type: 'folderChanged', uris: [A.uriString, 7, null] });
    await until(() => heard.length === 2);
    expect(heard).toEqual([undefined, [A.uriString]]);
  });
});

describe('look-alikes of a listed file', () => {
  // A folder holding only /w/a.sldd, listed. Each uri below names it in some other spelling, or
  // names something else; none may be normalised into it. Each is answered null, and nothing is read.
  const LOOK_ALIKES: [string, string][] = [
    ['a `..` segment', 'file:///w/../w/a.sldd'],
    ['a `.` segment', 'file:///w/./a.sldd'],
    ['an absolute path outside the folder', 'file:///etc/passwd'],
    ['the path in place of the uri', '/w/a.sldd'],
    ['the scheme in capitals', 'FILE:///w/a.sldd'],
    ['a query', 'file:///w/a.sldd?x'],
    ['a fragment', 'file:///w/a.sldd#x'],
    ['a percent-encoded dot', 'file:///w/a%2Esldd'],
    ['a trailing slash', 'file:///w/a.sldd/'],
    ['a trailing space', 'file:///w/a.sldd '],
    ['vscode-file:', 'vscode-file://vscode-app/w/a.sldd'],
    ['http:', 'http://localhost/w/a.sldd'],
    ['data:', 'data:,A'],
  ];

  async function listedA() {
    listed = [A];
    const { reader, page } = across(memoryFolder({ '/w/a.sldd': bytes('A') }));
    expect(await reader.list()).toEqual([A]);
    read = [];
    return { reader, page };
  }

  it.each(LOOK_ALIKES)('%s (%s): null for bytes, version and projectStore, and nothing read', async (_why, uriString) => {
    const { reader } = await listedA();
    const crafted: SourceFile = { uriString, path: A.path };
    expect(await reader.bytes(crafted)).toBeNull();
    expect(await reader.version(crafted)).toBeNull();
    expect(await reader.projectStore(crafted)).toBeNull();
    expect(read).toEqual([]);
  });

  /** What the host answers a request posted raw on the page's port, by its id. */
  function rawAnswers(page: TablePort) {
    const answers = new Map<number, Record<string, unknown>>();
    stops.push(
      page.onMessage((m) => {
        const a = m as Record<string, unknown>;
        if (a?.type === 'folderAnswer' && typeof a.id === 'number' && a.id >= 10_000) answers.set(a.id, a);
      }),
    );
    return answers;
  }

  it.each([
    ['no uri', {}],
    ['a number', { uri: 42 }],
    ['an object', { uri: {} }],
  ])('a raw request with %s for a uri is refused, and nothing read', async (_why, uri) => {
    const { page } = await listedA();
    const answers = rawAnswers(page);
    for (const [i, ask] of ['bytes', 'version', 'projectStore'].entries()) {
      page.postMessage({ type: 'folderRequest', id: 10_000 + i, ask, ...uri });
    }
    // Then a question that is answered by a read: by its answer, theirs have all been handled.
    page.postMessage({ type: 'folderRequest', id: 10_003, ask: 'bytes', uri: A.uriString });
    await until(() => answers.has(10_003));
    for (const i of [0, 1, 2]) {
      expect(answers.get(10_000 + i)).toEqual({ type: 'folderAnswer', id: 10_000 + i, refused: 'Not a file of the folder.' });
    }
    expect(read).toEqual(['bytes /w/a.sldd']);
  });

  it.each(['list2', 'constructor', '__proto__'])('an ask the wire does not have (%s) is answered with no value, and nothing read', async (ask) => {
    const { page } = await listedA();
    const answers = rawAnswers(page);
    page.postMessage({ type: 'folderRequest', id: 10_000, ask, uri: A.uriString });
    page.postMessage({ type: 'folderRequest', id: 10_001, ask: 'bytes', uri: A.uriString });
    await until(() => answers.has(10_001));
    // Refused rather than left unanswered, so a page that sent it is not left waiting: no value
    // either way. The only read is the question after it.
    expect(answers.get(10_000)).toEqual({ type: 'folderAnswer', id: 10_000, refused: 'Not a file of the folder.' });
    expect(read).toEqual(['bytes /w/a.sldd']);
  });
});

describe('the boundary: the host reads only the files it listed', () => {
  // A folder on disk read by core's own reader, which trusts the SourceFile it is handed (it reads
  // its `path`): only the boundary keeps the page from naming what it reads. One file is listed;
  // the others named below exist beside it, or are other spellings of it.
  const FIXTURES = resolve(import.meta.dirname, '../test-integration/fixtures');
  const LISTED = join(FIXTURES, 'workspace/data.sldd');
  const LISTED_URI = sourceUri(LISTED);
  const DIR_URI = sourceUri(join(FIXTURES, 'workspace'));
  const CRAFTED: [string, unknown][] = [
    ['a file beside it the folder did not list', sourceUri(join(FIXTURES, 'workspace/params.sldd'))],
    ['an absolute path outside the folder', sourceUri('/etc/passwd')],
    ['a `..` out of the folder', `${DIR_URI}/../usageorder/sharedParams.sldd`],
    ['a `..` after the listed file', `${LISTED_URI}/../params.sldd`],
    ['a `..` percent-encoded', `${DIR_URI}/%2E%2E/usageorder/sharedParams.sldd`],
    ['a prefix that looks like the folder', `${DIR_URI}-evil/data.sldd`],
    ['the listed name with more after it', `${LISTED_URI}.bak`],
    ['another scheme', LISTED_URI.replace(/^file:/, 'vscode-file:')],
    ['a source id prefix', `binedit:${LISTED_URI}`],
    ['the scheme in capitals', LISTED_URI.replace(/^file:/, 'FILE:')],
    ['the name in another case', LISTED_URI.replace(/data\.sldd$/, 'Data.sldd')],
    ['the listed path, not its uri', LISTED],
    ['no uri', undefined],
    ['a uri that is not a string', 42],
  ];

  let calls: string[] = [];
  function onDisk(): FolderReads {
    return {
      files: { list: async () => [{ uriString: LISTED_URI, path: LISTED }] },
      reader: (files) => {
        const core = nodeSourceReader(files);
        return {
          version: (f) => (calls.push(`version ${f.path}`), core.version(f)),
          bytes: (f) => (calls.push(`bytes ${f.path}`), core.bytes(f)),
          projectStore: (f) => (calls.push(`projectStore ${f.path}`), readProjectStoreFromDisk(f.path)),
        };
      },
    };
  }

  /** The page's end, writing its own requests: what a page that is not folderReader can send. */
  function crafting() {
    const [host, page] = channel();
    const server = serveFolder(onDisk(), host);
    const answers = new Map<number, Record<string, unknown>>();
    const unlisten = page.onMessage((m) => {
      const a = m as Record<string, unknown>;
      if (a?.type === 'folderAnswer' && typeof a.id === 'number') answers.set(a.id, a);
    });
    stops.push(() => (server.dispose(), unlisten()));
    let lastId = 0;
    return async (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const id = ++lastId;
      page.postMessage({ type: 'folderRequest', id, ...request });
      await until(() => answers.has(id));
      return answers.get(id)!;
    };
  }
  afterEach(() => {
    calls = [];
  });

  it('refuses every question about a file it did not list, before the folder is listed and after, and reads nothing', async () => {
    const ask = crafting();
    for (const listed of [false, true]) {
      if (listed) expect((await ask({ ask: 'list' })).value).toEqual([{ uriString: LISTED_URI, path: LISTED }]);
      for (const [why, uri] of CRAFTED) {
        for (const what of ['version', 'bytes', 'projectStore']) {
          const answer = await ask({ ask: what, ...(uri === undefined ? {} : { uri }) });
          expect(answer, `${what}: ${why}`).toEqual({ type: 'folderAnswer', id: answer.id, refused: 'Not a file of the folder.' });
        }
      }
    }
    expect(calls).toEqual([]);
  });

  it('refuses a question the wire does not have', async () => {
    const ask = crafting();
    await ask({ ask: 'list' });
    for (const what of ['readFile', 'stat', '__proto__', 7]) {
      expect((await ask({ ask: what, uri: LISTED_URI })).refused, String(what)).toBe('Not a file of the folder.');
    }
    expect(calls).toEqual([]);
  });

  it('reads a listed file at the path it listed, whatever path the page sends with it', async () => {
    const ask = crafting();
    await ask({ ask: 'list' });
    const answer = await ask({ ask: 'bytes', uri: LISTED_URI, path: '/etc/passwd', file: { uriString: LISTED_URI, path: '/etc/passwd' } });
    expect(new Uint8Array(answer.value as ArrayBuffer)).toEqual(new Uint8Array(readFileSync(LISTED)));
    expect(calls).toEqual([`bytes ${LISTED}`]);
  });

  it("answers the page's reader null for a refused file, as a reader answers for one it was not given", async () => {
    const [host, page] = channel();
    const server = serveFolder(onDisk(), host);
    const reader = folderReader(page);
    stops.push(() => (server.dispose(), reader.dispose()));
    await reader.list();
    const outside = join(FIXTURES, 'workspace/params.sldd');
    expect(await reader.bytes({ uriString: sourceUri(outside), path: outside })).toBeNull();
    expect(await reader.version({ uriString: `${DIR_URI}/../workspace/params.sldd`, path: outside })).toBeNull();
    expect(await reader.projectStore({ uriString: sourceUri('/etc/passwd'), path: '/etc/passwd' })).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('the host end', () => {
  it('imports nothing at run time, so a main process that bundles it bundles nothing else', () => {
    // dist/, as an app installs it (built before the tests, by `npm run verify`).
    const built = readFileSync(resolve(import.meta.dirname, '../dist/model/source/serveFolder.js'), 'utf8');
    expect(built.match(/^\s*import\b.*$/gm) ?? []).toEqual([]);
  });
});
