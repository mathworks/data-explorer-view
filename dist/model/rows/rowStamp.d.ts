import type { RowCellPool } from 'data-explorer-core';
export interface ClipMark {
    keys: Set<string>;
    mode: 'cut' | 'copy';
}
/** The mark key for one entry. `\0` cannot occur in a section or entry name. */
export declare function clipMarkKey(section: string, name: string): string;
/** The section and name a mark key spells. */
export declare function splitClipMarkKey(key: string): {
    section: string;
    name: string;
};
/** The context-menu flags of one row, which the webview (holding no model) builds its menu from. */
export interface CapabilityFlags {
    _canCopy: boolean;
    _canDelete: boolean;
    _canAddChild: boolean;
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
export declare function capabilityFlags(n: any, opts: {
    canCopy: boolean;
}): CapabilityFlags;
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
export declare function sharedIdTest(): (entry: any) => boolean;
/**
 * What an ENTRY's own row is stamped with beyond its node's cells. Nested rows have none of
 * these: they are never marked Modified by the baseline, and never take the clipboard mark.
 */
export interface EntryStamp {
    /** The entry's section, '' for a MAT-file's variable: half of its clip-mark key. */
    section: string;
    name: string;
    /**
     * The Status column's answer from the caller's baseline, authoritative where given; absent
     * leaves the node's own. Each builder owns the rule that produces it (rowBuilder: a stale
     * 'Modified' cleared; matRowBuilder: the editable view's save marks).
     */
    status?: string;
    clipMark?: ClipMark;
}
export interface StampContext {
    /** Whether this document's entries travel on the clipboard (`_canCopy`). */
    canCopy: boolean;
    /**
     * The row's entry shares its id with another (sharedIdTest), so nothing addressed by the id
     * reaches it: the row offers no Copy, Cut, Delete or Add Child, whatever the node says.
     */
    sharedId?: boolean;
    /** Present on an entry's own row only. */
    entry?: EntryStamp;
    /** The plan held this node's children back (lazyRows.ts). */
    deferred: boolean;
    /** Share the finished row's cells through this pool, when the build has one. */
    pool?: RowCellPool;
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
export declare function stampRow(built: any, n: any, ctx: StampContext): any;
