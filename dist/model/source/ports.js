/**
 * A `MessagePort` as a port of the wire: for a page, a worker, or either end of a
 * `MessageChannel`. Its postMessage takes a transfer list too, so serveFolder's `transfer` hands
 * a file's bytes over rather than copying them. Starts the port, as `onmessage` would.
 */
export function portFromMessagePort(port) {
    return {
        postMessage: (message, transfer) => port.postMessage(message, transfer ?? []),
        onMessage(listener) {
            const hear = (e) => listener(e.data);
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
export function portFromMainPort(port) {
    return {
        postMessage: (message) => port.postMessage(message),
        onMessage(listener) {
            const hear = (e) => listener(e.data);
            port.on('message', hear);
            port.start();
            return () => void port.off('message', hear);
        },
    };
}
