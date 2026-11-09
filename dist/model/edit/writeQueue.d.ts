/** A run's hold on the queue, let go: the next edit may start. Calling it again does nothing. */
export type Release = () => void;
/** One document's edits, one text state at a time. */
export declare class WriteQueue {
    /** Settled once the last run asked for has settled or released its turn. Never rejects. */
    private chain;
    /** How many runs hold or wait for a turn. */
    private queued;
    /**
     * Run `run` once every run asked for before it has settled or let its turn go; at once, in this
     * run, when `now` and none holds or waits for one. Answers what `run` answers: a throw, even one
     * before its first await, is the answer's rejection, and the queue goes on. The run is counted
     * before it starts, so one asked for from inside it (a listener of the paint it makes) waits for
     * it. `run` is handed its `release`, to let the next start before it has settled.
     */
    enqueue<T>(run: (release: Release) => Promise<T>, now?: boolean): Promise<T>;
}
