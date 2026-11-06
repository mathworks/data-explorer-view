/** How strongly a query matched a text, strongest first. */
export type MatchTier = 'prefix' | 'word' | 'subsequence';
/** A query's match in one text. */
export interface FuzzyMatch {
    /** How strongly it matched. */
    tier: MatchTier;
    /**
     * The indices in the text of the characters the query's letters matched, ascending: what the
     * palette draws in bold. A space in the query matches no character and has no index.
     */
    positions: number[];
}
/** What rankCommands reads of a command: the palette's PaletteCommand is one. */
export interface RankItem {
    /** What the recent list names it by. */
    id: string;
    /** The text the query is matched against first. */
    label: string;
    /** A group name the query is matched against when the label does not match. */
    category?: string;
}
/** A command rankCommands found, with where in its label the query matched. */
export interface Ranked<T> {
    /** The command, as given (not a copy). */
    item: T;
    /** As FuzzyMatch's positions, in the label; empty when the category matched, or the query is empty. */
    positions: number[];
}
/**
 * How `query` matches `text`, or null when it does not: the text holds the query's letters in
 * order, case ignored. An empty query (or spaces alone) matches every text, as a prefix, at no
 * position. A query longer than 200 code units is matched by its first 200. Time and memory grow
 * as the query's length times the text's, whatever the two hold.
 */
export declare function fuzzyMatch(query: string, text: string): FuzzyMatch | null;
/**
 * The commands `query` finds, in the order the palette lists them. For an empty query, every
 * command: those in `recent` first, in its order, then the rest in the order given. Otherwise the
 * commands whose label matches, strongest match first (prefix, then word, then subsequence), then
 * those whose category begins with the query or whose words it begins; within each, those in
 * `recent` first, then the earlier match, then the order given.
 *
 * `recent` is ids, latest first; an id no command has is passed over.
 */
export declare function rankCommands<T extends RankItem>(items: readonly T[], query: string, recent?: readonly string[]): Ranked<T>[];
