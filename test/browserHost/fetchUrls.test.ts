// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The browser host opening files from web addresses (src/browser/host.ts: fetchUrls, fetchUrl,
// files.urlOf, and linkFor passed on). A page's link names its files by address (`?url=`), and
// Open from URL takes one typed; the host fetches each under urls.ts's rules and adds it to the
// group of its address's folder, so a model and the dictionary beside it in one repo folder link
// to each other, as files picked together do. Each address is fetched once, whichever way it is
// spelled; one that failed is tried again; the answers keep the addresses' order, with a line for
// each that did not open, for the page to tell. And what the page did not ask for it does not get:
// no Open from URL without `openFromUrl`, no Copy Link without `linkFor`. No test here touches the
// network: the fetch is a fake answering from a map.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserHost, type BrowserHost, type BrowserHostOptions } from '../../src/browser/host.js';
import type { ShellLink, ShellLinkRequest } from '../../src/widgets/app-shell/connect/types.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop.splice(0)) s();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const bytesOf = (s: string) => new TextEncoder().encode(s);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const BLOB = 'https://github.com/acme/plant/blob/main/models';
const RAW = 'https://raw.githubusercontent.com/acme/plant/main/models';

/**
 * A host whose fetch answers `served` (URL fetched → the file's text), 404 for any other, and
 * records each URL it was asked for.
 */
function hostOf(served: Record<string, string> = {}, more: Partial<BrowserHostOptions> = {}) {
  const asked: string[] = [];
  const fetch = vi.fn(async (url: string, _init: RequestInit) => {
    asked.push(url);
    const body = served[url];
    return body === undefined ? new Response('', { status: 404, statusText: 'Not Found' }) : new Response(bytesOf(body));
  });
  const host: BrowserHost = browserHost({
    window: new EventTarget(),
    document,
    navigator: {},
    fetch,
    origin: 'https://dex.example',
    ...more,
  });
  stop.push(() => host.dispose());
  return { host, asked, fetch };
}

/** A path's folder: `/files/<n>/`. */
const folderOf = (path: string | null) => path?.slice(0, path.lastIndexOf('/') + 1);

