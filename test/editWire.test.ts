// Copyright 2026 The MathWorks, Inc.
//
// The wire's editing half (wire.ts), end to end: every editing message, as the VS Code extension
// sends it (one JSON fixture each, test/fixtures/wire-edit), crosses messageSource ⇄ serveTable
// unchanged, byte for byte and key for key; a command reaches the source there and then, in the
// order the messages came; and a source's answer arrives as the change it sent.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serveTable } from '../src/serve/index.js';
import {
  SourceClosed,
  isEditable,
  messageSource,
  type EditableTableSource,
  type TableChange,
  type TablePort,
  type TableSource,
} from '../src/model/index.js';
import { channel } from './goldens/channel.js';
import { matrixCellsMessage } from '../src/model/matrix/matrixRequest.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'wire-edit');
const fixtures = (side: 'client' | 'host') =>
  readdirSync(FIXTURES)
    .filter((f) => f.startsWith(`${side}-`) && f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), readFileSync(join(FIXTURES, f), 'utf8')] as const);

/** A message's text as it would be posted: the same keys, in the same order. */
const text = (message: unknown) => JSON.stringify(message, null, 2) + '\n';

const VIEW = { docUri: 'file:///w/a.sldd', rows: [], columns: ['Name'], columnLabels: { Name: 'Name' }, columnGroups: {}, editable: true };

/** An editable source that records each command it is given, and sends what `emit` is handed. */
function recordingSource() {
  const calls: [string, ...unknown[]][] = [];
  const listeners = new Set<(change: TableChange) => void>();
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void calls.push([name, ...args]);
  const source: EditableTableSource = {
    open: async () => VIEW,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    edit: record('edit'),
    copy: record('copy'),
    cut: record('cut'),
    delete: record('delete'),
    paste: record('paste'),
    addChild: record('addChild'),
    addEntry: record('addEntry'),
    undo: record('undo'),
    redo: record('redo'),
    dragStart: record('dragStart'),
    dragEnd: record('dragEnd'),
    drop: record('drop'),
    requestEditText: record('requestEditText'),
  };
  const emit = (change: TableChange) => {
    for (const listener of [...listeners]) listener(change);
  };
  return { source, calls, emit };
}

/** The command a client fixture's message is, called on `s`, and the call the source should record. */
function command(s: EditableTableSource, m: Record<string, any>): [string, ...unknown[]] {
  switch (m.type) {
    case 'edit': {
      const edit = { rowId: m.rowId, columnId: m.columnId, oldValue: m.oldValue, newValue: m.newValue };
      s.edit(edit);
      return ['edit', edit];
    }
    case 'copy':
    case 'cut':
    case 'delete':
    case 'dragStart':
      s[m.type as 'copy'](m.rowIds);
      return [m.type, m.rowIds];
    case 'paste':
    case 'addChild':
    case 'requestEditText':
      s[m.type as 'paste'](m.rowId);
      return [m.type, m.rowId];
    case 'addEntry': {
      const entry = { section: m.section, className: m.className, rename: m.rename };
      s.addEntry(entry);
      return ['addEntry', entry];
    }
    case 'undo':
    case 'redo':
    case 'dragEnd':
      s[m.type as 'undo']();
      return [m.type];
    case 'drop':
      s.drop(m.rowId, m.mode);
      return ['drop', m.rowId, m.mode];
  }
  throw new Error(`no command for ${m.type}`);
}

/** The change a host fixture's message carries. */
function changeOf(m: Record<string, any>): TableChange {
  const { type, ...rest } = m;
  switch (type) {
    case 'sectionRules':
      return { kind: 'sectionRules', docUri: m.docUri, rules: m.rules };
    case 'clipboardState':
      return { kind: 'clipboard', state: rest as any };
    case 'dragState':
      return { kind: 'drag', descriptor: m.descriptor };
    case 'selectRows':
      return { kind: 'select', rowIds: m.rowIds };
    case 'beginRename':
      return { kind: 'beginRename', rowId: m.rowId };
    case 'validationError':
      return { kind: 'invalid', reason: m.reason, invalidValue: m.invalidValue, previousValue: m.previousValue };
    case 'refused':
      return { kind: 'refused', title: m.title, reason: m.reason };
    case 'editText':
      return { kind: 'editText', ...(rest as any) };
  }
  throw new Error(`no change for ${type}`);
}

