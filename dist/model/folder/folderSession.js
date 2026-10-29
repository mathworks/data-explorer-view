// Copyright 2026 The MathWorks, Inc.
//
// A folder, read once for everything an app shows of it: its hierarchy (FolderHierarchy), the
// usage graphs its tables' Usage column is filled from (UsageGraphs), the names a search finds
// (NameIndex), and the reposts a data table is owed when a model comes or goes (UsageRepostHub).
//
// Each of the four could be made on its own, and then each listed the folder for itself and had
// a reader of its own: two listings per change, and a change told to each in a different way. The
// session holds the one listing and the one source cache they all read through, and turns a
// change into what each needs: a new listing, diffed against the last, then the graphs dropped,
// the names reindexed (or removed) for just the files that changed, the hierarchy rebuilt, and the
// hub owed a repost when a model was created or deleted.
//
// DOM-free: the app lists the folder and reads its files (FolderFiles, the reader); a FolderReader
// across a channel is both, and its onChange is a watch.
import { isGraphPath, newSourceCache } from 'data-explorer-core';
import { FolderHierarchy } from '../hierarchy/folderHierarchy.js';
import { NameIndex } from '../search/nameIndex.js';
import { UsageGraphs } from '../usage/usageGraphs.js';
import { createUsageRepostHub } from '../usage/usageRepostHub.js';
function diff(before, after) {
    const was = new Map(before.map((f) => [f.uriString, f]));
    const now = new Set(after.map((f) => f.uriString));
    return {
        created: after.filter((f) => !was.has(f.uriString)),
        deleted: before.filter((f) => !now.has(f.uriString)),
        kept: after.filter((f) => was.has(f.uriString)),
    };
}
/** A folder session: one listing, one cache, and the four things an app shows of a folder. */
export function createFolderSession(options) {
    const cache = options.cache ?? newSourceCache();
    const reader = options.reader;
    // The listing everything reads: asked once, when first needed, and again on each change. Handed
    // on as it came, not copied, so a listing cut short still says so to the hierarchy.
    let listing = null;
    // The last listing that answered, to diff the next one against, and its uris, for has().
    let listed = null;
    let listedUris = new Set();
    let disposed = false;
    const current = () => {
        if (!listing) {
            const asking = options.files.list();
            listing = asking;
            asking.then((files) => {
                if (listing !== asking)
                    return;
                listed = files;
                listedUris = new Set(files.map((f) => f.uriString));
            }, 
            // A listing that failed is not kept: the next ask lists again.
            () => {
                if (listing === asking)
                    listing = null;
            });
        }
        return listing;
    };
    // The kinds a usage graph and a name index read: no projects, which define no variables.
    const graphFiles = async () => (await current()).filter((f) => isGraphPath(f.path));
    const hierarchy = new FolderHierarchy({
        files: { list: current },
        reader,
        cache,
        ...(options.isDirty ? { isDirty: options.isDirty } : {}),
    });
    const usage = new UsageGraphs({
        // The folder, and nothing an editor holds open beside it.
        inputs: { inputsKey: () => '', candidates: graphFiles, readerFor: reader },
        cache,
    });
    const names = new NameIndex({
        files: { list: graphFiles },
        reader: (files) => {
            const r = reader(files);
            return { ...r, dirtyBytes: r.dirtyBytes ?? (() => null) };
        },
        cache,
    });
    // The hub's watch is the session's own diff: every file created or deleted, which the hub keeps
    // the models of. Held only while a data table is subscribed, as any hub's watch is.
    const modelSet = new Set();
    const reposts = createUsageRepostHub({
        watch: (changed) => {
            modelSet.add(changed);
            return { dispose: () => void modelSet.delete(changed) };
        },
        graphs: usage,
        ...(options.repostDelayMs === undefined ? {} : { delayMs: options.repostDelayMs }),
        ...(options.repostTimers ? { timers: options.repostTimers } : {}),
    });
    // One change at a time; a change asked for while one runs waits, and every change asked for
    // meanwhile is taken together as one more listing (a hint of all of them, or none if any had none).
    let running = null;
    let queued = null;
    async function apply(uris) {
        const before = listed;
        listing = null;
        let after;
        try {
            after = await current();
        }
        catch {
            // The folder could not be listed: everything asks again, and says why, on its next query.
            usage.invalidate();
            names.invalidate();
            hierarchy.rebuild();
            return;
        }
        if (disposed)
            return;
        usage.invalidate();
        if (!before) {
            // Nothing was listed before: nothing to tell apart, so everything reads afresh.
            names.invalidate();
            hierarchy.rebuild();
            return;
        }
        const { created, deleted, kept } = diff(before, after);
        // The names: a file gone is removed, a file new or saved is read again. Without a hint of
        // which files were saved, every name is read again, through the cache (a stat a file).
        for (const file of deleted)
            names.remove(file.uriString);
        if (uris) {
            const saved = kept.filter((f) => uris.has(f.uriString));
            await Promise.all([...created, ...saved].filter((f) => isGraphPath(f.path)).map((f) => names.reindex(f)));
        }
        else {
            names.invalidate();
        }
        hierarchy.rebuild();
        // A model created or deleted can change what a data file's Usage column says.
        for (const file of [...created, ...deleted])
            for (const listener of [...modelSet])
                listener(file.path);
    }
    function changed(uris) {
        if (disposed)
            return Promise.resolve();
        if (!running) {
            running = apply(uris ? new Set(uris) : null).finally(() => {
                running = null;
                const next = queued;
                queued = null;
                if (next)
                    void changed(next.uris ? [...next.uris] : undefined).then(next.resolve);
            });
            return running;
        }
        if (!queued) {
            let resolve;
            const done = new Promise((r) => (resolve = r));
            queued = { uris: new Set(), done, resolve };
        }
        if (!uris)
            queued.uris = null;
        else if (queued.uris)
            for (const uri of uris)
                queued.uris.add(uri);
        return queued.done;
    }
    const watching = options.watch?.((uris) => void changed(uris));
    return {
        hierarchy,
        usage,
        names,
        reposts,
        cache,
        changed,
        has: (uri) => listedUris.has(uri),
        dispose() {
            if (disposed)
                return;
            disposed = true;
            if (typeof watching === 'function')
                watching();
            else
                watching?.dispose();
            reposts.dispose();
            modelSet.clear();
            queued?.resolve();
            queued = null;
        },
    };
}
