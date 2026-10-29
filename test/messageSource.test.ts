// Copyright 2026 The MathWorks, Inc.
//
// The table's end of the wire, at its edges: what it asks with, how an answer finds its
// question, what it makes of a message it cannot use, and the link grammar a table answers itself.
import { describe, expect, it } from 'vitest';
import { inspectorFeed, localLinkName, messageSource, parseLinkTarget, type TableChange, type TablePort } from '../src/model/index.js';

function hostPort() {
  const posted: unknown[] = [];
  let hear: (m: unknown) => void = () => {};
  const port: TablePort = { postMessage: (m) => posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
  return { port, posted, send: (m: unknown) => hear(m) };
}

const VIEW = { type: 'setRows', docUri: 'file:///w/a.sldd', rows: [], columns: ['Name'], columnLabels: { Name: 'Name' }, columnGroups: {}, editable: true };

describe('messageSource', () => {
  it("answers each question with the next answer of its kind, first asked first answered", async () => {
    const { port, posted, send } = hostPort();
    const source = messageSource(port);
    const a1 = source.children('a');
    const b = source.children('b');
    const a2 = source.children('a');
    send({ type: 'childRows', nodeId: 'a', rows: [{ ID: 'a/1' }], truncated: 0 });
    send({ type: 'childRows', nodeId: 'b', rows: 'not rows' }); // no answer at all
    send({ type: 'childRows', nodeId: 'b', rows: [], truncated: 2 });
    send({ type: 'childRows', nodeId: 'a', rows: [] });
    expect(await a1).toEqual({ nodeId: 'a', rows: [{ ID: 'a/1' }], truncated: 0 });
    expect(await b).toEqual({ nodeId: 'b', rows: [], truncated: 2 });
    expect(await a2).toEqual({ nodeId: 'a', rows: [], truncated: 0 });
    const m = source.matrix('n');
    send({ type: 'matrixCells', nodeId: 'n' });
    expect(await m).toEqual({ nodeId: 'n', message: 'This value could not be read as a table.' });
    const page = source.inspect(['r1', 'r2']);
    const none = source.inspect([]);
    send({ type: 'showProps', groups: [{ title: 'T', properties: [] }] });
    send({ type: 'empty' });
    expect(await page).toEqual({ rowId: 'r1', groups: [{ title: 'T', properties: [] }] });
    expect(await none).toEqual({ groups: [] });
    expect(posted).toEqual([
      { type: 'requestChildren', nodeId: 'a' },
      { type: 'requestChildren', nodeId: 'b' },
      { type: 'requestChildren', nodeId: 'a' },
      { type: 'requestMatrix', nodeId: 'n' },
      { type: 'select', rowIds: ['r1', 'r2'] },
      { type: 'select', rowIds: [] },
    ]);
  });

  it("opens with the next setRows or error; later ones are changes; an entry it cannot apply asks again", async () => {
    const { port, posted, send } = hostPort();
    const source = messageSource(port);
    const heard: TableChange[] = [];
    source.subscribe((c) => heard.push(c));
    const failed = source.open();
    send({ type: 'error', message: 'Failed to parse a.sldd: no.' });
    await expect(failed).rejects.toThrow('Failed to parse a.sldd: no.');
    const opened = source.open();
    send({ ...VIEW, hasTextView: true, notice: 7 });
    expect(await opened).toEqual({ docUri: 'file:///w/a.sldd', rows: [], columns: ['Name'], columnLabels: { Name: 'Name' }, columnGroups: {}, editable: true });
    send({ ...VIEW, docUri: undefined, editable: 0 });
    send({ type: 'updateEntryRows', entryRowId: 'e', rows: null });
    send({ type: 'insertEntryRows', sectionRowId: 's', rows: [] });
    send('not a message');
    send({ type: 'error', message: 'Failed to apply edit.' });
    expect(heard).toEqual([
      { kind: 'replaceAll', view: { docUri: 'file:///w/a.sldd', rows: [], columns: ['Name'], columnLabels: { Name: 'Name' }, columnGroups: {}, editable: false } },
      { kind: 'insertEntry', sectionRowId: 's', rows: [] },
      { kind: 'error', message: 'Failed to apply edit.' },
    ]);
    expect(posted).toEqual([{ type: 'ready' }, { type: 'ready' }, { type: 'ready' }]);
  });

  it('dispose() stops listening, and rejects what still waits', async () => {
    const { port, send } = hostPort();
    const source = messageSource(port);
    const heard: TableChange[] = [];
    source.subscribe((c) => heard.push(c));
    const waiting = source.children('a');
    source.dispose();
    await expect(waiting).rejects.toThrow('This source is closed.');
    send(VIEW);
    expect(heard).toEqual([]);
  });
});

describe('inspectorFeed', () => {
  it('says ready to its first listener only, and hears every page', () => {
    const { port, posted, send } = hostPort();
    const feed = inspectorFeed(port);
    const pages: unknown[] = [];
    feed.onPage((p) => pages.push(p));
    feed.onPage(() => {});
    send({ type: 'showProps', groups: [{ title: 'T', properties: [] }] });
    send({ type: 'empty' });
    send({ type: 'setRows' });
    expect(posted).toEqual([{ type: 'ready' }]);
    expect(pages).toEqual([{ groups: [{ title: 'T', properties: [] }] }, { groups: [] }]);
  });
});

describe('link targets', () => {
  it('reads the four forms, at the first @', () => {
    expect(parseLinkTarget('Kp@file:///w/a.sldd')).toEqual({ kind: 'entry', name: 'Kp', source: 'file:///w/a.sldd' });
    expect(parseLinkTarget('blocks:65@file:///w/m.slx')).toEqual({ kind: 'block', block: '65', source: 'file:///w/m.slx' });
    expect(parseLinkTarget('workspace:k@file:///w/m.slx')).toEqual({ kind: 'workspace', name: 'k', source: 'file:///w/m.slx' });
    expect(parseLinkTarget('plant.slx')).toEqual({ kind: 'file', file: 'plant.slx' });
    expect(parseLinkTarget('Kp@file:///u/me@corp/a.sldd')).toEqual({ kind: 'entry', name: 'Kp', source: 'file:///u/me@corp/a.sldd' });
  });

  it("answers locally only a whole entry name in this document, whichever srcId spells it", () => {
    const uri = 'file:///w/a.sldd';
    expect(localLinkName(`Kp@${uri}`, uri)).toBe('Kp');
    expect(localLinkName(`Kp@binedit:${uri}`, uri)).toBe('Kp');
    expect(localLinkName(`Kp@${uri}`, '')).toBeNull();
    expect(localLinkName('Kp@file:///w/b.sldd', uri)).toBeNull();
    expect(localLinkName(`blocks:65@${uri}`, uri)).toBeNull();
    expect(localLinkName(`a:b@${uri}`, uri)).toBeNull();
    expect(localLinkName(`@${uri}`, uri)).toBeNull();
    expect(localLinkName('a.sldd', uri)).toBeNull();
  });
});
