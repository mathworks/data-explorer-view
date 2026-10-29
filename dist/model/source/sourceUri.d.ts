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
 * The path a uri names, decoded: `file:///fx/my%20plant.mdl` → `/fx/my plant.mdl` (VS Code's
 * `Uri.path`). The uri itself when it has no `scheme:` to read past.
 */
export declare function uriPath(uri: string): string;