/** A port whose messages arrive at once, inside the sender's call: what a throw is seen through. */
function syncPort() {
  let hear: (m: unknown) => void = () => {};
  const posted: unknown[] = [];
  const port: TablePort = { postMessage: (m) => void posted.push(m), onMessage: (l) => ((hear = l), () => (hear = () => {})) };
  return { port, posted, send: (m: unknown) => hear(m) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the editing messages, across a channel', () => {
  it('has a fixture for every editing message of the wire', () => {
    const types = (side: 'client' | 'host') => [...new Set(fixtures(side).map(([, json]) => JSON.parse(json).type))].sort();
    expect(types('client')).toEqual(
      ['addChild', 'addEntry', 'copy', 'cut', 'delete', 'dragEnd', 'dragStart', 'drop', 'edit', 'redo', 'requestEditText', 'paste', 'undo'].sort(),
    );
    expect(types('host')).toEqual(
      ['beginRename', 'clipboardState', 'dragState', 'editText', 'refused', 'sectionRules', 'selectRows', 'validationError'].sort(),
    );
  });

  for (const [name, json] of fixtures('client')) {
    it(`${name}: the command is sent as the extension's message, and reaches the source as it was called`, async () => {
      const message = JSON.parse(json);
      const [page, host] = channel();
      const { source, calls } = recordingSource();
      const seen: unknown[] = [];
      host.onMessage((m) => void seen.push(m));
      serveTable(source, host);
      const expected = command(messageSource(page), message);
      await tick();
      expect(seen.map(text)).toEqual([json]);
      expect(calls).toEqual([expected]);
    });
  }

  for (const [name, json] of fixtures('host')) {
    it(`${name}: the source's answer is sent as the extension's message, and arrives as the change it sent`, async () => {
      const message = JSON.parse(json);
      const [page, host] = channel();
      const { source, emit } = recordingSource();
      const seen: unknown[] = [];
      page.onMessage((m) => void seen.push(m));
      serveTable(source, host);
      const changes: TableChange[] = [];
      messageSource(page).subscribe((c) => void changes.push(c));
      emit(changeOf(message));
      await tick();
      expect(seen.map(text)).toEqual([json]);
      expect(changes).toEqual([changeOf(message)]);
    });
  }
});

describe('serveTable hands each command on', () => {
  it('there and then, in the order the messages came, edits, undos and pastes interleaved', () => {
    const { port, send } = syncPort();
    const { source, calls } = recordingSource();
    serveTable(source, port);
    const order: [string, number][] = [];
    const messages = [
      { type: 'edit', rowId: 'r1', columnId: 'Value', oldValue: '1', newValue: '2' },
      { type: 'undo' },
      { type: 'paste', rowId: 'section:design' },
      { type: 'edit', rowId: 'r2', columnId: 'Name', oldValue: 'a', newValue: 'b' },
      { type: 'redo' },
      { type: 'undo' },
      { type: 'paste', rowId: '' },
      { type: 'delete', rowIds: ['r1', 'r2'] },
    ];
    for (const m of messages) {
      send(m);
      // Called before send returned: nothing was put off to a later turn.
      order.push([m.type, calls.length]);
    }
    expect(calls.map(([name]) => name)).toEqual(messages.map((m) => m.type));
    expect(order).toEqual(messages.map((m, i) => [m.type, i + 1]));
    expect(calls[0]).toEqual(['edit', { rowId: 'r1', columnId: 'Value', oldValue: '1', newValue: '2' }]);
    expect(calls[6]).toEqual(['paste', '']);
  });

  it('awaiting nothing first: a command that throws throws to whoever delivered its message', () => {
    const { port, send } = syncPort();
    const { source } = recordingSource();
    source.edit = () => {
      throw new Error('the edit did not land');
    };
    serveTable(source, port);
    expect(() => send({ type: 'edit', rowId: 'r', columnId: 'Value', oldValue: '1', newValue: '2' })).toThrow('the edit did not land');
  });

  it('asks a read-only source nothing, and says nothing back', () => {
    const { port, posted, send } = syncPort();
    const readOnly: TableSource = {
      open: async () => VIEW,
      children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
      matrix: async (nodeId) => ({ nodeId, message: 'none' }),
      inspect: async () => ({ groups: [] }),
      subscribe: () => () => {},
    };
    serveTable(readOnly, port);
    for (const [, json] of fixtures('client')) expect(() => send(JSON.parse(json))).not.toThrow();
    expect(posted).toEqual([]);
  });

  it('says nothing of an open that settles as SourceClosed, and says any other failure', async () => {
    const answers: [Error, unknown[]][] = [
      [new SourceClosed('a.mat is closed.'), []],
      [new Error('the read broke'), [{ type: 'error', message: 'the read broke' }]],
    ];
    for (const [err, said] of answers) {
      const { port, posted, send } = syncPort();
      const failing: TableSource = {
        open: () => Promise.reject(err),
        children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
        matrix: async (nodeId) => ({ nodeId, message: 'none' }),
        inspect: async () => ({ groups: [] }),
        subscribe: () => () => {},
      };
      serveTable(failing, port);
      send({ type: 'ready' });
      await tick();
      expect(posted, err.message).toEqual(said);
    }
  });

  it("answers a question with an id that is not a string as the extension's host does, without asking the source", async () => {
    const { port, posted, send } = syncPort();
    const asked: string[] = [];
    const { source } = recordingSource();
    const watched: EditableTableSource = {
      ...source,
      children: async (nodeId) => (asked.push('children'), { nodeId, rows: [], truncated: 0 }),
      matrix: async (nodeId) => (asked.push('matrix'), { nodeId, message: 'none' }),
      requestEditText: () => void asked.push('requestEditText'),
    };
    serveTable(watched, port);
    send({ type: 'requestChildren', nodeId: 7 });
    send({ type: 'requestMatrix', nodeId: null });
    send({ type: 'requestEditText', rowId: 5 });
    await tick();
    expect(asked).toEqual([]);
    expect(posted).toEqual([
      { type: 'childRows', nodeId: 7, rows: [], truncated: 0 },
      { type: 'matrixCells', nodeId: null, message: matrixCellsMessage('', null).message },
    ]);
  });

  it("passes a command's fields on as the table sent them: the source judges them", () => {
    const { port, send } = syncPort();
    const { source, calls } = recordingSource();
    serveTable(source, port);
    send({ type: 'addEntry', className: 'MatlabVariable', rename: false });
    send({ type: 'copy' });
    expect(calls).toEqual([
      ['addEntry', { section: undefined, className: 'MatlabVariable', rename: false }],
      ['copy', undefined],
    ]);
  });
});

