/** Whether `text` holds a line break of any kind (LF, CRLF or a lone CR). */
export declare function hasLineBreak(text: string): boolean;
/**
 * What to post for `typed`, read back from a textarea seeded with `held`. `held` itself where the
 * two differ only in how their line breaks are spelled: nothing was edited, so the caller posts
 * nothing. Otherwise `typed` with each line break spelled as `held` spelled it, matched by the
 * lines around it rather than by its place in the list, so that a line added or removed in a text
 * mixing two kinds leaves every other break as it was: the lines `typed` begins with as `held`
 * does keep the breaks after them, and the lines it ends with as `held` does keep the breaks
 * before them. A break between edited lines is spelled as most of `held`'s are (the first such
 * kind, on a tie), and as LF, MATLAB's `newline`, where `held` has none.
 */
export declare function withHeldLineBreaks(typed: string, held: string): string;
