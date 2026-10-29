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
    // The last reveal asked for, likewise: the file the app has open now, not one it had open.
    let revealing = 0;
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
    // The row last selected by a choice or a reveal, and its file.
    let selected = null;
    const onSelect = (e) => {
        const uri = e.detail?.uri;
        if (typeof e.detail?.key === 'string')
            selected = { key: e.detail.key, uri: typeof uri === 'string' ? uri : null };
        if (typeof uri === 'string' && uri !== '')
            emit('open', uri);
    };
    // The rows from the top level down to the row `key`, if the folder has it now. A key is its
    // parent's key, a `/`, and an encoded part of its own (FolderHierarchy), so its ancestors are
    // its prefixes.
    const rowsTo = async (key) => {
        const parts = key.split('/').slice(1);
        const path = [];
        try {
            let items = await hierarchy.roots();
            for (let i = 0; i < parts.length; i++) {
                const want = `/${parts.slice(0, i + 1).join('/')}`;
                const item = items.find((it) => it.key === want);
                if (!item)
                    return undefined;
                path.push(item);
                if (i < parts.length - 1)
                    items = await hierarchy.children(item);
            }
            return path;
        }
        catch {
            return undefined;
        }
    };
    element.loadChildren = (item) => hierarchy.children(item);
    if (options.expandTopLevel)
        element.expandTopLevel = true;
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
        async reveal(uri, revealOptions = {}) {
            if (disposed)
                return false;
            const ask = ++revealing;
            // The row selected now, when it is the file's already (the user chose it there): it stays.
            const kept = selected && selected.uri === uri && element.selectedKey === selected.key ? await rowsTo(selected.key) : undefined;
            const path = kept?.[kept.length - 1]?.id === uri ? kept : await hierarchy.pathTo(uri).catch(() => undefined);
            if (disposed || ask !== revealing || !path || path.length === 0)
                return false;
            selected = { key: path[path.length - 1].key, uri };
            element.revealRow(path, revealOptions.choose ? { choose: true } : {});
            return true;
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
