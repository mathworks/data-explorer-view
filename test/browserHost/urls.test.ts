// Copyright 2026 The MathWorks, Inc.
//
// The rules for a web address the browser host fetches a data file from, and the fetch itself
// (src/browser/urls.ts). The address may come from a link anyone wrote (`?url=`), so what is fetched
// is pinned: only `https:` (or the page's own origin), only a file this app opens, GitHub's and
// GitLab's file pages turned into the raw files behind them, and the fetch made without the user's
// cookies or the page's address, within a size and a time. A rule that slipped would fetch a web
// page as a dictionary, send a private repo's cookies to it, or hang a tab on a server that never
// answers; and each refusal says why in a sentence the user reads.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUrlBytes, URL_SIZE_LIMIT, URL_TIMEOUT_MS, urlTargetOf, type UrlFetchDeps, type UrlTarget } from '../../src/browser/urls.js';

afterEach(() => {
  vi.useRealTimers();
});

const PAGE = 'https://dex.example';

/** The target `given` names, failing the test where it is refused. */
function targetOf(given: string, origin = PAGE): UrlTarget {
  const target = urlTargetOf(given, origin);
  if ('problem' in target) throw new Error(`refused: ${target.problem}`);
  return target;
}

/** Why `given` is refused, failing the test where it is not. */
function problemOf(given: string, origin = PAGE): string {
  const target = urlTargetOf(given, origin);
  if (!('problem' in target)) throw new Error(`accepted: ${target.url}`);
  return target.problem;
}

const bytesOf = (s: string) => new TextEncoder().encode(s);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A fetch answering `answer` for every address, recording what it was asked. */
function fakeFetch(answer: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer(url, init);
  });
  return { fetch, calls };
}

/** A body of these chunks, counting its pulls and whether it was cancelled. */
function countedBody(chunks: Uint8Array[]) {
  const counts = { pulls: 0, cancelled: 0 };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        counts.pulls++;
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel() {
        counts.cancelled++;
      },
    },
    // Nothing is pulled before a read asks for it.
    { highWaterMark: 0 },
  );
  return { stream, counts };
}

const A = targetOf('https://files.example/x/a.sldd');
const deps = (more: Partial<UrlFetchDeps> & Pick<UrlFetchDeps, 'fetch'>): UrlFetchDeps => more;

