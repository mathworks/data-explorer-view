// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/structuralEdit.test.ts at cc8cb1b.
// Only its sectionTarget case ("a dictionary transfer target › is the section of the row, …"), run against
// view's copy (src/model/edit/dictionaryTarget.ts); the file's other cases are not part of this port.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getModel, findNode, invalidate } from '../src/host/index.js';
import { sectionTarget } from '../src/model/edit/dictionaryTarget.js';

const fixtureText = readFileSync(
  fileURLToPath(new URL('../test-integration/fixtures/workspace/data.sldd', import.meta.url)),
  'utf8',
);

function freshModel(uri: string) {
  invalidate(uri);
  return getModel(uri, 'data.sldd', fixtureText);
}

// The two halves of a dictionary's paste/drop adapter that both formats share (transfer.ts runs
// them): where the transfer lands, and what it refuses before anything changes.
describe('a dictionary transfer target', () => {
  it('is the section of the row, or of the header, by name — and nothing for a row that names none', () => {
    const uri = 'test://transfer-target.sldd';
    const model = freshModel(uri);
    const entry = (model.getSection('design').children as any[]).find((c) => c.name === 'Number');
    const onEntry = sectionTarget(model, findNode(uri, entry.id), entry.id);
    expect(onEntry?.sectionName).toBe('design');
    expect(onEntry?.section).toBe(model.getSection('design'));
    expect(onEntry?.model).toBe(model);
    expect(sectionTarget(model, null, 'section:other')?.sectionName).toBe('other');
    expect(sectionTarget(model, null, 'section:nowhere')).toBeNull();
    expect(sectionTarget(model, null, 'not-a-row')).toBeNull();
  });
});
