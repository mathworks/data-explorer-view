// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing, undoChords}): the table answers the Undo and Redo chords the editing menu
// labels, outside its fields and where the document may be edited, and only where asked (the VS Code
// extension's own keybindings undo); handle.undo() and redo() do the same for an app's Edit menu; and
// the field rule both keep to is exported.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, isTypingInField, type ConnectTableOptions, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { EditableTableSource, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const VIEW: TableView = {
  docUri: 'file:///w/d.sldd',
  rows: [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } } as any,
    { ID: 'u/design/A', parent: 'section:design', Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};

/** A source that answers with `view` and records every command it is given. */
function recordingSource(view: TableView = VIEW): { source: EditableTableSource; calls: string[] } {
  const calls: string[] = [];
  const read: TableSource = {
    open: async () => view,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: () => () => {},
  };
  const commands = Object.fromEntries(
    ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
      (name) => [name, () => void calls.push(name)],
    ),
  );
  return { source: { ...read, ...commands } as EditableTableSource, calls };
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

async function mount(source: TableSource, options: ConnectTableOptions = {}): Promise<{ table: any; handle: TableHandle }> {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, source, options);
  handles.push(handle);
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
  return { table, handle };
}

/** A key pressed on the grid (the table element itself), or in `from`. */
function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

describe('connectTable({editing, undoChords}) answers the Undo and Redo chords', () => {
  it('takes Cmd/Ctrl+Z as Undo and Shift+Cmd/Ctrl+Z as Redo, on the grid', async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, undoChords: true });
    const undo = press(table, { key: 'z', metaKey: true });
    press(table, { key: 'Z', metaKey: true, shiftKey: true });
    press(table, { key: 'z', ctrlKey: true });
    press(table, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(calls).toEqual(['undo', 'redo', 'undo', 'redo']);
    expect(undo.defaultPrevented).toBe(true);
  });

  it('takes Ctrl+Y as Redo off macOS, and not on it', async () => {
    const platform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    try {
      for (const [name, expected] of [
        ['Win32', ['redo']],
        ['MacIntel', []],
      ] as const) {
        Object.defineProperty(navigator, 'platform', { value: name, configurable: true });
        const { source, calls } = recordingSource();
        const { table } = await mount(source, { editing: true, undoChords: true });
        press(table, { key: 'y', ctrlKey: true });
        expect(calls, name).toEqual(expected);
      }
    } finally {
      delete (navigator as any).platform;
      if (platform) Object.defineProperty(Navigator.prototype, 'platform', platform);
    }
  });

  it('leaves the chords to a field, to Alt, and to a document that cannot be edited', async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, undoChords: true });
    const field = document.createElement('input');
    table.append(field);
    const inField = press(field, { key: 'z', metaKey: true });
    press(table, { key: 'z', metaKey: true, altKey: true });
    expect(calls).toEqual([]);
    expect(inField.defaultPrevented).toBe(false);
    const readOnly = recordingSource({ ...VIEW, editable: false });
    const other = await mount(readOnly.source, { editing: true, undoChords: true });
    press(other.table, { key: 'z', metaKey: true });
    expect(readOnly.calls).toEqual([]);
  });

  it('answers no chord without the option, as the VS Code extension wires it', async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true });
    const undo = press(table, { key: 'z', metaKey: true });
    press(table, { key: 'z', metaKey: true, shiftKey: true });
    press(table, { key: 'y', ctrlKey: true });
    expect(calls).toEqual([]);
    expect(undo.defaultPrevented).toBe(false);
  });
});

describe("the handle's undo() and redo()", () => {
  it('do what the menu items do, without the chords option', async () => {
    const { source, calls } = recordingSource();
    const { handle } = await mount(source, { editing: true });
    handle.undo();
    handle.redo();
    expect(calls).toEqual(['undo', 'redo']);
  });

  it('do nothing where the document cannot be edited, or without editing', async () => {
    const readOnly = recordingSource({ ...VIEW, editable: false });
    const { handle } = await mount(readOnly.source, { editing: true });
    handle.undo();
    handle.redo();
    expect(readOnly.calls).toEqual([]);
    const plain = recordingSource();
    const unwired = await mount(plain.source);
    unwired.handle.undo();
    unwired.handle.redo();
    expect(plain.calls).toEqual([]);
  });
});

describe('isTypingInField', () => {
  const keyFrom = (el: Element): KeyboardEvent => {
    let seen: KeyboardEvent | null = null;
    document.body.append(el);
    document.body.addEventListener('keydown', (e) => void (seen = e), { once: true });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true }));
    return seen!;
  };

  it('is true in an input, a textarea, a select and an editable element', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    for (const el of [document.createElement('input'), document.createElement('textarea'), document.createElement('select'), editable]) {
      expect(isTypingInField(keyFrom(el)), el.tagName).toBe(true);
    }
  });

  it('is false on anything else', () => {
    expect(isTypingInField(keyFrom(document.createElement('div')))).toBe(false);
    expect(isTypingInField(keyFrom(document.createElement('dex-tree-table')))).toBe(false);
  });
});