describe("what is not the wire's", () => {
  it("goes to serveTable's extra, which also adds the host's own fields to every setRows", async () => {
    const { port, posted, send } = syncPort();
    const { source, calls, emit } = recordingSource();
    const received: unknown[] = [];
    serveTable(source, port, {
      extra: { receive: (m) => void received.push(m), setRows: (view) => ({ hasTextView: view.docUri.endsWith('.sldd') }) },
    });
    send({ type: 'locateInText', rowId: 'r1' });
    send({ type: 'navigate', target: 'x@y' });
    send({ type: 'undo' });
    send({ type: 'ready' });
    await tick();
    emit({ kind: 'replaceAll', view: VIEW });
    expect(received).toEqual([
      { type: 'locateInText', rowId: 'r1' },
      { type: 'navigate', target: 'x@y' },
    ]);
    expect(calls).toEqual([['undo']]);
    expect(posted).toEqual([
      { type: 'setRows', ...VIEW, hasTextView: true },
      { type: 'setRows', ...VIEW, hasTextView: true },
    ]);
  });

  it("goes to messageSource's extra, and no message of the wire does", () => {
    const { port, send } = syncPort();
    const extra: unknown[] = [];
    const changes: TableChange[] = [];
    const source = messageSource(port, { extra: (m) => void extra.push(m) });
    source.subscribe((c) => void changes.push(c));
    send({ type: 'openAddGallery' });
    send({ type: 'selectByName', name: 'Kp' });
    send({ type: 'selectRows', rowIds: ['a'] });
    send({ type: 'beginRename' }); // the wire's, in a shape the source cannot use: ignored
    send({ type: 'error', message: 'gone' });
    expect(extra).toEqual([{ type: 'openAddGallery' }, { type: 'selectByName', name: 'Kp' }]);
    expect(changes).toEqual([
      { kind: 'select', rowIds: ['a'] },
      { kind: 'error', message: 'gone' },
    ]);
  });
});

describe('messageSource, reading what a host sends', () => {
  it('keeps what is well-formed, and reads the rest as nothing', () => {
    const { port, send } = syncPort();
    const changes: TableChange[] = [];
    messageSource(port).subscribe((c) => void changes.push(c));
    send({ type: 'setRows', ...VIEW });
    send({ type: 'sectionRules', rules: 'none' });
    send({ type: 'clipboardState', canPaste: 1, mode: 'move', items: [{ className: 'X' }, 3], sourceDocUri: 7 });
    send({ type: 'dragState', descriptor: { docUri: 'a', items: 'none' } });
    send({ type: 'selectRows', rowIds: ['a', 3] });
    send({ type: 'editText', rowId: 'r', text: 5 });
    expect(changes.slice(1)).toEqual([
      { kind: 'sectionRules', docUri: 'file:///w/a.sldd', rules: [] },
      { kind: 'clipboard', state: { canPaste: true, mode: null, items: [{ className: 'X' }] } },
      { kind: 'drag', descriptor: null },
      { kind: 'select', rowIds: ['a'] },
      { kind: 'editText', rowId: 'r', text: null },
    ]);
  });
});

describe('isEditable', () => {
  it('is a source with every command: messageSource is one, a read-only source is not', () => {
    const { port } = syncPort();
    expect(isEditable(messageSource(port))).toBe(true);
    expect(isEditable(recordingSource().source)).toBe(true);
    const { source } = recordingSource();
    const { requestEditText: _, ...missingOne } = source;
    expect(isEditable(missingOne as TableSource)).toBe(false);
  });
});
