import { stampMatrix } from '../matrix/matrixPayload.js';
import { stampLazy } from './lazyRows.js';
/** The mark key for one entry. `\0` cannot occur in a section or entry name. */
export function clipMarkKey(section, name) {
    return `${section}\u0000${name}`;
}
/** The section and name a mark key spells. */
export function splitClipMarkKey(key) {
    const at = key.indexOf('\u0000');
    return at < 0
        ? { section: '', name: key }
        : { section: key.slice(0, at), name: key.slice(at + 1) };
}
/**
 * The context-menu flags for a node, computed host-side so the webview can build the
 * right-click menu synchronously from row data.
 *
 * An entry is removable from its section (or a variable from its file); a nested child only
 * if its parent container permits it (bus/struct/enum expose canRemoveChild). canAddChild and
 * canRemoveChild exist only on some node types, so both are guarded with typeof — and a check
 * that THROWS offers nothing rather than taking the row down with it: the MAT builder always
 * guarded this, the dictionary builder did not, and there a throw escaped the whole build and
 * blanked the table instead of one row's menu.
 *
 * `canCopy` is the caller's because it is a fact about the VIEW, not the node: a
 * dictionary's entries always travel on the clipboard, and a MAT-file's do in the editable view
 * that offers it (matRowBuilder's `canCopy`). Copy and Cut act on the owning entry, so every
 * row of a document carries the same answer.
 */
export function capabilityFlags(n, opts) {
    let canDelete = false;
    let canAddChild = false;
    try {
        const parent = n.parent;
        canDelete = !!n.isEntry || !!(parent && typeof parent.canRemoveChild === 'function' && parent.canRemoveChild());
        canAddChild = typeof n.canAddChild === 'function' && !!n.canAddChild();
    }
    catch {
        /* offered nothing */
    }
    return { _canCopy: opts.canCopy, _canDelete: canDelete, _canAddChild: canAddChild };
}
/**
 * Whether an entry shares its id with another entry, for one build of rows: made fresh by each
 * build (a payload, one entry's repaint, one row's fetch) and asked of the entry each of its
 * rows belongs to, which the build knows per root, so no row walks up to find it.
 *
 * A node id is a path, so two entries of one name under one parent — a MAT-file holding two
 * records of a name, a dictionary section holding two entries of one — are one id, and so is
 * every row inside them. Core resolves an id that names two nodes to neither, so no gesture
 * addressed by it can act on either — Copy, Cut, Delete and Add Child would each only say they
 * could not find the item. Such a row says so before it is clicked (StampContext.sharedId: no
 * capability flag set); the file's own warning says why. Only a malformed file holds such a pair.
 *
 * Each parent's names are counted once, on the first entry under it, so a build stays linear.
 */
export function sharedIdTest() {
    const byParent = new Map();
    return (entry) => {
        const parent = entry?.parent;
        if (!parent)
            return false;
        let counts = byParent.get(parent);
        if (!counts) {
            counts = new Map();
            for (const sibling of (parent.children ?? [])) {
                if (sibling?.isEntry)
                    counts.set(sibling.name, (counts.get(sibling.name) ?? 0) + 1);
            }
            byParent.set(parent, counts);
        }
        return (counts.get(entry.name) ?? 0) > 1;
    };
}
/**
 * Stamp one built row. `built` is the builder's row — `toRow()`'s output plus whatever is
 * the builder's own (rowBuilder's block-row remap, section reparent and dictionary metadata
 * columns) — and is never written: each stamp copies.
 *
 * In this order, which both builders already applied: the entry's Status and clip mark, then
 * the capability flags, then the grid-view payload if the node's value is a griddable matrix,
 * then `_lazy` last, so a row is the same shape whichever builder made it. None rewrites the
 * row's columns.
 *
 * The pool shares the FINISHED row, rather than being passed to `toRow()`: the row is the
 * node's cells plus the host's own, so sharing here covers all of them in one walk where doing
 * both would cost two. `_matrix` is left alone: the pool declines any cell it cannot key
 * exactly, and a matrix payload holds a number[].
 */
export function stampRow(built, n, ctx) {
    let row = built;
    const entry = ctx.entry;
    if (entry) {
        if (entry.status !== undefined)
            row = { ...row, Status: entry.status };
        // The table reads Name.clipboardMode to dim (cut) or dash-outline (copied). The key
        // carries the section, so no caller has to pre-match it.
        if (entry.clipMark?.keys.has(clipMarkKey(entry.section, entry.name)) && row.Name && typeof row.Name === 'object') {
            row = { ...row, Name: { ...row.Name, clipboardMode: entry.clipMark.mode } };
        }
    }
    const flags = ctx.sharedId
        ? { _canCopy: false, _canDelete: false, _canAddChild: false }
        : capabilityFlags(n, { canCopy: ctx.canCopy });
    const stamped = stampLazy(stampMatrix({ ...row, ...flags }, n), ctx.deferred);
    return ctx.pool ? ctx.pool.share(stamped) : stamped;
}
