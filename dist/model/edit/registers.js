/**
 * A deleter's reason when nothing in its document answers to the names it was given any more:
 * renamed or deleted since the cut. One spelling for every format, because it is one fact.
 */
export const NOT_FOUND_REASON = 'nothing in it answers to that name any more';
/**
 * Run one listener's half of a broadcast, keeping whatever it throws — now or, for a post that
 * answers a promise, later as a rejection — from reaching the loop that serves every other one.
 * An engine's own listener runs each half of its answer through it too, as editorHub reaches a view.
 */
export function reach(run) {
    try {
        const result = run();
        if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(() => { });
        }
    }
    catch {
        /* this listener misses this broadcast; the next one it gets is complete */
    }
}
/** A window's registers, all empty. */
export function createRegisters() {
    let clipboard = null;
    let drag = null;
    const sourceDeleters = new Map();
    const listeners = new Set();
    const getClipboard = () => clipboard;
    const clearClipboard = () => {
        clipboard = null;
    };
    const getDrag = () => drag;
    const clearDrag = () => {
        drag = null;
    };
    const clipboardState = () => ({
        canPaste: clipboard !== null,
        mode: clipboard ? clipboard.mode : null,
        sourceDocUri: clipboard?.sourceDocUri,
        items: (clipboard?.items ?? []).map(({ sourceSection, className, arrayClass, kind, isMatlabVariable, isScalarNumeric, sharedName }) => ({
            sectionName: sourceSection,
            className,
            arrayClass,
            kind,
            isMatlabVariable,
            isScalarNumeric,
            ...(sharedName ? { sharedName } : {}),
        })),
    });
    const dragDescriptor = () => {
        if (!drag)
            return null;
        return {
            docUri: drag.sourceDocUri,
            items: drag.items.map((it) => ({
                sectionName: it.sourceSection,
                className: it.className,
                arrayClass: it.arrayClass,
                kind: it.kind,
                isMatlabVariable: it.isMatlabVariable,
                isScalarNumeric: it.isScalarNumeric,
                ...(it.sharedName ? { sharedName: true } : {}),
            })),
        };
    };
    const broadcastClipboardState = () => {
        const state = clipboardState();
        for (const listener of [...listeners])
            if (listener.clipboard)
                reach(() => listener.clipboard(state));
    };
    const broadcastDragState = () => {
        const descriptor = dragDescriptor();
        for (const listener of [...listeners])
            if (listener.drag)
                reach(() => listener.drag(descriptor));
    };
    return {
        setClipboard(items, mode, sourceDocUri) {
            clipboard = items.length ? { items, mode, sourceDocUri } : null;
        },
        getClipboard,
        clearClipboard,
        canPaste: () => clipboard !== null,
        clipboardState,
        setDrag(sourceDocUri, items) {
            drag = { sourceDocUri, items };
        },
        getDrag,
        clearDrag,
        dragDescriptor,
        // Each register remembers the exact object it read and clears only while the register still
        // holds that object. setClipboard and setDrag replace the record rather than mutate it, so
        // identity is the test of "nothing newer was written": a copy made while a paste was awaiting
        // its write, or a drag started while a drop was finishing, is not wiped by the transfer that
        // was already under way.
        clipboardRegister(broadcast = broadcastClipboardState) {
            let held = null;
            return {
                kind: 'clipboard',
                read() {
                    held = getClipboard();
                    return held && { items: held.items, sourceDocUri: held.sourceDocUri, move: held.mode === 'cut' };
                },
                clear() {
                    if (held && getClipboard() === held)
                        clearClipboard();
                },
                broadcast,
            };
        },
        dragRegister(mode, broadcast = broadcastDragState) {
            const held = getDrag();
            return {
                kind: 'drag',
                read() {
                    return held && { items: held.items, sourceDocUri: held.sourceDocUri, move: mode === 'move' };
                },
                clear() {
                    if (held && getDrag() === held)
                        clearDrag();
                },
                broadcast,
            };
        },
        registerSourceDeleter(uriString, fn) {
            sourceDeleters.set(uriString, fn);
        },
        unregisterSourceDeleter(uriString) {
            sourceDeleters.delete(uriString);
        },
        async deleteFromSource(uriString, targets) {
            const fn = sourceDeleters.get(uriString);
            if (!fn)
                return { removed: false, reason: 'its table is no longer open' };
            const result = await fn(targets);
            // Typed as an answer, so nothing should return none — but a deleter that says nothing has
            // not said it removed anything, and the user is the one who would pay for assuming it did.
            return result && typeof result.removed === 'boolean' ? result : { removed: false, reason: 'its editor did not say' };
        },
        listen(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        broadcastClipboardState,
        broadcastDragState,
    };
}
