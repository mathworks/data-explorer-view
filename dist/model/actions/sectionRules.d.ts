import { WHOLE_FILE_SECTION } from '../ids/sectionRowId.js';
export interface SectionRule {
    sectionName: string;
    sectionLabel: string;
    isDerived: boolean;
    allowedTypes: string[];
}
export declare function sectionRules(model: any): SectionRule[];
export { WHOLE_FILE_SECTION };
/**
 * The rules for a document with no section layer: ONE rule, the whole file, which is the one
 * place a paste or a drop into it can land. Posted by the MAT-file's host the way a
 * dictionary's posts `sectionRules`; the webview reads a '' rule as "this table is one target"
 * (table-main's sectionRuleForRow), and no dictionary posts one.
 *
 * `label` is what the drop tooltip and the Paste item name the target by — the file's name,
 * since the file is the target. `allowedTypes` is what core says the file admits to a paste
 * (getAdmittedTypes), for the reason sectionRules reads a section's: the cursor and Paste must
 * predict what core's paste takes. A core without that list restricts nothing here (an empty
 * list), deliberately NOT the creation list the gallery reads (getAllowedTypes): offering a
 * paste core then refuses in its own words is recoverable, refusing one core would take is
 * not even visible.
 */
export declare function wholeFileRules(model: any, label: string): SectionRule[];