describe('urlTargetOf', () => {
  it("fetches a github.com file page's raw file, beside its folder's", () => {
    const given = 'https://github.com/acme/plant/blob/main/models/ctrl.slx';
    expect(targetOf(given)).toEqual({
      given,
      url: 'https://raw.githubusercontent.com/acme/plant/main/models/ctrl.slx',
      name: 'ctrl.slx',
      group: 'https://raw.githubusercontent.com/acme/plant/main/models/',
    });
  });

  it('keeps a ref with a slash in it, and drops the page\'s query and fragment', () => {
    expect(targetOf('https://github.com/acme/plant/blob/feature/x/params.sldd?raw=true#L3').url).toBe(
      'https://raw.githubusercontent.com/acme/plant/feature/x/params.sldd',
    );
  });

  it("fetches a github.com raw link's file from the raw host", () => {
    expect(targetOf('https://github.com/acme/plant/raw/main/a.mat').url).toBe('https://raw.githubusercontent.com/acme/plant/main/a.mat');
  });

  it("fetches a GitLab file page's raw file, on any host and under nested groups", () => {
    expect(targetOf('https://code.example.com/group/sub/plant/-/blob/v1.0/data/params.sldd').url).toBe(
      'https://code.example.com/group/sub/plant/-/raw/v1.0/data/params.sldd',
    );
    expect(targetOf('https://git.example.org/team/plant/-/blob/main/a.sldd').url).toBe('https://git.example.org/team/plant/-/raw/main/a.sldd');
  });

  it('fetches any other address as given, its query kept and its fragment dropped', () => {
    expect(targetOf('https://files.example/x/params.sldd?sig=abc#top')).toEqual({
      given: 'https://files.example/x/params.sldd?sig=abc#top',
      url: 'https://files.example/x/params.sldd?sig=abc',
      name: 'params.sldd',
      group: 'https://files.example/x/',
    });
    expect(targetOf('https://raw.githubusercontent.com/acme/plant/main/a.sldd').url).toBe('https://raw.githubusercontent.com/acme/plant/main/a.sldd');
  });

  it("names the file by its address's last part, decoded", () => {
    expect(targetOf('https://files.example/My%20Params.sldd').name).toBe('My Params.sldd');
  });

  it('trims the whitespace around an address', () => {
    expect(targetOf('  https://files.example/a.sldd \n').given).toBe('https://files.example/a.sldd');
  });

  it('refuses http:, except on the page\'s own origin', () => {
    expect(problemOf('http://files.example/a.sldd')).toBe('http://files.example/a.sldd is not an https: address.');
    expect(targetOf('http://localhost:4319/samples/a.sldd', 'http://localhost:4319').url).toBe('http://localhost:4319/samples/a.sldd');
  });

  it('refuses every other scheme with the https: sentence', () => {
    for (const given of ['file:///tmp/a.sldd', 'data:application/octet-stream,x', 'javascript:alert(1)']) {
      expect(problemOf(given)).toBe(`${given} is not an https: address.`);
    }
  });

  it('refuses what is not a web address, a relative one among them', () => {
    expect(problemOf('not a url')).toBe('not a url is not a web address.');
    expect(problemOf('samples/a.sldd')).toBe('samples/a.sldd is not a web address.');
  });

  it('refuses an address with a user name or password in it, a GitHub file page\'s too, which a link would hand on', () => {
    // A GitHub file page's raw address is built from its path alone, so a token in it would not
    // even be sent: the file would open, and the token go out in every link to it.
    for (const given of [
      'https://user:tok@files.example/a.sldd',
      'https://user:tok@github.com/acme/plant/blob/main/a.sldd',
      'https://user@files.example/a.sldd',
      'https://:pw@files.example/a.sldd',
    ]) {
      expect(problemOf(given)).toBe(`${given} holds a user name or password, which a link must not.`);
    }
    // On the page's own origin too: an origin has no credentials, so the address is the page's.
    const own = 'http://u:p@localhost:4319/a.sldd';
    expect(problemOf(own, 'http://localhost:4319')).toBe(`${own} holds a user name or password, which a link must not.`);
  });

  it('refuses a name with a slash in it, decoded from %2F or %5C', () => {
    for (const given of ['https://files.example/x/a%2Fb.sldd', 'https://files.example/x/a%2fb.sldd', 'https://files.example/a%5Cb.sldd']) {
      expect(problemOf(given)).toBe(`${given} names a file with a slash in its name.`);
    }
  });

  it('refuses an address that names no data file: a page, a repo, a project, a folder', () => {
    for (const given of ['https://files.example/readme.md', 'https://github.com/acme/plant', 'https://files.example/plant.prj', 'https://files.example/x/']) {
      expect(problemOf(given)).toBe(`${given} is not a file this app opens (.sldd, .slx, .mdl, .mat).`);
    }
  });
});

