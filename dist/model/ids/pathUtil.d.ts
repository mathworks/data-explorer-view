/** Last segment of a path (splits on both `/` and `\`). Returns `p` if no separator. */
export declare function basename(p: string): string;
/** Directory portion of a forward-slash path (mirrors graphModel's original dirnameOf). */
export declare function dirname(p: string): string;
/**
 * A project-store path, split into the segments needed to join it onto a base URI.
 *
 * Both separators, because a project written on Windows spells its paths with `\`
 * and the same store opens on macOS — a single unsplit segment would join as one
 * literal filename containing backslashes and resolve to nothing.
 *
 * `..` is deliberately KEPT, not rejected: a project's references legitimately live
 * outside its own root (`../OtherProject/other.prj` is what MATLAB writes), so a
 * guard against escaping the root would break the one section that needs to.
 *
 * Empty segments are dropped, so a doubled or trailing separator resolves the same
 * as the path a user would have typed.
 */
export declare function projectPathSegments(relPath: string): string[];
/** Basename of a URI string, stripping any `?query` or `#hash` first. */
export declare function uriBasename(uriString: string): string;
/**
 * The last segment of a uri's path, decoded: what `basename(uri.path)` gives for a VS Code uri, whose
 * `path` is decoded. The path is the uri after its scheme and authority, before any `?query` or
 * `#fragment`; decoded first and split after (on both separators, as `basename` splits), so an
 * encoded separator in it splits as VS Code's does. Empty for a uri whose path ends in `/`.
 */
export declare function uriPathBasename(uriString: string): string;
