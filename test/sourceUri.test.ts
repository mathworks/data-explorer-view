// Copyright 2026 The MathWorks, Inc.
//
// sourceUri spells a path as VS Code's `Uri.file(path).toString()` does. The pairs below are what
// vscode-uri 3.1.0 (the package VS Code's own `Uri` is published as) answered for each path, POSIX
// paths with its POSIX rules and Windows paths with its Windows ones: the encoding a link target
// is split by, so a page and the extension give one file one identity. uriPath reads each one
// back.
import { describe, expect, it } from 'vitest';
import { parseLinkTarget, sourceUri, srcIdToUriString, uriPath } from '../src/model/index.js';
import { binaryEditSrcId } from '../src/host/index.js';
import { uriPathPart } from '../src/model/source/sourceUri.js';

const POSIX: [string, string][] = [
  ["/fx/test/fixtures/params.sldd", "file:///fx/test/fixtures/params.sldd"],
  ["/u/me@corp/x.sldd", "file:///u/me%40corp/x.sldd"],
  ["/a b/c#d/e?f.sldd", "file:///a%20b/c%23d/e%3Ff.sldd"],
  ["/x/[1]/{2}/(3)/plant.slx", "file:///x/%5B1%5D/%7B2%7D/%283%29/plant.slx"],
  ["/!$&'()*+,;=/%25/%/^/`/|/\"/<>.mat", "file:///%21%24%26%27%28%29%2A%2B%2C%3B%3D/%2525/%25/%5E/%60/%7C/%22/%3C%3E.mat"],
  ["/ünï/cødé/日本語/𝄞.sldd", "file:///%C3%BCn%C3%AF/c%C3%B8d%C3%A9/%E6%97%A5%E6%9C%AC%E8%AA%9E/%F0%9D%84%9E.sldd"],
  ["/back\\slash/x.mdl", "file:///back%5Cslash/x.mdl"],
  ["/C:/upper/x.sldd", "file:///c%3A/upper/x.sldd"],
  ["/~user/.hidden/-_./x", "file:///~user/.hidden/-_./x"],
  ["//server/share/x.sldd", "file://server/share/x.sldd"],
  ["//SERVER:8080/share/x", "file://server:8080/share/x"],
  ["//user@Host/s/x", "file://user@host/s/x"],
  ["//u:p@h/s", "file://u:p@h/s"],
  ["/", "file:///"],
  ["/plant.sldd", "file:///plant.sldd"],
  ["/my plant.sldd", "file:///my%20plant.sldd"],
  ["relative/x.sldd", "file:///relative/x.sldd"],
  ["/tab\there/x", "file:///tab%09here/x"],
  ["/new\nline", "file:///new%0Aline"],
  ["/x/a+b=c&d.sldd", "file:///x/a%2Bb%3Dc%26d.sldd"],
];

const WINDOWS: [string, string][] = [
  ["C:\\work\\plant.sldd", "file:///c%3A/work/plant.sldd"],
  ["c:\\Users\\me@corp\\my plant.sldd", "file:///c%3A/Users/me%40corp/my%20plant.sldd"],
  ["D:/fwd/slash.slx", "file:///d%3A/fwd/slash.slx"],
  ["\\\\server\\share\\x.sldd", "file://server/share/x.sldd"],
  ["\\\\Server\\Share\\a b#c.mat", "file://server/Share/a%20b%23c.mat"],
  ["Z:\\", "file:///z%3A/"],
  ["C:\\ünï\\[x]\\(y).mdl", "file:///c%3A/%C3%BCn%C3%AF/%5Bx%5D/%28y%29.mdl"],
];

describe('sourceUri', () => {
  it.each(POSIX)('a POSIX path: %j', (path, uri) => {
    expect(sourceUri(path)).toBe(uri);
  });

  it.each(WINDOWS)('a Windows path: %j', (path, uri) => {
    expect(sourceUri(path)).toBe(uri);
  });
  it('leaves no `@` for a link target to split at but the one before the uri', () => {
    const target = `Kp@${sourceUri('/u/me@corp/my plant.sldd')}`;
    expect(target.slice(target.lastIndexOf('@') + 1)).toBe('file:///u/me%40corp/my%20plant.sldd');
  });
});

