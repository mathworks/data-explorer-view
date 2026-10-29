import type { ParseWarning } from 'data-explorer-core';
/**
 * How many individual messages the banner spells out. A `.mat` with a truncated
 * record tail can report a warning per variable, and a banner tall enough to hold
 * twenty of them is a banner that hides the table it is describing. The count in
 * the headline is never capped, so the cap can shorten the list without ever
 * understating the loss.
 */
export declare const MAX_BANNER_DETAILS = 5;
/** The parse-warning banner a table view renders above its rows. */
export interface WarningBanner {
    /** One line: what was lost, in total. Always present. */
    headline: string;
    /** Core's own per-warning messages, deduped and capped. May be empty. */
    details: string[];
}
/**
 * Refuse a source the reader could not read.
 *
 * The binary dictionary readers, the `.mdl` reader and the project reader all
 * recover from a source they cannot read and answer an EMPTY result with a
 * `source-unreadable` warning — right where they live, because a bad file in a
 * workspace scan should not take the scan down and the warning can name the file.
 * This is the boundary that turns that back into a failure, for every format at
 * once, because every caller here either skips the file, refuses to save it, or
 * paints an error.
 *
 * `part-unreadable` deliberately does not qualify: it is one piece of a source
 * whose other pieces are all there, and refusing the whole file for it would lose
 * far more than it reports.
 */
export declare function refuseIfUnreadable(warnings: ParseWarning[] | undefined): void;
/**
 * The warnings a registered source node carries, or none.
 *
 * `ISourceNode.warnings` is ABSENT on a clean read rather than empty — core made
 * that choice so a host cannot read a `[]` from a reader with no diagnostics
 * channel as proof the file was whole — so every consumer has to cope with the
 * field not being there. Doing it once here is what stops three providers each
 * writing their own optional chain.
 */
export declare function sourceWarnings(node: unknown): ParseWarning[];
/**
 * The banner for a source's warnings, or undefined when there is nothing to say.
 *
 * The headline is a source-level warning's own message when there is one, because
 * core writes those as a whole sentence about the whole file ("…so this project
 * reads as empty") and that is the larger fact; otherwise it counts the parts that
 * could not be read. A shared name (`duplicate-id`) is not one of those: it gets a
 * headline of its own when it is all there is, and otherwise only a line below. The
 * details are core's messages verbatim — each already names what it is about, so the
 * `part` field is used to tell two warnings apart here and never rendered.
 *
 * Values shown without rows (`part-not-expanded`) are not a loss either. The warning has
 * the headline when it is the only one; otherwise its line goes last, after the cap, so a
 * long list of losses cannot hide it and the withheld count never includes it.
 */
export declare function warningBanner(warnings: ParseWarning[] | undefined): WarningBanner | undefined;