describe('fetchUrlBytes', () => {
  it('asks once, for the address to fetch, with no credentials, no referrer, following redirects', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(bytesOf('x')));
    await fetchUrlBytes(A, deps({ fetch }));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(A.url);
    expect(calls[0].init).toMatchObject({ credentials: 'omit', redirect: 'follow', mode: 'cors', referrerPolicy: 'no-referrer' });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("calls the fetch as a plain function, as the page's own fetch must be called", async () => {
    // A window's fetch called as a method of anything but the window throws "Illegal invocation".
    let self: unknown = 'unset';
    const fetch = function (this: unknown) {
      self = this;
      return Promise.resolve(new Response(bytesOf('x')));
    };
    await fetchUrlBytes(A, { fetch });
    expect(self).toBeUndefined();
  });

  it('resolves to the bytes of a file the server answers', async () => {
    const { fetch } = fakeFetch(() => new Response(bytesOf('dictionary'), { headers: { 'content-type': 'application/octet-stream' } }));
    expect(text(await fetchUrlBytes(A, deps({ fetch })))).toBe('dictionary');
  });

  it("says the server's status when it answers with no file", async () => {
    const notFound = fakeFetch(() => new Response('gone', { status: 404, statusText: 'Not Found' }));
    await expect(fetchUrlBytes(A, deps({ fetch: notFound.fetch }))).rejects.toThrow(/^404 Not Found$/);
    const failed = fakeFetch(() => new Response('', { status: 500, statusText: '' }));
    await expect(fetchUrlBytes(A, deps({ fetch: failed.fetch }))).rejects.toThrow(/^500$/);
  });

  it('lets go of the body of an answer it refuses, so the browser can drop the connection', async () => {
    for (const init of [{ status: 404, statusText: 'Not Found' }, { headers: { 'content-type': 'text/html' } }]) {
      const { stream, counts } = countedBody([bytesOf('<html>')]);
      const { fetch } = fakeFetch(() => new Response(stream, init));
      await expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow();
      expect(counts).toEqual({ pulls: 0, cancelled: 1 });
    }
  });

  it('refuses a web page, and takes plain text (GitHub raw answers it)', async () => {
    const page = fakeFetch(() => new Response('<html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    await expect(fetchUrlBytes(A, deps({ fetch: page.fetch }))).rejects.toThrow(/^the server answered with a web page$/);
    const plain = fakeFetch(() => new Response(bytesOf('raw'), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    expect(text(await fetchUrlBytes(A, deps({ fetch: plain.fetch })))).toBe('raw');
  });

  it('refuses a file declared too large without reading it', async () => {
    const { stream, counts } = countedBody([bytesOf('x')]);
    const { fetch } = fakeFetch(() => new Response(stream, { headers: { 'content-length': String(URL_SIZE_LIMIT + 1) } }));
    await expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^the file is larger than 64 MB$/);
    expect(counts.pulls).toBe(0);
  });

  it('refuses a file that streams past the limit, cancelling its body, and takes one of exactly the limit', async () => {
    const over = countedBody([new Uint8Array(6), new Uint8Array(6)]);
    const big = fakeFetch(() => new Response(over.stream));
    await expect(fetchUrlBytes(A, deps({ fetch: big.fetch, limit: 10 }))).rejects.toThrow(/^the file is larger than/);
    expect(over.counts.cancelled).toBe(1);
    const exact = countedBody([new Uint8Array(6), new Uint8Array(4)]);
    const fits = fakeFetch(() => new Response(exact.stream));
    expect((await fetchUrlBytes(A, deps({ fetch: fits.fetch, limit: 10 }))).length).toBe(10);
  });

  it('says a refused cross-origin read is CORS, or that the browser is offline when it is', async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^that server doesn't let pages read its files \(CORS\)$/);
    await expect(fetchUrlBytes(A, deps({ fetch, online: () => false }))).rejects.toThrow(/^the browser is offline$/);
    await expect(fetchUrlBytes(A, deps({ fetch, online: () => true }))).rejects.toThrow(/CORS/);
  });

  it('gives up on a server that does not answer within the time', async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(
      (_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }),
    );
    const fetched = fetchUrlBytes(A, deps({ fetch }));
    const settled = expect(fetched).rejects.toThrow(/^the server did not answer within 30 s$/);
    await vi.advanceTimersByTimeAsync(URL_TIMEOUT_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
  });

  it('keeps the message of a body that fails once the server has answered: no CORS refusal comes then', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytesOf('first'));
      },
      pull(controller) {
        controller.error(new TypeError('network error'));
      },
    });
    const { fetch } = fakeFetch(() => new Response(stream));
    await expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^network error$/);
  });

  it('gives up on a fetch that does not heed its signal, and lets go of its late answer', async () => {
    vi.useFakeTimers();
    const { stream, counts } = countedBody([bytesOf('late')]);
    // Answers 10 s after the time is up, whatever the signal says.
    const { fetch } = fakeFetch(() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(stream)), URL_TIMEOUT_MS + 10_000)));
    const settled = expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^the server did not answer within 30 s$/);
    await vi.advanceTimersByTimeAsync(URL_TIMEOUT_MS);
    await settled;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(counts).toEqual({ pulls: 0, cancelled: 1 });
  });

  it('gives up on a body that stalls after its first chunk, within the same time', async () => {
    vi.useFakeTimers();
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          controller.enqueue(bytesOf('first'));
        },
        // The rest never comes.
        pull: () => new Promise<void>(() => undefined),
        cancel() {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const { fetch } = fakeFetch(() => new Response(stream));
    const settled = expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^the server did not answer within 30 s$/);
    await vi.advanceTimersByTimeAsync(URL_TIMEOUT_MS);
    await settled;
    expect(cancelled).toBe(1);
  });

  it('leaves no timer behind once the file is read', async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(() => new Response(bytesOf('x')));
    await fetchUrlBytes(A, deps({ fetch }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no listener on its signal once the file is read', async () => {
    // Each fetch races its answer against its signal: a listener left there would keep every
    // fetch's race alive for as long as its signal is.
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (this: EventTarget, type, listener, options) {
      if (this instanceof AbortSignal && type === 'abort') added.push(listener);
      return add.call(this, type, listener, options);
    });
    vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(function (this: EventTarget, type, listener, options) {
      if (this instanceof AbortSignal && type === 'abort') removed.push(listener);
      return remove.call(this, type, listener, options);
    });
    const { fetch } = fakeFetch(() => new Response(bytesOf('x')));
    await fetchUrlBytes(A, deps({ fetch }));
    vi.restoreAllMocks();
    expect(added.length).toBeGreaterThan(0);
    expect(added.filter((listener) => !removed.includes(listener))).toEqual([]);
  });

  it("keeps any other error's own message", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new Error('boom')));
    await expect(fetchUrlBytes(A, deps({ fetch }))).rejects.toThrow(/^boom$/);
  });
});