describe('uriPathPart', () => {
  it("is the uri's path, decoded", () => {
    expect(uriPathPart('file:///fx/my%20plant%40v2.mdl')).toBe('/fx/my plant@v2.mdl');
    expect(uriPathPart('file://server/share/x.sldd')).toBe('/share/x.sldd');
    expect(uriPathPart(sourceUri('C:\\work\\plant.sldd'))).toBe('/c:/work/plant.sldd');
    expect(uriPathPart('untitled:plant.sldd')).toBe('plant.sldd');
    expect(uriPathPart('plant.sldd')).toBe('plant.sldd');
    expect(uriPathPart('file:///bad%E0%A4%A')).toBe('/bad%E0%A4%A');
  });
});

describe('uriPath', () => {
  // What it gives for each path above, where that is not the path as written: the path as
  // sourceUri read it. A drive letter and a host are lower-case, a relative path is from `/`, and a
  // POSIX path with a drive letter or a host (`//server/…`) names what a Windows one would.
  const READ_AS: Record<string, string> = {
    '/C:/upper/x.sldd': 'c:\\upper\\x.sldd',
    '//server/share/x.sldd': '\\\\server\\share\\x.sldd',
    '//SERVER:8080/share/x': '\\\\server:8080\\share\\x',
    '//user@Host/s/x': '\\\\user@host\\s\\x',
    '//u:p@h/s': '\\\\u:p@h\\s',
    'relative/x.sldd': '/relative/x.sldd',
    'C:\\work\\plant.sldd': 'c:\\work\\plant.sldd',
    'D:/fwd/slash.slx': 'd:\\fwd\\slash.slx',
    '\\\\Server\\Share\\a b#c.mat': '\\\\server\\Share\\a b#c.mat',
    'Z:\\': 'z:\\',
    'C:\\ünï\\[x]\\(y).mdl': 'c:\\ünï\\[x]\\(y).mdl',
  };

  it.each([...POSIX, ...WINDOWS])('reads %j back from its uri, which sourceUri writes again', (path, uri) => {
    expect(uriPath(uri)).toBe(READ_AS[path] ?? path);
    expect(sourceUri(uriPath(uri))).toBe(uri);
  });

  it('pins all 27 of them, and every one it reads differently is one of them', () => {
    const paths = [...POSIX, ...WINDOWS].map(([path]) => path);
    expect(paths).toHaveLength(27);
    expect(Object.keys(READ_AS).filter((p) => !paths.includes(p))).toEqual([]);
  });

  it.each([...POSIX, ...WINDOWS])("reads the file out of every kind of link into %j: an entry's, a block's, a workspace's, an editable copy's", (_path, uri) => {
    for (const srcId of [uri, binaryEditSrcId(uri)]) {
      for (const target of [`Kp@${srcId}`, `blocks:65@${srcId}`, `workspace:k@${srcId}`]) {
        const link = parseLinkTarget(target);
        expect(link.kind === 'file' ? link.file : link.source, target).toBe(srcId);
        if (link.kind === 'file') continue;
        expect(uriPath(link.source), target).toBe(uriPath(uri));
        expect(uriPath(srcIdToUriString(link.source)), target).toBe(uriPath(uri));
      }
    }
  });

  it('spells a name that holds a backslash as POSIX, which sourceUri reads back the same', () => {
    for (const uri of ['file:///c%3A/a%5Cb.sldd', 'file://host/a%5Cb.sldd', 'file://h%5Cx/s.sldd']) {
      expect(sourceUri(uriPath(uri))).toBe(uri);
    }
    expect(uriPath('file:///c%3A/a%5Cb.sldd')).toBe('/c:/a\\b.sldd');
    expect(uriPath('file://host/a%5Cb.sldd')).toBe('//host/a\\b.sldd');
  });

  it('gives back what is not a file uri, and reads one of its own however it is spelt', () => {
    for (const text of ['plant.slx', '/w/plant.sldd', 'C:\\work\\plant.sldd', 'untitled:plant.sldd', '']) {
      expect(uriPath(text)).toBe(text);
    }
    expect(uriPath('FILE:///w/plant.sldd')).toBe('/w/plant.sldd');
    expect(uriPath('file:///w/plant.sldd?dexHealth=cycle#x')).toBe('/w/plant.sldd');
    expect(uriPath('file:///C:/w/plant.sldd')).toBe('c:\\w\\plant.sldd');
    expect(uriPath('file://server')).toBe('\\\\server\\');
    expect(uriPath('file:///bad%E0%A4%A')).toBe('/bad%E0%A4%A');
  });
});
