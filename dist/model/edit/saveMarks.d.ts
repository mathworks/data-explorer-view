/** One edit, as the closures its stack calls for it see it. */
export interface MarkedEdit {
    undone(): void;
    redone(): void;
}
/**
 * Which edits were applied when a save serialized the document: handed back to `commit` once its
 * bytes are on disk, or to `release` if they never get there.
 */
export interface SaveSnapshot {
    readonly applied: ReadonlyMap<object, boolean>;
}
export type SaveMark = 'Modified' | 'New';
export declare class SaveMarks<T> {
    /** The edits that differ from the saved file, or may, in the order they were made. */
    private entries;
    private seq;
    private epoch;
    /** The snapshots taken and not yet committed or released. */
    private readonly inFlight;
    /**
     * An edit was made, touching `touched`, of which `added` it added (a variable that joined the
     * file, which the column calls New until the file is saved with it), and `replaced` it put in
     * another's place (`replacementsIn`), which is not one it added. An edit is never applied at the
     * save before it, so it starts moved.
     */
    push(touched: Iterable<T>, added?: Iterable<T>, replaced?: ReadonlyMap<T, T>): MarkedEdit;
    /**
     * What a save is about to write: taken when the document is serialized, and committed only once
     * the bytes are on disk. An edit that lands while the write is in flight is not in those bytes,
     * and an undo that lands then does not take its edit out of them.
     */
    snapshot(): SaveSnapshot;
    /** The save of `snapshot` is on disk: what it held is what every later edit is measured from. */
    commit(snapshot: SaveSnapshot): void;
    /** The save of `snapshot` wrote nothing: it is never committed. */
    release(snapshot: SaveSnapshot): void;
    /**
     * The document was replaced by what the disk holds (a revert, or a reload of an outside
     * change): nothing in it differs from the file any more, and no edit made before belongs to
     * the tree it now holds.
     */
    clear(): void;
    /** How many edits are held (see HOW MUCH IS HELD), for the suite to bound. */
    get held(): number;
    /** Hold `entry` again, in its place, if it moved since it was let go. */
    private hold;
    /** Every variable that differs from the saved file, and how. */
    marks(): Map<T, SaveMark>;
}
/**
 * Which of the variables a gesture added are put in the place of another: one whose id (the
 * file's and its name) is a variable's that the gesture took out of the file (`before`, the
 * variables before it, by id; `inFile`, whether one is still in it). Core's retype is the one
 * gesture that does both, and the replacement it makes is of the name of the one it swaps out.
 */
export declare function replacementsIn<T>(before: ReadonlyMap<T, string>, added: Iterable<T>, idOf: (node: T) => string, inFile: (node: T) => boolean): Map<T, T>;
