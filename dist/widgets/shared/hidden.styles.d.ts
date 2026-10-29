/**
 * The `hidden` attribute, honoured.
 *
 * The browser hides `[hidden]` with a user-agent rule, and every widget's own `:host` rule sets
 * `display`, which beats it: `table.hidden = true` used to leave the table on screen. Important,
 * so it also beats a page rule that gives the element a display of its own — hidden means hidden,
 * as it does on a plain element. Each widget lists this first in its styles.
 */
export declare const hiddenStyles: import("lit").CSSResult;
