// Copyright 2026 The MathWorks, Inc.
//
// The Explorer's files, as data (connect/explorerFiles.ts): one per open tab, under the heading of
// its kind, with the icon its kind has in the tab row too, its unsaved mark, and its sections: the
// top-level rows of its table's paint that are sections (a dictionary's Design Data, a model's
// Model Workspace), none for a MAT-file, whose top-level rows are its variables. And the words the
// status bar says the kind of the active file in.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { FILE_FORMATS, FILE_ICONS, explorerFiles, fileGroupOf } from '../../src/widgets/app-shell/connect/explorerFiles.js';

const row = (ID: string, parent: string | null, label: string, iconId?: string): TreeTableRow =>
  ({ ID, parent, Name: { label, ...(iconId ? { iconId } : {}) } }) as TreeTableRow;

describe('fileGroupOf', () => {
  it('names the heading a file goes under, by its name', () => {
    expect(['/w/a.slx', '/w/b.MDL', '/w/c.sldd', 'C:\\w\\d.mat', '/w/p/matlab.toml', '/w/Proj.prj', '/w/notes.txt'].map(fileGroupOf)).toEqual([
      'model',
      'model',
      'sldd',
      'mat',
      'project',
      'project',
      'other',
    ]);
  });

  it('gives each kind an icon the package ships, and a format the status bar says', () => {
    const shipped = new Set(readdirSync(join(process.cwd(), 'icons')).map((f) => f.replace(/\.svg$/, '')));
    expect(FILE_ICONS).toEqual({
      model: 'simulinkModel_FT',
      sldd: 'simulinkDataDictionary_FT',
      mat: 'matlabWorkspaceFile',
      project: 'simulink_project',
    });
    expect(Object.values(FILE_ICONS).filter((icon) => !shipped.has(icon))).toEqual([]);
    expect(FILE_FORMATS).toEqual({ model: 'Simulink model', sldd: 'Data dictionary', mat: 'MAT-file', project: 'Project' });
  });
});

describe('explorerFiles', () => {
  it('lists each tab by its id, name, path and kind, in the order of the tabs', () => {
    const files = explorerFiles([
      { id: 't1', path: '/w/params.sldd', name: 'params.sldd' },
      { id: 't2', path: '/w/plant.slx', name: 'plant.slx', dirty: true },
      { id: 't3', path: '/w/Plant/matlab.toml', name: 'Plant' },
      { id: 't4', path: '/w/run.mat', name: 'run.mat' },
    ]);
    expect(files).toEqual([
      { id: 't1', label: 'params.sldd', title: '/w/params.sldd', group: 'sldd', icon: 'simulinkDataDictionary_FT', dirty: false, sections: [] },
      { id: 't2', label: 'plant.slx', title: '/w/plant.slx', group: 'model', icon: 'simulinkModel_FT', dirty: true, sections: [] },
      { id: 't3', label: 'Plant', title: '/w/Plant/matlab.toml', group: 'project', icon: 'simulink_project', dirty: false, sections: [] },
      { id: 't4', label: 'run.mat', title: '/w/run.mat', group: 'mat', icon: 'matlabWorkspaceFile', dirty: false, sections: [] },
    ]);
  });

  it("gives a file the sections its paint's top-level rows are, by their row ids, labels and icons", () => {
    const rows = [
      row('section:design', null, 'Design Data', 'dictionary_section'),
      row('e1', 'section:design', 'Kp'),
      row('section:config', null, 'Configurations'),
      // A top-level row that is no section (none in a dictionary, but nothing says so) is no section.
      row('loose', null, 'Loose'),
    ];
    const [file] = explorerFiles([{ id: 't1', path: '/w/params.sldd', name: 'params.sldd', rows }]);
    expect(file!.sections).toEqual([
      { id: 'section:design', label: 'Design Data', icon: 'dictionary_section' },
      { id: 'section:config', label: 'Configurations' },
    ]);
  });

  it("gives a MAT-file none: its top-level rows are its variables", () => {
    const rows = [row('section:x', null, 'Looks like one'), row('v1', null, 'ParamMat')];
    expect(explorerFiles([{ id: 't1', path: '/w/run.mat', name: 'run.mat', rows }])[0]!.sections).toEqual([]);
  });
});
