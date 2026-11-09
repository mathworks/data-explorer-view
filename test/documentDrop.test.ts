// Copyright 2026 The MathWorks, Inc.
//
// documentDrop: where a drop onto a document AS A WHOLE lands, and what it would do there. An app's
// list of its open files (the app shell's Explorer) has a row for each file beside the rows of its
// sections, and a drop on the file's row has to land in one section. The rule, as the prototype's
// paste into a file had it: a document that is one target (a MAT-file) takes it there; else the
// section every dragged entry came from, where the document has it and it takes them, so a move onto
// the file it came from is the no-op it is and a configuration set goes among the sets; else the
// first section that takes them; else a refusal that says why. What a section takes is
// dropDecision's, asked as a drop on its heading would ask it, so the file's row never invites a drop
// its section's row refuses.
import { describe, expect, it } from 'vitest';
import { documentDrop } from '../src/model/actions/documentDrop.js';
import type { DragItem, DragSource } from '../src/model/actions/dropDecision.js';
import type { SectionRule } from '../src/model/actions/sectionRules.js';

const DESIGN: SectionRule = { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: ['MatlabVariable', 'Simulink.Parameter'] };
const ARCH: SectionRule = { sectionName: 'arch', sectionLabel: 'Architectural Data', isDerived: true, allowedTypes: ['Constant', 'Simulink.Signal'] };
const CONFIG: SectionRule = { sectionName: 'config', sectionLabel: 'Configurations', isDerived: false, allowedTypes: ['Simulink.ConfigSet'] };
const DICTIONARY = [DESIGN, ARCH, CONFIG];
const WHOLE: SectionRule = { sectionName: '', sectionLabel: 'v.mat', isDerived: false, allowedTypes: [] };

const PARAM: DragItem = { className: 'Simulink.Parameter', arrayClass: 'Simulink.Parameter', kind: 'Simulink Parameter', isMatlabVariable: false, isScalarNumeric: false };
const CONFIG_SET: DragItem = { className: 'Simulink.ConfigSet', arrayClass: 'Simulink.ConfigSet', kind: 'Configuration', isMatlabVariable: false, isScalarNumeric: false };
const VARIABLE: DragItem = { className: 'double', arrayClass: '', kind: 'MATLAB Variable', isMatlabVariable: true, isScalarNumeric: true };
const BUS: DragItem = { className: 'Simulink.Bus', arrayClass: 'Simulink.Bus', kind: 'Bus', isMatlabVariable: false, isScalarNumeric: false };

const from = (docUri: string, section: string, ...items: DragItem[]): DragSource => ({ docUri, items: items.map((it) => ({ ...it, sectionName: section })) });

describe('where a drop onto a whole document lands', () => {
  it('a document that is one target takes it there, whatever its other rules', () => {
    const drop = documentDrop(from('a.sldd', 'design', PARAM), 'v.mat', [WHOLE], 'move');
    expect(drop?.sectionName).toBe('');
    expect(drop?.decision).toMatchObject({ canDrop: true, cursor: 'move', tooltip: 'Move Simulink Parameter' });
  });

  it('an entry goes into the section of its own name, where the document has one that takes it', () => {
    expect(documentDrop(from('a.sldd', 'design', PARAM), 'b.sldd', DICTIONARY, 'copy')).toMatchObject({
      sectionName: 'design',
      decision: { canDrop: true, cursor: 'copy', tooltip: 'Copy Simulink Parameter' },
    });
    // Not the first section: a configuration set goes among the sets.
    expect(documentDrop(from('a.sldd', 'config', CONFIG_SET), 'b.sldd', DICTIONARY, 'move')?.sectionName).toBe('config');
  });

  it('is the no-op it is for a move onto the document every entry came from, in its own section', () => {
    expect(documentDrop(from('a.sldd', 'design', PARAM), 'a.sldd', DICTIONARY, 'move')).toMatchObject({
      sectionName: 'design',
      decision: { canDrop: false, noop: true, tooltip: '' },
    });
    // A copy there is a real duplicate.
    expect(documentDrop(from('a.sldd', 'design', PARAM), 'a.sldd', DICTIONARY, 'copy')?.decision).toMatchObject({ canDrop: true, noop: false });
  });

  it('an entry from a section the document lacks goes into the first section that takes it', () => {
    // A MAT-file's variable (its section is ''), and a model's workspace variable, into a dictionary.
    expect(documentDrop(from('v.mat', '', VARIABLE), 'b.sldd', DICTIONARY, 'move')?.sectionName).toBe('design');
    expect(documentDrop(from('m.slx', 'workspace', VARIABLE), 'b.sldd', DICTIONARY, 'copy')?.sectionName).toBe('design');
    // Its own section refusing it (a variable that is not scalar into the derived one) is passed over too.
    const vector = { ...VARIABLE, isScalarNumeric: false };
    expect(documentDrop(from('a.sldd', 'arch', vector), 'b.sldd', [ARCH, DESIGN], 'copy')?.sectionName).toBe('design');
  });

  it('entries from several sections go into the first section that takes them all', () => {
    const mixed: DragSource = { docUri: 'a.sldd', items: [{ ...PARAM, sectionName: 'design' }, { ...VARIABLE, sectionName: 'other' }] };
    expect(documentDrop(mixed, 'b.sldd', [CONFIG, DESIGN], 'move')).toMatchObject({ sectionName: 'design', decision: { canDrop: true } });
  });

  it('where no section takes them, says why: its own section, or else the first', () => {
    expect(documentDrop(from('a.sldd', 'design', BUS), 'b.sldd', DICTIONARY, 'move')).toMatchObject({
      sectionName: 'design',
      decision: { canDrop: false, noop: false, tooltip: 'Bus cannot be in Design Data' },
    });
    expect(documentDrop(from('a.sldd', 'other', BUS), 'b.sldd', [CONFIG, DESIGN], 'move')).toMatchObject({
      sectionName: 'config',
      decision: { canDrop: false, tooltip: 'Bus cannot be in Configurations' },
    });
  });

  it('is no answer for a document with no rule, one that takes no drop at all', () => {
    expect(documentDrop(from('a.sldd', 'design', PARAM), 'b.sldd', [], 'move')).toBeNull();
  });
});
