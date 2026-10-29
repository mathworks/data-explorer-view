const messageOf = (err) => (err instanceof Error ? err.message : String(err));
/**
 * Wire `element` to `hierarchy`: draw its rows now, and again on each of its refreshes and
 * rebuilds, and answer each row the user opens.
 */
export function connectHierarchy(element, hierarchy, options = {}) {
    const listeners = {
        open: new Set(),
        error: new Set(),
    };
    const emit = (type, detail) => {
        for (const listener of [...listeners[type]])
            listener(detail);
    };
    let disposed = false;
    // The last draw asked for: an earlier one answering after it is dropped, so a slow read of the
    // folder as it was cannot paint over the folder as it is.
    let asked = 0;
    const setEmpty = (isEmpty) => {
        const empty = options.empty;
        if (typeof empty === 'function')
            return empty(isEmpty);
        if (empty) {
            empty.hidden = !isEmpty;
            element.hidden = isEmpty;
        }
    };
    const draw = async () => {
        const ask = ++asked;
        try {
            const roots = await hierarchy.roots();
            if (disposed || ask !== asked)
                return;
            element.items = roots;
            setEmpty(roots.length === 0);
        }
        catch (err) {
            if (disposed || ask !== asked)
                return;
            element.items = [];
            setEmpty(true);
            emit('error', messageOf(err));
        }
    };
    const onSelect = (e) => {
        const uri = e.detail?.uri;
        if (typeof uri === 'string' && uri !== '')
            emit('open', uri);
    };
    element.loadChildren = (item) => hierarchy.children(item);
    element.addEventListener('dex-hierarchy-select', onSelect);
    const stop = hierarchy.subscribe(() => void draw());
    void draw();
    return {
        element,
        hierarchy,
        on(type, listener) {
            const set = listeners[type];
            set.add(listener);
            return () => void set.delete(listener);
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            stop();
            element.removeEventListener('dex-hierarchy-select', onSelect);
            listeners.open.clear();
            listeners.error.clear();
        },
    };
}
