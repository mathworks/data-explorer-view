// Copyright 2026 The MathWorks, Inc.
//
// sourceUri spells a path as VS Code's `Uri.file(path).toString()` does. The pairs below are what
// vscode-uri 3.1.0 (the package VS Code's own `Uri` is published as) answered for each path, POSIX
// paths with its POSIX rules and Windows paths with its Windows ones: the encoding a link target
// is split by, so a page and the extension give one file one identity.
import { describe, expect, it } from 'vitest';
import { sourceUri } from '../src/model/index.js';
import { uriPath } from '../src/model/source/sourceUri.js';

describe('sourceUri', () => {
  it.each([
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
  ])('a POSIX path: %j', (path, uri) => {
    expect(sourceUri(path)).toBe(uri);
  });

  it.each([
    ["C:\\work\\plant.sldd", "file:///c%3A/work/plant.sldd"],
    ["c:\\Users\\me@corp\\my plant.sldd", "file:///c%3A/Users/me%40corp/my%20plant.sldd"],
    ["D:/fwd/slash.slx", "file:///d%3A/fwd/slash.slx"],
    ["\\\\server\\share\\x.sldd", "file://server/share/x.sldd"],
    ["\\\\Server\\Share\\a b#c.mat", "file://server/Share/a%20b%23c.mat"],
    ["Z:\\", "file:///z%3A/"],
    ["C:\\ünï\\[x]\\(y).mdl", "file:///c%3A/%C3%BCn%C3%AF/%5Bx%5D/%28y%29.mdl"],
  ])('a Windows path: %j', (path, uri) => {
    expect(sourceUri(path)).toBe(uri);
  });

  it('leaves no `@` for a link target to split at but the one before the uri', () => {
    const target = `Kp@${sourceUri('/u/me@corp/my plant.sldd')}`;
    expect(target.slice(target.lastIndexOf('@') + 1)).toBe('file:///u/me%40corp/my%20plant.sldd');
  });
});

describe('uriPath', () => {
  it("is the uri's path, decoded", () => {
    expect(uriPath('file:///fx/my%20plant%40v2.mdl')).toBe('/fx/my plant@v2.mdl');
    expect(uriPath('file://server/share/x.sldd')).toBe('/share/x.sldd');
    expect(uriPath(sourceUri('C:\\work\\plant.sldd'))).toBe('/c:/work/plant.sldd');
    expect(uriPath('untitled:plant.sldd')).toBe('plant.sldd');
    expect(uriPath('plant.sldd')).toBe('plant.sldd');
    expect(uriPath('file:///bad%E0%A4%A')).toBe('/bad%E0%A4%A');
  });
});
