// Copyright 2026 The MathWorks, Inc.
//
// A workspace's read-only document, in a workspace that edits: its table's rows can be dragged out
// (connectTable's `dragOut`) and copied into a document the page edits, as the app shell's Explorer
// takes them. So its source has `dragStart` and `dragEnd`, which take the entries into the drag
// register the editable documents share, as theirs do; nothing takes them out of it again (it has no
// deleter, and the table allows no move). A workspace that does not edit has no register to fill,
// and its documents have neither.
//
// The read-only document here is a JSON dictionary past the text-sync limit, which the page keeps
// read-only as the VS Code extension does: core's limit check is answered as for a large file, so
// a small fixture stands in for one.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRegisters } from '../src/model/edit/registers.js';
import { createWorkspace } from '../src/model/source/workspace.js';
import { isEditable, type TableChange } from '../src/model/source/tableSource.js';

vi.mock('data-explorer-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('data-explorer-core')>()),
  exceedsTextSyncLimit: () => true,
}));

const bytes = (name: string) => new Uint8Array(readFileSync(`test/fixtures/${name}`));
const KP = 'file:///params.sldd/design/Kp';

describe("a read-only document's rows dragged out", () => {
  it('go into the drag register as a copy of the entries, from the document, until the drag ends', async () => {
    const registers = createRegisters();
    const ws = createWorkspace({ editing: true, registers });
    const doc = await ws.open(bytes('params.sldd'), 'params.sldd');
    expect(doc.editable).toBe(false);
    await doc.table.open();
    const told: unknown[] = [];
    registers.listen({ drag: (d) => void told.push(d) });
    doc.table.dragStart!([KP]);
    expect(registers.getDrag()).toMatchObject({ sourceDocUri: 'file:///params.sldd', items: [{ sourceSection: 'design', payload: { name: 'Kp' } }] });
    expect(told).toEqual([{ docUri: 'file:///params.sldd', items: [expect.objectContaining({ sectionName: 'design' })] }]);
    doc.table.dragEnd!();
    expect(registers.getDrag()).toBeNull();
    expect(told.at(-1)).toBeNull();
    ws.dispose();
  });

  it('are dropped into a document the page edits as a copy, the read-only one keeping them', async () => {
    const ws = createWorkspace({ editing: true });
    const from = await ws.open(bytes('params.sldd'), 'params.sldd');
    const to = await ws.open(bytes('rt_bin.sldd'), 'rt_bin.sldd');
    const target = to.table;
    if (!isEditable(target)) throw new Error('rt_bin.sldd takes no edits');
    await from.table.open();
    await target.open();
    const changes: TableChange[] = [];
    target.subscribe((c) => void changes.push(c));
    target.opened?.();
    from.table.dragStart!([KP]);
    target.drop('section:design', 'copy');
    from.table.dragEnd!();
    await vi.waitFor(() => expect(to.dirty).toBe(true));
    expect((await target.open()).rows.some((r) => r.Name.label === 'Kp')).toBe(true);
    expect((await from.table.open()).rows.some((r) => r.Name.label === 'Kp')).toBe(true);
    expect(changes.some((c) => c.kind === 'error')).toBe(false);
    ws.dispose();
  });

  it('let a drag still on go when the document closes, so it completes against nothing', async () => {
    const registers = createRegisters();
    const ws = createWorkspace({ editing: true, registers });
    const doc = await ws.open(bytes('params.sldd'), 'params.sldd');
    await doc.table.open();
    doc.table.dragStart!([KP]);
    doc.dispose();
    expect(registers.getDrag()).toBeNull();
    ws.dispose();
  });

  it('carry nothing for a row of no entry (a section heading), and say nothing of it', async () => {
    const ws = createWorkspace({ editing: true });
    const doc = await ws.open(bytes('params.sldd'), 'params.sldd');
    await doc.table.open();
    const changes: TableChange[] = [];
    doc.table.subscribe((c) => void changes.push(c));
    // A row of no entry (a section's heading) carries nothing, and is no failure.
    doc.table.dragStart!(['section:design']);
    expect(changes).toEqual([]);
    ws.dispose();
  });

  it('are not dragged out of a workspace that does not edit: its documents have no dragStart', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(bytes('params.sldd'), 'params.sldd');
    expect(doc.table.dragStart).toBeUndefined();
    expect(doc.table.dragEnd).toBeUndefined();
    ws.dispose();
  });
});
