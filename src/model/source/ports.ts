// Copyright 2026 The MathWorks, Inc.
//
// The ports a channel comes in, as the wire's TablePort (wire.ts): a `MessagePort` (a page's, a
// worker's, a `MessageChannel`'s) and Electron's `MessagePortMain`, the end a main process keeps
// of a `MessageChannelMain`. The second is typed by its shape, so nothing here imports electron.
//
// DOM-free in the model's sense: `MessagePort` is a worker's type as much as a page's.
import type { TablePort } from './wire.js';

/**
 * Electron's `MessagePortMain` as far as the wire uses it: what it posts, how it is heard, and
 * `start()`, which a `MessagePortMain` needs before it delivers anything. Any object of this shape
 * is one; view never imports electron.
 */
export interface MainPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown;
  off(event: 'message', listener: (event: { data: unknown }) => void): unknown;
  start(): void;
}

/**
 * A `MessagePort` as a port of the wire: for a page, a worker, or either end of a
 * `MessageChannel`. Its postMessage takes a transfer list too, so serveFolder's `transfer` hands
 * a file's bytes over rather than copying them. Starts the port, as `onmessage` would.
 */
export function portFromMessagePort(port: MessagePort): TablePort {
  return {
    postMessage: (message: unknown, transfer?: Transferable[]) => port.postMessage(message, transfer ?? []),
    onMessage(listener) {
      const hear = (e: MessageEvent) => listener(e.data);
      port.addEventListener('message', hear);
      port.start();
      return () => port.removeEventListener('message', hear);
    },
  };
}

/**
 * Electron's `MessagePortMain` (any `MainPort`) as a port of the wire: for a main process serving
 * a page over a `MessageChannelMain`. It copies what it posts (a `MessagePortMain` transfers only
 * ports), so serve it without `transfer`. Starts the port.
 */
export function portFromMainPort(port: MainPort): TablePort {
  return {
    postMessage: (message) => port.postMessage(message),
    onMessage(listener) {
      const hear = (e: { data: unknown }) => listener(e.data);
      port.on('message', hear);
      port.start();
      return () => void port.off('message', hear);
    },
  };
}
