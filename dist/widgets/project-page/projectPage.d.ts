import type { ProjectPage } from 'data-explorer-core';
import type { MspProject } from '../../model/ids/msp.js';
import type { WarningBanner } from '../../model/rows/parseWarnings.js';
/** A filter box appears above this many items. */
export declare const FILTER_THRESHOLD = 8;
/** Rows rendered before a "Show all" button takes over. */
export declare const ROW_CAP = 30;
/** Per-section UI state, owned by the caller so a repaint does not reset it. */
export interface SectionState {
    query: string;
    expanded: boolean;
}
/** Every section's state, keyed by section id. */
export type PageState = Record<string, SectionState>;
export declare function newSectionState(): SectionState;
/**
 * Everything that reaches the markup, escaped — the page's single rule.
 *
 * Numbers are accepted, not just strings, so a count is escaped by the same call as
 * the name beside it. Counts look exempt — a count is declared a number, and a number
 * cannot carry a `<` — but that type is a claim core's parser makes, and this
 * page sits on the far side of a postMessage boundary, where the payload is JSON and
 * nothing re-checks the declaration. While this took `string` only, a count could not
 * use it and was concatenated bare instead; `memberCount` then rendered escaped in the
 * identity block and raw in the Labels header, one field under two rules, and the
 * second was the wrong one (CodeQL js/xss, 2026-10-01).
 *
 * `null` is NOT in the parameter type and must not be added. `memberCount` and friends are
 * nullable for a format that records no member list, and this signature is what turns one
 * of them reaching the markup into a compile error at the call site instead of the word
 * 'null' on a customer's page — core's ProjectPage.memberCount relies on that by name.
 * Widening here, or defaulting the argument, moves the decision out of the renderer that
 * has to make it (see labelsSection).
 *
 * `'` is deliberately absent: every attribute written here is double-quoted, and the
 * test that pins that is the reminder to keep it so.
 */
export declare function esc(s: string | number): string;
/**
 * Split a filter query into terms.
 *
 * Bare terms only: whitespace-separated, case-insensitive substring, ANDed. This is
 * deliberately NOT the table's `rowFilter.ts` grammar, which is column-aware
 * (`Name:foo`, comparison operators) and needs each row to be a record of named
 * columns. A page section is not a table — Project Path rows have one field, Labels
 * are chips and are not filtered at all — so adopting that grammar would mean
 * inventing column names per section to expose a syntax nobody asked for. What IS
 * shared is the part a user actually types: several words, all of which must appear.
 */
export declare function filterTerms(query: string): string[];
/**
 * Escaped `text` with every occurrence of every term wrapped in `<mark>`.
 *
 * Overlapping and adjacent hits are merged before wrapping. Two terms that overlap
 * in one word (`sup` and `upp` in "support") would otherwise emit nested or
 * interleaved marks, i.e. broken markup, from input the user typed by accident.
 */
export declare function highlight(text: string, terms: string[]): string;
/** Everything the host tells the page, i.e. `setProject` minus its `type`. */
export interface ProjectPagePayload {
    page: ProjectPage;
    /**
     * The project's folder, as a path to show under its name. Only the host knows it —
     * the store records nothing absolute, by design, so a project stays portable.
     */
    root: string;
    /**
     * What a Managed Simulink Project adds, absent for every project that is not one.
     * Every MSP-specific pixel on this page is behind a check on this key.
     */
    msp?: MspProject;
    /** What the parse could not read; absent after a clean read. */
    warnings?: WarningBanner;
}
/** How the page words what it says of the app around it. */
export interface ProjectPageOptions {
    /**
     * The place a Locations link to a folder reveals it in, as its tooltip names it: "Reveals
     * `cache` in the Explorer". Default `'the Explorer'`; an app says `'Finder'` or `'the file
     * manager'`.
     */
    revealIn?: string;
}
/** The whole page. */
export declare function renderProjectPage(payload: ProjectPagePayload, state: PageState, options?: ProjectPageOptions): string;
