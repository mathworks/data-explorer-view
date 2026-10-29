/**
 * The `file:` uri of the file at `path`: what VS Code's `Uri.file(path).toString()` gives.
 *
 * `path` is absolute. A POSIX path is used as it is (`/home/me/plant.sldd` →
 * `file:///home/me/plant.sldd`). A Windows path reads its backslashes as separators, as VS Code
 * does on Windows: `C:\work\plant.sldd` → `file:///c%3A/work/plant.sldd`, and a UNC path
 * `\\server\share\x.sldd` → `file://server/share/x.sldd`. Every character but letters, digits,
 * `-._~` and the separators is percent-encoded: `/u/me@corp/my plant.sldd` →
 * `file:///u/me%40corp/my%20plant.sldd`.
 */
export declare function sourceUri(path: string): string;
/**
 * The path part of a uri, decoded: `file:///fx/my%20plant.mdl` → `/fx/my plant.mdl` (VS Code's
 * `Uri.path`, which for a Windows file is `/c:/work/plant.mdl`). The uri itself when it has no
 * `scheme:` to read past.
 */
export declare function uriPathPart(uri: string): string;
/**
 * The path of the file a `file:` uri names: sourceUri read backwards. For every uri sourceUri
 * writes, `sourceUri(uriPath(uri))` is that uri again; and `uriPath(sourceUri(path))` is `path`,
 * as sourceUri reads it (a drive letter and a UNC host lower-case, a relative path from `/`).
 *
 * A uri with a drive letter gives a Windows path and one with a host a UNC path, with
 * backslashes, as VS Code's `Uri.fsPath` gives them on Windows: `file:///c%3A/work/plant.sldd` →
 * `c:\work\plant.sldd`, `file://server/share/x.sldd` → `\\server\share\x.sldd`. Every other
 * gives a POSIX path: `file:///u/me%40corp/my%20plant.sldd` → `/u/me@corp/my plant.sldd`. (A name
 * that holds a backslash cannot be in a Windows path, so such a uri gives its POSIX spelling,
 * which sourceUri reads back the same.)
 *
 * It takes a link's source as it comes too, a core source id: `binedit:` and a uri
 * (srcIdToUriString). Anything that is not a `file:` uri (a path, a bare name, another scheme)
 * is given back as it is.
 */
export declare function uriPath(uri: string): string;
