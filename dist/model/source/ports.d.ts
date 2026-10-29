import type { TablePort } from './wire.js';
/**
 * Electron's `MessagePortMain` as far as the wire uses it: what it posts, how it is heard, and
 * `start()`, which a `MessagePortMain` needs before it delivers anything. Any object of this shape
 * is one; view never imports electron.
 */
export interface MainPort {
    postMessage(message: unknown): void;
    on(event: 'message', listener: (event: {
        data: unknown;
    }) => void): unknown;
    off(event: 'message', listener: (event: {
        data: unknown;
    }) => void): unknown;
    start(): void;
}
/**
 * A `MessagePort` as a port of the wire: for a page, a worker, or either end of a
 * `MessageChannel`. Its postMessage takes a transfer list too, so serveFolder's `transfer` hands
 * a file's bytes over rather than copying them. Starts the port, as `onmessage` would.
 */
export declare function portFromMessagePort(port: MessagePort): TablePort;
/**
 * Electron's `MessagePortMain` (any `MainPort`) as a port of the wire: for a main process serving
 * a page over a `MessageChannelMain`. It copies what it posts (a `MessagePortMain` transfers only
 * ports), so serve it without `transfer`. Starts the port.
 */
export declare function portFromMainPort(port: MainPort): TablePort;
