// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/scRenameCarry.test.ts at cc8cb1b.
// Two cases of its "carrying a function rename in a compressed-binary dictionary": the refusal of a
// sibling's name, run against view's binary dictionary engine, whose table `edit` is the binary
// provider's rename the extension composed by hand; and core's scXmlFunctionRenamePatch asked of
// functions the catalog does not list, over the parts that engine holds. Its other compressed-binary
// cases are test/binaryEngine/renameCarry.test.ts's; the rest of the file stays with the extension.
//
// A service interface's function is listed twice in a compressed dictionary: in the entry, and in
// the System Composer catalog (`interfaceDictionary.xml`), a zip member the document only passes
// through. So a rename of the function is a chunk splice plus a member swap on the same undo step,
// and a rename that is refused, or that the catalog has no copy of, swaps nothing.
import { describe, it, expect } from 'vitest';
import { SC_PART_XML, scXmlFunctionRenamePatch } from 'data-explorer-core';
import { file, isEntryRow, nameOf, open, type Opened } from './binaryEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SVC = 'test/fixtures/arch_service_binary.sldd';

/** One rename: of the entry `entry`, or of its function `fn`, to `to`. */
interface Step {
  entry: string;
  fn?: string;
  to: string;
}

/** The row the table holds for `step`, from the newest paint that carries it. */
function rowOf(posts: any[], step: Step): any {
  for (let i = posts.length - 1; i >= 0; i--) {
    const msg = posts[i];
    if (msg.type !== 'setRows' && msg.type !== 'updateEntryRows') continue;
    const rows = msg.rows as any[];
    const entry = rows.find((r) => isEntryRow(r) && nameOf(r) === step.entry);
    if (!entry) continue;
    if (step.fn === undefined) return entry;
    const fn = rows.find((r) => r.parent === entry.ID && nameOf(r) === step.fn);
    if (fn) return fn;
  }
  throw new Error(`the table was sent no row for ${step.fn ?? step.entry} under ${step.entry}`);
}

/**
 * A table rename, as the table posts one (`edit` of the Name column): the posts it caused. The
 * engine's answer to a refused rename is a `validationError`, where the extension's composition
 * returned core's `{ error: true }` and read no part.
 */
function attemptRename(o: Opened, name: string, newValue: string, child?: string): any[] {
  const row = rowOf(o.view.posts, { entry: name, fn: child, to: newValue });
  const mark = o.view.posts.length;
  o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: nameOf(row), newValue });
  return o.view.posts.slice(mark);
}

describe('carrying a function rename in a compressed-binary dictionary', () => {
  it('refuses a sibling’s name, and patches nothing', async () => {
    const d = await open(SVC, file(SVC), { as: 'sc_rename_sibling.sldd' });
    try {
      const originalPart = d.engine.parts[SC_PART_XML];

      const posts = attemptRename(d, 'ServiceInterface', 'g', 'f');

      // The refusal: the table is told so, once.
      expect(posts.filter((m) => m.type === 'validationError')).toHaveLength(1);
      // No part: the refused rename pushed no edit, so no member swap rode on one.
      expect(d.events).toHaveLength(0);
      expect(d.engine.parts[SC_PART_XML]).toBe(originalPart);
    } finally {
      d.view.close();
    }
  });

  it('does not patch for a function the catalog does not list', async () => {
    const d = await open(SVC, file(SVC), { as: 'sc_rename_unlisted.sldd' });
    try {
      // A name no function has; the data interface `f`, which has no functions; and an
      // interface the catalog does not define at all.
      expect(scXmlFunctionRenamePatch(d.engine.parts, { interfaceName: 'ServiceInterface', oldName: 'h', newName: 'k' })).toBeNull();
      expect(scXmlFunctionRenamePatch(d.engine.parts, { interfaceName: 'f', oldName: 'f', newName: 'k' })).toBeNull();
      expect(scXmlFunctionRenamePatch(d.engine.parts, { interfaceName: 'Other', oldName: 'f', newName: 'k' })).toBeNull();
    } finally {
      d.view.close();
    }
  });
});
