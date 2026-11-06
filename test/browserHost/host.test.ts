// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The browser's ShellHost (src/browser/host.ts): each member connectShell calls goes to the piece
// that does it (picks, reads, saves, the watcher, the served folder), what the host leaves out it
// leaves out (the native prompts, a folder without `onFolder`), a shown folder is looked at again
// when the page comes back, no more than once every LOOK_EVERY_MS and without a change going
// untold, and a drop opens its files and shows its folder. Ported from data-explorer-app
// test/unit/web/host.test.ts, where it was `webHost`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderReader, portFromMessagePort, sourceUri } from '../../src/model/index.js';
import type { FilePickers } from '../../src/browser/fsAccess.js';
import { browserHost, LOOK_EVERY_MS, type BrowserHost, type BrowserHostOptions } from '../../src/browser/host.js';
import { POLL_MS } from '../../src/browser/watch.js';
import { aborted, asDir, asFile, dataTransferOf, entryOf, fakeDir, FakeEntry, FakeFileHandle, fileOf, listedDir } from './fakeFs.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const bytesOf = (s: string) => new TextEncoder().encode(s);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
// Taken before any test fakes the timers: a wait that lets the folder's channel deliver.
const realSetTimeout = globalThis.setTimeout;
const settle = (ms = 20) => new Promise((r) => realSetTimeout(r, ms));

/** Show or hide the page, as the browser does when its tab is switched to or away from. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  stop.push(() => delete (document as { visibilityState?: unknown }).visibilityState);
  document.dispatchEvent(new Event('visibilitychange'));
}

function hostOf(pickers: FilePickers = {}, more: Partial<BrowserHostOptions> = {}) {
  // The window's events, and its pickers.
  const window = Object.assign(new EventTarget(), pickers);
  const folders: { root: string; port: MessagePort }[] = [];
  const changed: string[] = [];
  const writeText = vi.fn(async (_: string) => undefined);
  const host: BrowserHost = browserHost({
    window,
    document,
    navigator: { clipboard: { writeText } },
    onFolder: (root, port) => {
      folders.push({ root, port });
      stop.push(() => port.close());
    },
    onChanged: (p) => changed.push(p),
    ...more,
  });
  stop.push(() => host.dispose());
  return { files: host.files, host, folders, changed, writeText, window };
}

/** What a page reads of the folder served on `port`: its listing's paths. */
async function listed(port: MessagePort): Promise<string[]> {
  const reader = folderReader(portFromMessagePort(port));
  stop.push(() => reader.dispose());
  return (await reader.list()).map((f) => f.path);
}

