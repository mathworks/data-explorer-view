/**
 * The section name of a document that has no sections: a MAT-file, whose variables are its
 * root node's own children. Its clipboard and drag items carry it as their source section, and
 * the clip mark keys its variables with it (rowStamp.ts), so a same-file move is the usual
 * same-section no-op and nothing downstream needs a case of its own.
 *
 * Here rather than beside the rule that carries it because both sides of the postMessage
 * spell it: the host posts its one rule under it (sectionRules.wholeFileRules) and the
 * webview finds that rule by it (table-main's wholeFileRule). Two copies of '' would be the
 * same rule along two paths with nothing to say they agree.
 */
export declare const WHOLE_FILE_SECTION = "";
/** The prefix that marks a row id as a section header. */
export declare const SECTION_ROW_PREFIX = "section:";
/** Build a section header row id from a section name. */
export declare function buildSectionRowId(name: string): string;
/** True if `id` is a section header row id. */
export declare function isSectionRowId(id: string): boolean;
/** Extract the section name from a section row id, or null if it isn't one. */
export declare function sectionNameFromRowId(id: string): string | null;