describe('browserHost.fetchUrls', () => {
  it("opens a repo folder's files side by side, each read as fetched", async () => {
    const { host } = hostOf({ [`${RAW}/EngineCtrl.slx`]: 'model', [`${RAW}/EngineCalibration.sldd`]: 'dictionary' });
    const { paths, problems } = await host.fetchUrls([`${BLOB}/EngineCtrl.slx`, `${BLOB}/EngineCalibration.sldd`]);
    expect(problems).toEqual([]);
    expect(paths).toEqual(['/files/1/EngineCtrl.slx', '/files/1/EngineCalibration.sldd']);
    expect(text(await host.readFile(paths[0]!))).toBe('model');
    expect(text(await host.readFile(paths[1]!))).toBe('dictionary');
  });

  it('keeps the files of two folders, or of two hosts, in two folders', async () => {
    const { host } = hostOf({
      'https://files.example/x/a.sldd': 'x',
      'https://files.example/y/a.sldd': 'y',
      'https://other.example/x/b.sldd': 'b',
    });
    const { paths } = await host.fetchUrls(['https://files.example/x/a.sldd', 'https://files.example/y/a.sldd', 'https://other.example/x/b.sldd']);
    expect(new Set(paths.map(folderOf)).size).toBe(3);
    expect(await Promise.all(paths.map(async (p) => text(await host.readFile(p!))))).toEqual(['x', 'y', 'b']);
  });

  it('answers in the order asked, a null and a line for each address that did not open', async () => {
    const { host } = hostOf({ 'https://files.example/a.sldd': 'a', 'https://files.example/b.sldd': 'b' });
    const { paths, problems } = await host.fetchUrls([
      'https://files.example/a.sldd',
      'http://other.example/a.sldd',
      'https://files.example/none.sldd',
      'https://files.example/b.sldd',
    ]);
    expect(paths).toEqual(['/files/1/a.sldd', null, null, '/files/1/b.sldd']);
    expect(problems).toEqual([
      'http://other.example/a.sldd is not an https: address.',
      'https://files.example/none.sldd could not be fetched: 404 Not Found',
    ]);
  });

  it('fetches an address once, however it is spelled and however often it is asked for', async () => {
    const { host, asked } = hostOf({ [`${RAW}/a.sldd`]: 'a' });
    const spellings = [`${BLOB}/a.sldd`, `${BLOB}/a.sldd`, 'https://github.com/acme/plant/raw/main/models/a.sldd', `${RAW}/a.sldd`];
    const [first, second] = await Promise.all([host.fetchUrls(spellings), host.fetchUrls([`${BLOB}/a.sldd`])]);
    expect(asked).toEqual([`${RAW}/a.sldd`]);
    expect(first.paths).toEqual(Array(4).fill('/files/1/a.sldd'));
    expect(second.paths).toEqual(['/files/1/a.sldd']);
    // Asked again later: the path it has, with no fetch.
    expect((await host.fetchUrls([`${RAW}/a.sldd`])).paths).toEqual(['/files/1/a.sldd']);
    expect(asked).toHaveLength(1);
  });

  it('fetches an address that failed afresh when it is asked for again', async () => {
    const served: Record<string, string> = {};
    const { host, asked } = hostOf(served);
    expect((await host.fetchUrls(['https://files.example/a.sldd'])).paths).toEqual([null]);
    served['https://files.example/a.sldd'] = 'there now';
    const { paths, problems } = await host.fetchUrls(['https://files.example/a.sldd']);
    expect(problems).toEqual([]);
    expect(text(await host.readFile(paths[0]!))).toBe('there now');
    expect(asked).toHaveLength(2);
  });

  it('says which address each file was fetched from, as it was first given, and none for a picked file', async () => {
    const { host } = hostOf({ [`${RAW}/a.sldd`]: 'a' });
    const { paths } = await host.fetchUrls([`${BLOB}/a.sldd#L1`, `${RAW}/a.sldd`]);
    expect(host.files.urlOf(paths[0]!)).toBe(`${BLOB}/a.sldd#L1`);
    await host.fetchUrls([`${RAW}/a.sldd`]);
    expect(host.files.urlOf(paths[0]!)).toBe(`${BLOB}/a.sldd#L1`);
    const picked = await host.files.addPicked('b.sldd', { kind: 'bytes', bytes: bytesOf('b') });
    expect(host.files.urlOf(picked)).toBeUndefined();
  });

  it("downloads a fetched file's Save: the page holds its bytes, with nothing to write them through", async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:saved');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { host } = hostOf({ 'https://files.example/a.sldd': 'a' });
    const [path] = (await host.fetchUrls(['https://files.example/a.sldd'])).paths;
    await host.readFile(path!);
    expect(await host.saveFile(path!, bytesOf('edited'))).toEqual({ overwritten: false, downloaded: true });
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(text(await host.readFile(path!))).toBe('edited');
  });

  it('fetches from an http: address on the page\'s own origin, which is location.origin by default', async () => {
    const own = hostOf({ 'http://localhost:4319/s/a.sldd': 'a' }, { origin: 'http://localhost:4319' });
    expect((await own.host.fetchUrls(['http://localhost:4319/s/a.sldd'])).problems).toEqual([]);
    const page = `${location.origin}/s/a.sldd`;
    expect(page.startsWith('http:')).toBe(true);
    const byDefault = hostOf({ [page]: 'a' }, { origin: undefined });
    expect((await byDefault.host.fetchUrls([page])).problems).toEqual([]);
    expect(byDefault.asked).toEqual([page]);
  });

  it('says the browser is offline when it says so', async () => {
    const fetch = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    const { host } = hostOf({}, { fetch, navigator: { onLine: false } });
    expect((await host.fetchUrls(['https://files.example/a.sldd'])).problems).toEqual([
      'https://files.example/a.sldd could not be fetched: the browser is offline',
    ]);
    const online = hostOf({}, { fetch, navigator: { onLine: true } }).host;
    expect((await online.fetchUrls(['https://files.example/a.sldd'])).problems).toEqual([
      "https://files.example/a.sldd could not be fetched: that server doesn't let pages read its files (CORS)",
    ]);
  });

  it("calls the page's own fetch as a plain function when given none", async () => {
    let self: unknown = 'unset';
    const asked: string[] = [];
    vi.stubGlobal('fetch', function (this: unknown, url: string) {
      self = this;
      asked.push(url);
      return Promise.resolve(new Response(bytesOf('a')));
    });
    const { host } = hostOf({}, { fetch: undefined });
    expect((await host.fetchUrls(['https://files.example/a.sldd'])).problems).toEqual([]);
    expect(asked).toEqual(['https://files.example/a.sldd']);
    expect(self).toBeUndefined();
  });
});

describe('browserHost.fetchUrl', () => {
  it('opens a typed address with openFromUrl, rejecting with the line that says why it did not', async () => {
    const { host } = hostOf({ 'https://files.example/a.sldd': 'a' }, { openFromUrl: true });
    expect(await host.fetchUrl!('https://files.example/a.sldd')).toBe('/files/1/a.sldd');
    await expect(host.fetchUrl!('http://files.example/a.sldd')).rejects.toThrow(/^http:\/\/files\.example\/a\.sldd is not an https: address\.$/);
    await expect(host.fetchUrl!('https://files.example/none.sldd')).rejects.toThrow(/^https:\/\/files\.example\/none\.sldd could not be fetched: 404 Not Found$/);
  });

  it('is not there without openFromUrl, so the shell offers no Open from URL', () => {
    expect('fetchUrl' in hostOf().host).toBe(false);
    expect('fetchUrl' in hostOf({}, { openFromUrl: false }).host).toBe(false);
  });
});

describe('browserHost.linkFor', () => {
  it("is the page's own, and not there without one, so the shell offers no Copy Link", () => {
    const linkFor = (request: ShellLinkRequest): ShellLink => ({ url: `https://dex.example/?n=${request.files.length}`, left: [] });
    expect(hostOf({}, { linkFor }).host.linkFor).toBe(linkFor);
    expect('linkFor' in hostOf().host).toBe(false);
  });
});