describe('browserHost', () => {
  it('picks files through the window\'s picker', async () => {
    const a = new FakeFileHandle('a.sldd', 'one');
    const { host } = hostOf({ showOpenFilePicker: async () => [asFile(a)] });
    expect(await host.pickFiles()).toEqual(['/files/1/a.sldd']);
    expect(text(await host.readFile('/files/1/a.sldd'))).toBe('one');
  });

  it('takes the page\'s own window, document and navigator when given none', async () => {
    const a = new FakeFileHandle('a.sldd', 'one');
    const page = window as unknown as FilePickers;
    page.showOpenFilePicker = async () => [asFile(a)];
    stop.push(() => delete page.showOpenFilePicker);
    const host = browserHost();
    stop.push(() => host.dispose());
    expect(await host.pickFiles()).toEqual(['/files/1/a.sldd']);
    host.setTitle!('plant.sldd — Data Explorer');
    expect(document.title).toBe('plant.sldd — Data Explorer');
  });

  it('serves a picked folder and hands its port to the page, as a desktop main process does', async () => {
    const proj = fakeDir('proj', { 'a.sldd': '', 'sub/b.slx': '' });
    const { host, files, folders } = hostOf({ showDirectoryPicker: async () => asDir(proj) });
    await host.pickFolder!();
    expect(folders.map((f) => f.root)).toEqual(['/proj']);
    expect(await listed(folders[0].port)).toEqual(['/proj/a.sldd', '/proj/sub/b.slx']);
    expect(files.has('/proj/sub/b.slx')).toBe(true);
  });

  it('shows nothing for a cancelled folder pick, and a folder of a name shown before apart from it', async () => {
    let answer: () => Promise<FileSystemDirectoryHandle> = async () => Promise.reject(aborted());
    const { host, folders } = hostOf({ showDirectoryPicker: () => answer() });
    await host.pickFolder!();
    expect(folders).toEqual([]);
    answer = async () => asDir(fakeDir('proj', { 'a.sldd': '' }));
    await host.pickFolder!();
    await host.openFolder(listedDir('proj', { 'b.sldd': '' }));
    expect(folders.map((f) => f.root)).toEqual(['/proj', '/proj (2)']);
    expect(await listed(folders[1].port)).toEqual(['/proj (2)/b.sldd']);
  });

  it('without onFolder shows no folder: no pickFolder, so the shell offers no Folder button', async () => {
    const { host } = hostOf({ showDirectoryPicker: async () => asDir(fakeDir('proj')) }, { onFolder: undefined });
    expect(host.pickFolder).toBeUndefined();
    await expect(host.openFolder(listedDir('proj', { 'a.sldd': '' }))).resolves.toBeUndefined();
  });

  it('reads a data file it has, and refuses any other', async () => {
    const { host, files } = hostOf();
    const path = await files.addPicked('a.sldd', { kind: 'bytes', bytes: bytesOf('held') });
    const notes = await files.addPicked('notes.txt', { kind: 'bytes', bytes: bytesOf('text') });
    expect(text(await host.readFile(path))).toBe('held');
    await expect(host.readFile(notes)).rejects.toThrow('Not a data file this app opens.');
    await expect(host.readFile('/files/9/gone.sldd')).rejects.toThrow(/ENOENT/);
  });

  it('watches a file it read until it is closed, and takes its own saves for no change', async () => {
    vi.useFakeTimers();
    const handle = new FakeFileHandle('a.sldd', 'one');
    const { host, files, changed } = hostOf();
    const path = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(handle) });
    await host.readFile(path);
    expect(await host.saveFile(path, bytesOf('saved'))).toEqual({ overwritten: false });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([]);
    handle.writeOutside('from outside');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([path]);
    host.closeFile!(path);
    handle.writeOutside('again');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([path]);
  });

  it('without onChanged watches nothing', async () => {
    vi.useFakeTimers();
    const handle = new FakeFileHandle('a.sldd', 'one');
    const getFile = vi.spyOn(handle, 'getFile');
    const { host, files } = hostOf({}, { onChanged: undefined });
    const path = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(handle) });
    await host.readFile(path);
    const reads = getFile.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(getFile.mock.calls.length).toBe(reads);
  });

  it('saves in place and saves as through save.ts', async () => {
    vi.useFakeTimers();
    const handle = new FakeFileHandle('a.sldd', 'one');
    const copy = new FakeFileHandle('b.sldd');
    const { host, files, changed } = hostOf({ showSaveFilePicker: async () => asFile(copy) });
    const path = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(handle) });
    await host.readFile(path);
    await host.saveFile(path, bytesOf('two'));
    expect(text(handle.bytes)).toBe('two');
    expect(await host.saveFileAs(path, bytesOf('three'))).toEqual({ path: '/files/2/b.sldd', overwritten: false });
    expect(text(copy.bytes)).toBe('three');
    // A copy written elsewhere is no change to the open file.
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([]);
    const blocked = await files.addPicked('c.sldd', { kind: 'bytes', bytes: bytesOf('held') });
    await expect(host.saveFile(blocked, bytesOf('x'))).rejects.toThrow(/Use Save As/);
  });

  it('looks at the shown folder again when the page is shown or its window focused, at most once every LOOK_EVERY_MS', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const proj = fakeDir('proj', { 'a.sldd': '', 'b.sldd': 'one' });
    const { host, folders, window } = hostOf();
    await host.openFolder({ kind: 'handle', handle: asDir(proj) });
    const reader = folderReader(portFromMessagePort(folders[0].port));
    stop.push(() => reader.dispose());
    const heard: (readonly string[] | undefined)[] = [];
    reader.onChange((uris) => heard.push(uris));
    await reader.list();

    // Focused just after the folder was first looked at: the look waits for the rest of the time.
    proj.file('b.sldd').writeOutside('two');
    proj.add('c.sldd');
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(heard).toEqual([]);
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    await settle();
    expect(heard).toEqual([['/proj/b.sldd', '/proj/c.sldd'].map(sourceUri)]);

    // Nothing changed since: nothing to tell.
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(heard).toHaveLength(1);

    // Hidden, it does not look; shown again, it does.
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    setVisibility('hidden');
    proj.remove('a.sldd');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    await settle();
    expect(heard).toHaveLength(1);
    setVisibility('visible');
    await settle();
    expect(heard).toEqual([['/proj/b.sldd', '/proj/c.sldd'].map(sourceUri), [sourceUri('/proj/a.sldd')]]);

    // Disposed, it no longer listens.
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    host.dispose();
    proj.add('d.sldd');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(LOOK_EVERY_MS);
    await settle();
    expect(heard).toHaveLength(2);
  });

  it('opens a drop\'s files as one pick and shows its first folder, the drop read before anything is awaited', async () => {
    const { host, folders } = hostOf();
    const a = new FakeFileHandle('a.sldd', 'one');
    const b = new FakeFileHandle('b.slx', 'model');
    const proj = fakeDir('proj', { 'c.sldd': '' });
    const { data, state } = dataTransferOf([{ handle: a }, { handle: b }, { handle: proj }, { handle: fakeDir('other') }]);
    const opened = host.openDropped(data);
    // The drop's listener has returned: the browser's drag data store is closed.
    state.live = false;
    expect(await opened).toEqual(['/files/1/a.sldd', '/files/1/b.slx']);
    expect(folders.map((f) => f.root)).toEqual(['/proj']);
    expect(await listed(folders[0].port)).toEqual(['/proj/c.sldd']);
    // The same file dropped again goes to the tab it has.
    expect(await host.openDropped(dataTransferOf([{ handle: a.again() }]).data)).toEqual(['/files/1/a.sldd']);
  });

  it('opens a drop from Firefox or Safari by its entries: a folder listed as it was dropped', async () => {
    const { host, folders, files } = hostOf();
    const plant = fileOf('plant.sldd', 'one');
    // A file's entry is not a folder's: its File is what reads it.
    const { data } = dataTransferOf(
      [{ entry: new FakeEntry('plant.sldd', 'one'), file: plant }, { entry: entryOf('proj', { 'x.sldd': '', 'sub/y.slx': '' }) }],
      { handles: false },
    );
    expect(await host.openDropped(data)).toEqual(['/files/1/plant.sldd']);
    expect(files.get('/files/1/plant.sldd')?.source).toEqual({ kind: 'file', file: plant });
    expect(await listed(folders[0].port)).toEqual(['/proj/sub/y.slx', '/proj/x.sldd']);
  });

  it('opens a drop\'s files without waiting for its folder to be looked at', async () => {
    const { host, folders } = hostOf();
    const proj = fakeDir('proj', { 'c.sldd': '' });
    // The folder's first look lists it, and its listing waits here until let go.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const values = proj.values.bind(proj);
    proj.values = async function* () {
      await gate;
      yield* values();
    };
    const a = new FakeFileHandle('a.sldd');
    expect(await host.openDropped(dataTransferOf([{ handle: a }, { handle: proj }]).data)).toEqual(['/files/1/a.sldd']);
    expect(folders.map((f) => f.root)).toEqual(['/proj']);
    release();
    expect(await listed(folders[0].port)).toEqual(['/proj/c.sldd']);
  });

  it('gives an app the files it may add to and ask about, and nothing of the rest', async () => {
    const { host } = hostOf();
    expect(Object.keys(host.files).sort()).toEqual(['addPicked', 'addToGroup', 'get', 'has']);
    const path = await host.files.addPicked('a.sldd', { kind: 'bytes', bytes: bytesOf('fetched') });
    expect(host.files.has(path)).toBe(true);
    expect(host.files.get(path)?.name).toBe('a.sldd');
    expect(text(await host.readFile(path))).toBe('fetched');
  });

  it("adds an app's files to a group it names, one folder whenever each comes, the paths to open", async () => {
    const { host } = hostOf();
    const first = await host.files.addToGroup('site', [{ name: 'plant.slx', source: { kind: 'bytes', bytes: bytesOf('model') } }]);
    const later = await host.files.addToGroup('site', [{ name: 'plant.sldd', source: { kind: 'bytes', bytes: bytesOf('dictionary') } }]);
    expect([first, later]).toEqual([['/files/1/plant.slx'], ['/files/1/plant.sldd']]);
    expect(text(await host.readFile(later[0]!))).toBe('dictionary');
  });

  it("tells a file the group's newer one replaced as a change on disk, if it is open, and once", async () => {
    vi.useFakeTimers();
    const { host, changed } = hostOf();
    const [open] = await host.files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'handle', handle: asFile(new FakeFileHandle('a.sldd', 'one')) } }]);
    const [shut] = await host.files.addToGroup('site', [{ name: 'b.sldd', source: { kind: 'bytes', bytes: bytesOf('one') } }]);
    await host.readFile(open!);
    await host.files.addToGroup('site', [
      { name: 'a.sldd', source: { kind: 'handle', handle: asFile(new FakeFileHandle('a.sldd', 'two')) } },
      { name: 'b.sldd', source: { kind: 'bytes', bytes: bytesOf('two') } },
    ]);
    // The open one is told; the other, which no tab reads, is read anew when it is opened.
    expect(changed).toEqual([open]);
    expect(text(await host.readFile(open!))).toBe('two');
    expect(text(await host.readFile(shut!))).toBe('two');
    // Known by the new file's stamp: the next look finds no change to tell again.
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(changed).toEqual([open]);
  });

  it('tells nothing of an open file added to its group again as it was, as a second press of a Samples button does', async () => {
    const { host, changed } = hostOf();
    const fetched = () => [{ name: 'a.sldd', source: { kind: 'bytes' as const, bytes: bytesOf('same') } }];
    const [path] = await host.files.addToGroup('site', fetched());
    await host.readFile(path!);
    expect(await host.files.addToGroup('site', fetched())).toEqual([path]);
    expect(changed).toEqual([]);
  });

  it('without onChanged replaces a file in a group and tells nothing', async () => {
    const { host } = hostOf({}, { onChanged: undefined });
    const [path] = await host.files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('one') } }]);
    await host.readFile(path!);
    expect(await host.files.addToGroup('site', [{ name: 'a.sldd', source: { kind: 'bytes', bytes: bytesOf('two') } }])).toEqual([path]);
    expect(text(await host.readFile(path!))).toBe('two');
  });

  it('passes over a dropped folder without onFolder', async () => {
    const { host } = hostOf({}, { onFolder: undefined });
    expect(await host.openDropped(dataTransferOf([{ handle: fakeDir('proj', { 'a.sldd': '' }) }]).data)).toEqual([]);
  });

  it('sets the page\'s title', () => {
    const { host } = hostOf();
    host.setTitle!('● plant.sldd — Data Explorer');
    expect(document.title).toBe('● plant.sldd — Data Explorer');
  });

  it('asks nothing itself: the shell asks about unsaved edits and changes in its own dialog', () => {
    const { host } = hostOf();
    expect(host.confirmClose).toBeUndefined();
    expect(host.confirmReload).toBeUndefined();
    expect(host.reveal).toBeUndefined();
  });

  it('keeps what the shell says of unsaved edits, for beforeunload', () => {
    const { host } = hostOf();
    expect(host.edited).toBe(false);
    host.setEdited!(true);
    expect(host.edited).toBe(true);
    host.setEdited!(false);
    expect(host.edited).toBe(false);
  });

  it('copies text to the clipboard, and says when the browser gives it none', async () => {
    const { host, writeText } = hostOf();
    await host.copyText!('Kp');
    expect(writeText).toHaveBeenCalledWith('Kp');
    const bare = hostOf({}, { navigator: {} }).host;
    await expect(bare.copyText!('Kp')).rejects.toThrow(/no clipboard/);
  });

  it('stops serving a folder once another is shown, or once it is disposed', async () => {
    const { host, folders } = hostOf();
    const unanswered = (port: MessagePort) => Promise.race([listed(port), settle(100).then(() => 'unanswered')]);
    await host.openFolder({ kind: 'handle', handle: asDir(fakeDir('one', { 'a.sldd': '' })) });
    await host.openFolder({ kind: 'handle', handle: asDir(fakeDir('two', { 'b.sldd': '' })) });
    expect(await unanswered(folders[0].port)).toBe('unanswered');
    host.dispose();
    expect(await unanswered(folders[1].port)).toBe('unanswered');
  });

  it('stops watching once disposed', async () => {
    vi.useFakeTimers();
    const handle = new FakeFileHandle('a.sldd', 'one');
    const { host, files, changed } = hostOf();
    const path = await files.addPicked('a.sldd', { kind: 'handle', handle: asFile(handle) });
    await host.readFile(path);
    host.dispose();
    handle.writeOutside('two');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changed).toEqual([]);
  });
});
