// Copyright 2026 The MathWorks, Inc.
//
// The ports a channel comes in, as the wire's TablePort: a MessagePort (here Node's, the same
// interface a page's and a worker's have), across which a folder is served and read with its
// bytes handed over; and Electron's MessagePortMain, by its shape, here an EventEmitter that
// delivers nothing before `start()`, as MessagePortMain does.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { SourceFile } from 'data-explorer-core';
import {
  folderReader,
  portFromMainPort,
  portFromMessagePort,
  serveFolder,
  type MainPort,
} from '../src/model/index.js';

const A: SourceFile = { uriString: 'file:///w/a.sldd', path: '/w/a.sldd' };

/** Until `test` holds: for a message on its way, never a fixed wait, which a loaded machine outruns. */
const until = (test: () => boolean): Promise<void> => expect.poll(test, { timeout: 10_000, interval: 5 }).toBe(true);

describe('a MessagePort', () => {
  it('carries a folder both ways, and hands its bytes over with `transfer`', async () => {
    const { port1, port2 } = new MessageChannel();
    const buffer = new TextEncoder().encode('moved').buffer as ArrayBuffer;
    const server = serveFolder(
      {
        files: { list: async () => [A] },
        reader: () => ({ version: async () => 'v', bytes: async () => buffer, projectStore: async () => null }),
      },
      portFromMessagePort(port1),
      { transfer: true },
    );
    const reader = folderReader(portFromMessagePort(port2));
    try {
      expect(await reader.list()).toEqual([A]);
      expect(new TextDecoder().decode((await reader.bytes(A))!)).toBe('moved');
      // Moved, not copied: the host's buffer is detached.
      expect(buffer.byteLength).toBe(0);
    } finally {
      server.dispose();
      reader.dispose();
      port1.close();
      port2.close();
    }
  });

  it('hears nothing more once the listener is let go', async () => {
    const { port1, port2 } = new MessageChannel();
    const heard: unknown[] = [];
    const stop = portFromMessagePort(port2).onMessage((m) => heard.push(m));
    port1.postMessage({ n: 1 });
    await until(() => heard.length === 1);
    stop();
    // A listener still on the port hears the next message: the one let go of was told the same.
    const still: unknown[] = [];
    portFromMessagePort(port2).onMessage((m) => still.push(m));
    port1.postMessage({ n: 2 });
    await until(() => still.length === 1);
    expect(heard).toEqual([{ n: 1 }]);
    port1.close();
    port2.close();
  });
});

/** A MessagePortMain by its shape: it queues what arrives until start(), as Electron's does. */
class FakeMainPort extends EventEmitter implements MainPort {
  started = false;
  posted: unknown[] = [];
  private queued: unknown[] = [];
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  start(): void {
    this.started = true;
    for (const data of this.queued.splice(0)) this.emit('message', { data, ports: [] });
  }
  /** What the other end of the channel sent. */
  deliver(data: unknown): void {
    if (this.started) this.emit('message', { data, ports: [] });
    else this.queued.push(data);
  }
}

describe("Electron's MessagePortMain", () => {
  it('is started when heard, posts what it is given, and is let go of by off()', () => {
    const main = new FakeMainPort();
    main.deliver('early');
    const port = portFromMainPort(main);
    const heard: unknown[] = [];
    const stop = port.onMessage((m) => heard.push(m));
    expect(main.started).toBe(true);
    main.deliver({ type: 'folderRequest', id: 1, ask: 'list' });
    port.postMessage({ type: 'folderChanged' });
    stop();
    main.deliver('late');
    expect(heard).toEqual(['early', { type: 'folderRequest', id: 1, ask: 'list' }]);
    expect(main.posted).toEqual([{ type: 'folderChanged' }]);
    expect(main.listenerCount('message')).toBe(0);
  });

  it('serves a folder without a transfer list: what it posts is one argument', async () => {
    const main = new FakeMainPort();
    const calls: unknown[][] = [];
    main.postMessage = (...args: unknown[]) => void calls.push(args);
    const buffer = new ArrayBuffer(4);
    // Asked to transfer anyway, the adapter posts the message alone: a MessagePortMain moves ports only.
    serveFolder(
      {
        files: { list: async () => [A] },
        reader: () => ({ version: async () => 'v', bytes: async () => buffer, projectStore: async () => null }),
      },
      portFromMainPort(main),
      { transfer: true },
    );
    main.deliver({ type: 'folderRequest', id: 1, ask: 'list' });
    await until(() => calls.length === 1);
    main.deliver({ type: 'folderRequest', id: 2, ask: 'bytes', uri: A.uriString });
    await until(() => calls.length === 2);
    expect(calls.map((c) => c.length)).toEqual([1, 1]);
    expect(calls[1]![0]).toEqual({ type: 'folderAnswer', id: 2, value: buffer });
    expect(buffer.byteLength).toBe(4);
  });
});
