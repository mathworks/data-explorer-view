// Copyright 2026 The MathWorks, Inc.
//
// The uri a file is opened under, spelled as VS Code spells it.
//
// A document's uri is its identity: row ids begin with it, and a link target is
// `<name>@<uri>` (`blocks:<sid>@<uri>`, `workspace:<name>@<uri>`), which is split at its LAST
// `@`. So a uri must not hold a raw `@` (`file:///u/me@corp/x.sldd` would split inside the
// path), nor a raw `#` or `?`, which end a uri's path. VS Code's `Uri.file(path).toString()`
// percent-encodes all of them, and every file the extension opens is named that way; this is the
// same spelling, so a file opened in a page and in the extension has one identity. Node's
// `pathToFileURL` and `encodeURI` keep `@` (and other characters) raw, and are not.

import { srcIdToUriString } from '../ids/srcId.js';

// The characters a uri component keeps as they are (RFC 3986 unreserved), and in a path `/`.
const KEPT = /^[A-Za-z0-9\-._~]$/;

// What VS Code writes for the reserved characters it encodes itself; any other character is
// `encodeURIComponent`'s (a space is %20 either way; non-ASCII is its UTF-8 bytes).
const ESCAPES: Record<string, string> = {
  ':': '%3A', '/': '%2F', '?': '%3F', '#': '%23', '[': '%5B', ']': '%5D', '@': '%40',
  '!': '%21', $: '%24', '&': '%26', "'": '%27', '(': '%28', ')': '%29', '*': '%2A',
  '+': '%2B', ',': '%2C', ';': '%3B', '=': '%3D', ' ': '%20',
};

function encodePart(text: string, kept: string): string {
  let out = '';
  for (const ch of text) {
    if (KEPT.test(ch) || kept.includes(ch)) out += ch;
    else out += ESCAPES[ch] ?? encodeURIComponent(ch);
  }
  return out;
}

// `C:\…`, `C:/…` or `\\server\share\…`: a path as Windows writes one, whose backslashes are
// separators. Every other path is POSIX, where a backslash is a character of a name.
const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;

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
export function sourceUri(path: string): string {
  let p = WINDOWS_PATH.test(path) ? path.replace(/\\/g, '/') : path;
  let authority = '';
  if (p.startsWith('//')) {
    const end = p.indexOf('/', 2);
    authority = end === -1 ? p.slice(2) : p.slice(2, end);
    p = end === -1 ? '/' : p.slice(end) || '/';
  }
  if (!p.startsWith('/')) p = `/${p}`;
  // A drive letter is written lower-case.
  if (p.length >= 3 && p[2] === ':' && p[1] >= 'A' && p[1] <= 'Z') p = `/${p[1].toLowerCase()}${p.slice(2)}`;
  return `file://${encodeAuthority(authority)}${encodePart(p, '/')}`;
}

/** A UNC host, as VS Code writes it: lower-case, a port kept, user info encoded apart. */
function encodeAuthority(authority: string): string {
  if (!authority) return '';
  let out = '';
  let host = authority;
  const at = host.indexOf('@');
  if (at !== -1) {
    const user = host.slice(0, at);
    host = host.slice(at + 1);
    const colon = user.lastIndexOf(':');
    out += colon === -1 ? encodePart(user, '') : `${encodePart(user.slice(0, colon), '')}:${encodePart(user.slice(colon + 1), '[]:')}`;
    out += '@';
  }
  host = host.toLowerCase();
  const colon = host.lastIndexOf(':');
  return colon === -1 ? out + encodePart(host, '[]:') : out + encodePart(host.slice(0, colon), '[]:') + host.slice(colon);
}

/**
 * The path part of a uri, decoded: `file:///fx/my%20plant.mdl` → `/fx/my plant.mdl` (VS Code's
 * `Uri.path`, which for a Windows file is `/c:/work/plant.mdl`). The uri itself when it has no
 * `scheme:` to read past.
 */
export function uriPathPart(uri: string): string {
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/[^/?#]*)?([^?#]*)/.exec(uri);
  if (!m) return uri;
  return decode(m[1]);
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

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
export function uriPath(uri: string): string {
  const m = /^file:\/\/([^/?#]*)([^?#]*)/i.exec(srcIdToUriString(uri));
  if (!m) return uri;
  const host = decode(m[1]);
  const path = decode(m[2]) || '/';
  // A UNC path, and a drive letter's, unless a backslash in it would read as a separator.
  if (host) {
    const posix = `//${host}${path}`;
    return posix.includes('\\') ? posix : posix.replace(/\//g, '\\');
  }
  if (/^\/[A-Za-z]:\//.test(path) && !path.includes('\\')) {
    return `${path[1].toLowerCase()}${path.slice(2)}`.replace(/\//g, '\\');
  }
  return path;
}
