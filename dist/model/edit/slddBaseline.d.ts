/** What the file on disk holds, entry by entry, for one document's Status column. */
export declare class EntryBaseline {
    private baseline;
    /** Capture the model's entries as the last-saved baseline. */
    capture(model: any): void;
    /**
     * The names of the entries whose serialization differs from the baseline (or that it has no
     * entry for: newly added). Empty when no baseline was ever captured.
     */
    modified(model: any): Set<string>;
    /**
     * Whether ONE entry differs from the baseline: what an entry-scoped repaint asks, which must not
     * serialize every entry of the dictionary to answer about one. False with no baseline.
     */
    isModified(entry: any): boolean;
    /** Drop the baseline (the last view of the document closed). */
    clear(): void;
}
