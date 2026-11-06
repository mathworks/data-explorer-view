// Copyright 2026 The MathWorks, Inc.
//
// Where a link from one open file leads (connect/links.ts): the file a table's link names, beside
// the file it is in or by its uri, and the row to select there; and the path a project page's link
// names from the project's folder. Ported from data-explorer-app's linkPath test.
import { describe, expect, it } from 'vitest';
import { folderOf, linkDestination, projectLinkPath } from '../../src/widgets/app-shell/connect/links.js';

const FROM = '/work/models/ctrl.slx';

describe('linkDestination', () => {
  it('an entry in a file named beside this one', () => {
    expect(linkDestination({ kind: 'entry', name: 'Kp', source: 'params.sldd' }, FROM)).toEqual({
      path: '/work/models/params.sldd',
      select: 'Kp',
    });
  });

  it('an entry in a file named by its URL, prefixed or not', () => {
    const source = 'file:///work/data/my%20plant.sldd';
    expect(linkDestination({ kind: 'entry', name: 'Kp', source }, FROM).path).toBe('/work/data/my plant.sldd');
    expect(linkDestination({ kind: 'entry', name: 'Kp', source: `binedit:${source}` }, FROM).path).toBe('/work/data/my plant.sldd');
  });

  it('a Windows or UNC file, as its uri spells it', () => {
    expect(linkDestination({ kind: 'entry', name: 'Kp', source: 'file:///c%3A/work/plant.sldd' }, 'c:\\work\\ctrl.slx').path).toBe('c:\\work\\plant.sldd');
    expect(linkDestination({ kind: 'file', file: 'file://server/share/x.sldd' }, FROM).path).toBe('\\\\server\\share\\x.sldd');
  });

  it('a block by its key, a workspace parameter by its name', () => {
    expect(linkDestination({ kind: 'block', block: '65', source: 'plant.slx' }, FROM)).toEqual({
      path: '/work/models/plant.slx',
      select: '65',
    });
    expect(linkDestination({ kind: 'workspace', name: 'g', source: 'plant.slx' }, FROM).select).toBe('g');
  });

  it('a file, with no row to select', () => {
    expect(linkDestination({ kind: 'file', file: 'params.sldd' }, FROM)).toEqual({ path: '/work/models/params.sldd' });
    expect(linkDestination({ kind: 'file', file: '/abs/x.mat' }, FROM)).toEqual({ path: '/abs/x.mat' });
  });
});

describe('folderOf', () => {
  it('the folder of a file, by either separator, or none for a bare name', () => {
    expect(folderOf('/work/models/ctrl.slx')).toBe('/work/models');
    expect(folderOf('C:\\work\\ctrl.slx')).toBe('C:\\work');
    expect(folderOf('ctrl.slx')).toBe('');
  });
});

describe('projectLinkPath', () => {
  const ROOT = '/work/My Proj';

  it('a file or a folder in the project, by either separator', () => {
    expect(projectLinkPath(ROOT, 'models/plant.slx')).toBe('/work/My Proj/models/plant.slx');
    expect(projectLinkPath(ROOT, 'models\\plant.slx')).toBe('/work/My Proj/models/plant.slx');
    expect(projectLinkPath(ROOT, 'utils/')).toBe('/work/My Proj/utils');
  });

  it('a referenced project beside it, and names a URL would read otherwise', () => {
    expect(projectLinkPath(ROOT, '../LibProj')).toBe('/work/LibProj');
    expect(projectLinkPath(ROOT, './a/../b#1?.sldd')).toBe('/work/My Proj/b#1?.sldd');
    expect(projectLinkPath(ROOT, '.')).toBe('/work/My Proj');
  });

  it('a project on Windows', () => {
    expect(projectLinkPath('C:\\work\\MyProj', '..\\Lib\\Lib.prj')).toBe('c:\\work\\Lib\\Lib.prj');
  });
});
