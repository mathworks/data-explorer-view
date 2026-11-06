// Copyright 2026 The MathWorks, Inc.
//
// The command window's interpreter (src/model/shell/commands.ts): a line typed at the `>>` prompt,
// run against the active document through a CommandTarget, and answered as lines of output.
//
// What it protects: each command's answer, word for word where a person reads it (the help, the
// listing, the echo after an edit); names found as a table's selectByName finds them, an entry
// before a nested row of the same name, and `Bus.Element` walking down; an assignment that is a
// cell edit of the table's own columns and nothing else, sent with the cell's old text and quotes
// taken off a text column's value; an edit the document refused told by the value it kept, not by
// what was asked; `add` creating in the section the Add gallery would, and naming the entry it
// made; and every failure a line of output, never a throw, since the window has nobody to catch it.
//
// Most cases run against a fake target, whose rows are a small dictionary; the last block runs
// over a real JSON dictionary opened in a workspace, so the commands are checked against the
// rows, edits and refusals the package's own sources produce.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  addChoicesOf,
  runCommand,
  type AddChoice,
  type CommandDoc,
  type CommandOutput,
  type CommandRaw,
  type CommandTarget,
} from '../src/model/shell/commands.js';
import { allTiles } from '../src/model/ids/addCatalog.js';
import { insertEntryRows, spliceEntryRows } from '../src/model/actions/rowUpdates.js';
import {
  createWorkspace,
  type CellEdit,
  type EditableTableSource,
  type InspectorView,
  type NewEntry,
  type TreeTableRow,
} from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const U = 'file:///dd.sldd';

/** A row of the fake dictionary: an editable name (but on a section), no other cell unless given. */
function row(id: string, parent: string | null, label: string, cells: Record<string, unknown> = {}): TreeTableRow {
  return {
    ID: id,
    parent,
    Name: { label, editable: !id.startsWith('section:') },
    Value: '',
    DataType: '',
    Description: '',
    Status: '',
    ...cells,
  } as TreeTableRow;
}

// A dictionary as its table holds it. Bus has an element named Kp ahead of the entry Kp, so a
// name that found the first row of that name would find the wrong one; Big's rows were held back
// (`_lazy`); Architectural Data is empty.
function dictionaryRows(): TreeTableRow[] {
  return [
    row('section:design', null, 'Design Data'),
    row(`${U}/design/Bus`, 'section:design', 'Bus', { Class: 'Simulink.Bus', _descriptionEditable: true }),
    row(`${U}/design/Bus/Kp`, `${U}/design/Bus`, 'Kp', { Class: 'Simulink.BusElement', DataType: 'single' }),
    row(`${U}/design/Bus/Element`, `${U}/design/Bus`, 'Element', { Class: 'Simulink.BusElement', DataType: 'double' }),
    row(`${U}/design/Kp`, 'section:design', 'Kp', {
      Value: '1',
      _valueEditable: true,
      DataType: 'double',
      Class: 'double',
      _descriptionApplies: false,
      _descriptionEditable: false,
    }),
    row(`${U}/design/Speed`, 'section:design', 'Speed', {
      Value: '30',
      _valueEditable: true,
      DataType: { text: 'single', editable: true },
      Class: 'Simulink.Parameter',
      Description: 'Top speed',
      _descriptionEditable: true,
      Min: { text: '0', editable: true },
      Unit: 'km/h',
    }),
    row(`${U}/design/Mode`, 'section:design', 'Mode', {
      Value: { text: 'On', editable: true, editor: 'select', options: ['On', 'Off'] },
      Class: 'Simulink.data.dictionary.EnumTypeDefinition',
    }),
    row(`${U}/design/Big`, 'section:design', 'Big', { Value: '<1x500 double>', Class: 'double', _lazy: true }),
    row(`${U}/design/Gain1`, 'section:design', 'Gain1', { DataType: 'Gain', _blockKey: '7' }),
    row('section:arch', null, 'Architectural Data'),
    row('section:config', null, 'Configurations'),
    row(`${U}/config/Configuration`, 'section:config', 'Configuration', { Value: 'Configuration', Class: 'Simulink.ConfigSet' }),
  ];
}

const DD: CommandDoc = { name: 'dd.sldd', kind: 'dictionary', active: true, dirty: false };

interface FakeOptions {
  docs?: CommandDoc[];
  rows?: TreeTableRow[];
  /** No edit, addEntry, remove or save: a document open read-only. */
  readOnly?: boolean;
  /** Edits this refuses: nothing changes, as a source that refuses one leaves its rows. */
  refuse?: (edit: CellEdit) => boolean;
  refuseAdd?: boolean;
  refuseRemove?: boolean;
  save?: () => Promise<string>;
  /** false: no raw view at all. */
  raw?: false | ((rowId: string) => Promise<CommandRaw>);
  inspect?: (rowId: string) => Promise<InspectorView>;
  /** null: no classes method. */
  classes?: AddChoice[] | null;
}

interface Fake extends CommandTarget {
  edits: CellEdit[];
  added: NewEntry[];
  removed: string[][];
  inspected: string[];
  current: TreeTableRow[];
}

const textOf = (cell: unknown): string =>
  typeof cell === 'string' ? cell : cell && typeof cell === 'object' ? String((cell as { text?: unknown }).text ?? '') : '';

// A target over the rows above that changes them as a source would: a rename moves the row's id
// (ids embed names), an add puts a default-named entry last in its section, a remove takes the
// row and everything under it. Each command settles a microtask later, as an async source does,
// so an interpreter that read the rows without waiting would read them unchanged.
function fake(options: FakeOptions = {}): Fake {
  const t: Fake = {
    edits: [],
    added: [],
    removed: [],
    inspected: [],
    current: options.rows ?? dictionaryRows(),
    docs: () => options.docs ?? [DD],
    rows: () => t.current,
    inspect: async (rowId) => {
      t.inspected.push(rowId);
      if (options.inspect) return options.inspect(rowId);
      const r = t.current.find((x) => x.ID === rowId)!;
      return {
        rowId,
        groups: [
          {
            title: 'General',
            properties: [
              { name: 'Name', value: r.Name.label },
              { name: 'Data Type', value: textOf(r.DataType) },
            ],
          },
          { title: 'Design', properties: [{ name: 'Value', value: textOf(r.Value) }] },
        ],
      };
    },
  };
  if (options.raw !== false) {
    t.raw = options.raw ?? (async (rowId) => ({ format: 'json', text: JSON.stringify({ id: rowId, n: 1 }, null, 2) }));
  }
  if (options.classes !== null) t.classes = () => options.classes ?? addChoicesOf({});
  if (options.readOnly) return t;
  t.edit = async (edit) => {
    t.edits.push(edit);
    await Promise.resolve();
    if (options.refuse?.(edit)) return;
    const r = t.current.find((x) => x.ID === edit.rowId);
    if (!r) return;
    if (edit.columnId === 'Name') {
      const oldId = r.ID;
      const newId = oldId.replace(/[^/]+$/, edit.newValue);
      const moved = (id: string | null) => (id !== null && (id === oldId || id.startsWith(oldId + '/')) ? newId + id.slice(oldId.length) : id);
      t.current = t.current.map((x) => ({
        ...x,
        ID: moved(x.ID)!,
        parent: moved(x.parent),
        ...(x.ID === oldId ? { Name: { ...x.Name, label: edit.newValue } } : {}),
      }));
      return;
    }
    const cell = (r as any)[edit.columnId];
    const next = cell && typeof cell === 'object' ? { ...cell, text: edit.newValue } : edit.newValue;
    t.current = t.current.map((x) => (x.ID === r.ID ? ({ ...x, [edit.columnId]: next } as TreeTableRow) : x));
  };
  t.addEntry = async (entry) => {
    t.added.push(entry);
    await Promise.resolve();
    if (options.refuseAdd) return;
    const base = entry.className === 'MatlabVariable' ? 'Var' : 'Param';
    let name = base;
    for (let i = 1; t.current.some((x) => x.Name.label === name); i++) name = base + i;
    const section = entry.section === '' ? null : `section:${entry.section}`;
    const last = t.current.reduce((at, x, i) => (x.ID === section || (section !== null && x.parent === section) ? i : at), t.current.length - 1);
    const added = row(`${U}/${entry.section}/${name}`, section, name, { Class: entry.className, Value: '[]', _valueEditable: true });
    t.current = [...t.current.slice(0, last + 1), added, ...t.current.slice(last + 1)];
  };
  t.remove = async (rowIds) => {
    t.removed.push([...rowIds]);
    await Promise.resolve();
    if (options.refuseRemove) return;
    t.current = t.current.filter((x) => !rowIds.some((id) => x.ID === id || x.ID.startsWith(id + '/')));
  };
  t.save = options.save ?? (async () => 'Saved dd.sldd.');
  return t;
}

const run = (line: string, target: CommandTarget): Promise<CommandOutput> => runCommand(line, target);
const texts = async (line: string, target: CommandTarget): Promise<string[]> => (await run(line, target)).lines.map((l) => l.text);
const line = (text: string, kind: 'out' | 'error' | 'info' = 'out') => ({ text, kind });

describe('help', () => {
  it('lists every command, and says why JavaScript is not run', async () => {
    const out = await run('help', fake());
    const all = out.lines.map((l) => l.text).join('\n');
    for (const usage of [
      'help, ?',
      'clear',
      'sources',
      'ls [name]',
      'info <name>',
      'json <name>',
      'set <name>[.<Column>] <value>',
      'add <class> [<name>]',
      'rm <name>',
      'save',
      '<name> = <value>',
      '<name>.<Column> = <value>',
    ]) {
      expect(all).toContain(usage);
    }
    // The older app evaluated any other line as JavaScript; a strict page forbids that, and the
    // help says so rather than leaving a person to find out.
    const last = out.lines.at(-1)!;
    expect(last.kind).toBe('info');
    expect(last.text).toMatch(/JavaScript/);
    expect(last.text).toMatch(/security policy/);
    expect(out.clear).toBeUndefined();
  });

  it('answers ? as it answers help', async () => {
    expect(await run('?', fake())).toEqual(await run('help', fake()));
  });
});

describe('clear and a blank line', () => {
  it('asks the window to clear, with nothing to show', async () => {
    expect(await run('clear', fake())).toEqual({ lines: [], clear: true });
    expect(await run('  clear  ', fake())).toEqual({ lines: [], clear: true });
  });

  it('answers a blank line with nothing', async () => {
    expect(await run('', fake())).toEqual({ lines: [] });
    expect(await run('   ', fake())).toEqual({ lines: [] });
  });
});

describe('sources', () => {
  it('lists the open documents, the active one and the unsaved ones marked', async () => {
    const docs: CommandDoc[] = [
      { name: 'dd.sldd', kind: 'dictionary', active: true, dirty: true },
      { name: 'controller.slx', kind: 'model', active: false, dirty: false },
    ];
    expect((await run('sources', fake({ docs }))).lines).toEqual([
      line('  dd.sldd *       dictionary  (active)'),
      line('  controller.slx  model'),
      line('* has unsaved changes', 'info'),
    ]);
  });

  it('says so when there is none', async () => {
    expect((await run('sources', fake({ docs: [] }))).lines).toEqual([line('No documents are open.', 'info')]);
  });

  it('says nothing of unsaved changes when there are none', async () => {
    expect(await texts('sources', fake())).toEqual(['  dd.sldd  dictionary  (active)']);
  });
});

describe('ls', () => {
  it("lists the entries under their sections' headings, name, class and value, sections with none left out", async () => {
    const out = await run('ls', fake());
    expect(out.lines.filter((l) => l.kind === 'info').map((l) => l.text)).toEqual(['Design Data', 'Configurations']);
    const entries = out.lines.filter((l) => l.kind === 'out');
    expect(entries.map((l) => l.text.trim().split(/\s{2,}/))).toEqual([
      ['Bus', 'Simulink.Bus'],
      ['Kp', 'double', '1'],
      ['Speed', 'Simulink.Parameter', '30'],
      ['Mode', 'Simulink.data.dictionary.EnumTypeDefinition', 'On'],
      ['Big', 'double', '<1x500 double>'],
      ['Gain1', 'Gain'],
      ['Configuration', 'Simulink.ConfigSet', 'Configuration'],
    ]);
    // Nested rows are not listed: Bus's elements (one of them a Kp) wait for `ls Bus`.
    expect(entries.length).toBe(7);
    for (const l of entries) expect(l.text.startsWith('  ')).toBe(true);
  });

  it('lines the columns up, for a document with no sections as for one with them', async () => {
    const rows = [
      row('binedit:file:///m.mat/Mat', null, 'Mat', { Value: '[1 2 3; 4 5 6]', Class: 'double' }),
      row('binedit:file:///m.mat/Mat/1', 'binedit:file:///m.mat/Mat', 'Mat(1,1)', { Value: '1', Class: 'double' }),
      row('binedit:file:///m.mat/Nd', null, 'Nd', { Value: '<2x3x2 double>', Class: 'double' }),
      row('binedit:file:///m.mat/s', null, 's', { Value: '<1x1 struct>', Class: 'struct' }),
    ];
    const docs = [{ name: 'm.mat', kind: 'mat', active: true, dirty: false }];
    expect((await run('ls', fake({ rows, docs }))).lines).toEqual([
      line('  Mat  double  [1 2 3; 4 5 6]'),
      line('  Nd   double  <2x3x2 double>'),
      line('  s    struct  <1x1 struct>'),
    ]);
  });

  it('cuts a long value at 60 characters', async () => {
    const value = 'x'.repeat(100);
    const rows = [row('u/v', null, 'v', { Value: value, Class: 'char' })];
    const [only] = await texts('ls', fake({ rows }));
    expect(only).toBe(`  v  char  ${'x'.repeat(59)}…`);
  });

  it("lists a row's own rows by its name, and walks a dotted name down", async () => {
    expect((await texts('ls Bus', fake())).map((t) => t.trim().split(/\s{2,}/))).toEqual([
      ['Kp', 'Simulink.BusElement'],
      ['Element', 'Simulink.BusElement'],
    ]);
    // A section is a row too, and its own rows are its entries.
    expect((await texts('ls Configurations', fake())).map((t) => t.trim().split(/\s{2,}/))).toEqual([
      ['Configuration', 'Simulink.ConfigSet', 'Configuration'],
    ]);
  });

  it('says when a row has no rows under it, and when the table has not loaded them', async () => {
    // The entry Kp, not Bus's element: it has none.
    expect((await run('ls Kp', fake())).lines).toEqual([line('"Kp" has no rows under it.', 'info')]);
    expect((await run('ls Big', fake())).lines).toEqual([
      line('The rows under "Big" are not loaded yet: expand it in the table, then ask again.', 'info'),
    ]);
  });

  it('says so of a name that is not there, and of an empty document', async () => {
    expect((await run('ls Nope', fake())).lines).toEqual([line('Nothing is named "Nope" in dd.sldd.', 'error')]);
    expect((await run('ls', fake({ rows: [row('section:design', null, 'Design Data')] }))).lines).toEqual([
      line('dd.sldd has no entries.', 'info'),
    ]);
  });

  it('needs an active document', async () => {
    expect((await run('ls', fake({ docs: [] }))).lines).toEqual([line('No document is open.', 'info')]);
    expect((await run('ls', fake({ docs: [{ ...DD, active: false }] }))).lines).toEqual([line('No document is active.', 'info')]);
  });
});

describe('a name alone', () => {
  it("shows the entry's value: the entry, not a nested row of the same name", async () => {
    expect((await run('Kp', fake())).lines).toEqual([line('Kp = 1')]);
    expect((await run('Speed', fake())).lines).toEqual([line('Speed = 30')]);
  });

  it('shows the class of a row with no value', async () => {
    expect(await texts('Bus', fake())).toEqual(['Bus = <Simulink.Bus>']);
  });

  it("walks a dotted name to a nested row, and reads a column of a row by the column's key", async () => {
    expect(await texts('Bus.Kp', fake())).toEqual(['Bus.Kp = <Simulink.BusElement>']);
    expect(await texts('Speed.Description', fake())).toEqual(['Speed.Description = Top speed']);
    expect(await texts('Speed.DataType', fake())).toEqual(['Speed.DataType = single']);
    expect(await texts('Speed.Unit', fake())).toEqual(['Speed.Unit = km/h']);
  });

  it('finds a block by its key, which no cell prints', async () => {
    expect(await texts('info 7', fake())).toContain('  Name       Gain1');
  });

  it('suggests the name a wrong case meant', async () => {
    expect((await run('speed', fake())).lines).toEqual([line('Nothing is named "speed" in dd.sldd. Did you mean "Speed"?', 'error')]);
  });

  it('says when a dotted name runs into rows the table has not loaded', async () => {
    expect((await run('Big.x', fake())).lines).toEqual([
      line('The rows under "Big" are not loaded yet: expand it in the table, then ask again.', 'info'),
    ]);
  });
});

describe('info', () => {
  it("shows the inspector's groups for the row the name finds", async () => {
    const t = fake();
    expect((await run('info Bus.Kp', t)).lines).toEqual([
      line('General', 'info'),
      line('  Name       Kp'),
      line('  Data Type  single'),
      line('Design', 'info'),
      line('  Value      '.trimEnd()),
    ]);
    expect(t.inspected).toEqual([`${U}/design/Bus/Kp`]);
  });

  it('takes a name in quotes, as one with a space must be', async () => {
    const t = fake();
    await run('info "Design Data"', t);
    expect(t.inspected).toEqual(['section:design']);
  });

  it('says when there is nothing to show, and how to ask', async () => {
    expect((await run('info Kp', fake({ inspect: async () => ({ groups: [] }) }))).lines).toEqual([
      line('No properties to show for "Kp".', 'info'),
    ]);
    expect((await run('info', fake())).lines).toEqual([line('Usage: info <name>', 'error')]);
    expect((await run('info Nope', fake())).lines).toEqual([line('Nothing is named "Nope" in dd.sldd.', 'error')]);
  });
});

describe('json', () => {
  it("shows the row's raw text, line by line", async () => {
    expect(await texts('json Kp', fake())).toEqual(['{', `  "id": "${U}/design/Kp",`, '  "n": 1', '}']);
    const xml = fake({ raw: async () => ({ format: 'xml', text: '<a>\n  <b/>\n</a>\n' }) });
    expect(await texts('json Kp', xml)).toEqual(['<a>', '  <b/>', '</a>']);
  });

  it('shows the first thousand lines of a long text, and says how many more there are', async () => {
    const text = Array.from({ length: 1500 }, (_, i) => `line ${i + 1}`).join('\n');
    const out = await run('json Kp', fake({ raw: async () => ({ format: 'text', text }) }));
    expect(out.lines.length).toBe(1001);
    expect(out.lines[999]).toEqual(line('line 1000'));
    expect(out.lines[1000]).toEqual(line('… 500 more lines.', 'info'));
  });

  it('says why there is no text: none for the row, binary bytes, or no raw view at all', async () => {
    const none = fake({ raw: async () => ({ format: 'none', reason: 'No raw data for this row.' }) });
    expect((await run('json Kp', none)).lines).toEqual([line('No raw data for this row.', 'info')]);
    const hex = fake({ raw: async () => ({ format: 'hex', bytes: new Uint8Array(300) }) });
    expect((await run('json Kp', hex)).lines).toEqual([line('"Kp" holds 300 bytes of binary data.', 'info')]);
    expect((await run('json Kp', fake({ raw: false }))).lines).toEqual([line('Raw data is not available for dd.sldd.', 'error')]);
    expect((await run('json', fake())).lines).toEqual([line('Usage: json <name>', 'error')]);
  });
});

describe('set, and <name> = <value>', () => {
  it("edits the Value cell with the cell's old text, and echoes the value the row now has", async () => {
    const t = fake();
    expect((await run('Kp = 5', t)).lines).toEqual([line('Kp = 5')]);
    expect(t.edits).toEqual([{ rowId: `${U}/design/Kp`, columnId: 'Value', oldValue: '1', newValue: '5' }]);
    expect(await texts('Kp', t)).toEqual(['Kp = 5']);
  });

  it('takes the same edit from set, with or without the =', async () => {
    const t = fake();
    expect(await texts('set Kp 7', t)).toEqual(['Kp = 7']);
    expect(await texts('set Kp = 8', t)).toEqual(['Kp = 8']);
    expect(t.edits.map((e) => [e.columnId, e.oldValue, e.newValue])).toEqual([
      ['Value', '1', '7'],
      ['Value', '7', '8'],
    ]);
  });

  it('sends a Value as typed, a MATLAB expression, quotes and all', async () => {
    const t = fake();
    await run("Speed = 'fast'", t);
    await run('Speed = [1 2 3]', t);
    expect(t.edits.map((e) => e.newValue)).toEqual(["'fast'", '[1 2 3]']);
  });

  it("sets the Description, the Data Type and another editable column, a text column's quotes taken off", async () => {
    const t = fake();
    expect(await texts("Speed.Description = 'Max speed'", t)).toEqual(['Speed.Description = Max speed']);
    expect(await texts('set Speed.Description "Fast"', t)).toEqual(['Speed.Description = Fast']);
    expect(await texts("Speed.DataType = 'double'", t)).toEqual(['Speed.DataType = double']);
    expect(await texts('Speed.Min = 2', t)).toEqual(['Speed.Min = 2']);
    expect(t.edits.map((e) => [e.columnId, e.oldValue, e.newValue])).toEqual([
      ['Description', 'Top speed', 'Max speed'],
      ['Description', 'Max speed', 'Fast'],
      ['DataType', 'single', 'double'],
      ['Min', '0', '2'],
    ]);
  });

  it('renames by the Name column, after which the new name finds the row', async () => {
    const t = fake();
    expect((await run('Kp.Name = Kq', t)).lines).toEqual([line('Renamed "Kp" to "Kq".')]);
    expect(t.edits).toEqual([{ rowId: `${U}/design/Kp`, columnId: 'Name', oldValue: 'Kp', newValue: 'Kq' }]);
    expect(await texts('Kq', t)).toEqual(['Kq = 1']);
  });

  it('edits a nested row by its dotted name', async () => {
    const t = fake({
      rows: [
        row('section:design', null, 'Design Data'),
        row(`${U}/design/s`, 'section:design', 's', { Value: '<1x1 struct>', Class: 'struct' }),
        row(`${U}/design/s/gain`, `${U}/design/s`, 'gain', { Value: '2', _valueEditable: true, Class: 'double' }),
      ],
    });
    expect(await texts('s.gain = 4', t)).toEqual(['s.gain = 4']);
    expect(t.edits[0]!.rowId).toBe(`${U}/design/s/gain`);
  });

  it("refuses a cell the table would not edit, and any property that is not one of the table's columns", async () => {
    const t = fake();
    expect((await run('Bus = 3', t)).lines).toEqual([line('"Bus" has no editable Value.', 'error')]);
    expect((await run("Kp.Description = 'x'", t)).lines).toEqual([line('"Kp" has no editable Description.', 'error')]);
    expect((await run('Speed.Unit = m', t)).lines).toEqual([line('"Speed" has no editable Unit.', 'error')]);
    expect((await run('Bus.Element = 3', t)).lines).toEqual([line('"Bus.Element" has no editable Value.', 'error')]);
    expect((await run('Speed.CoderInfo = 3', t)).lines).toEqual([line("Only the table's columns can be set here.", 'error')]);
    expect(t.edits).toEqual([]);
  });

  it("keeps a choice cell to its choices, a choice's quotes taken off", async () => {
    const t = fake();
    expect(await texts('Mode = Off', t)).toEqual(['Mode = Off']);
    expect(await texts("Mode = 'On'", t)).toEqual(['Mode = On']);
    expect((await run('Mode = Maybe', t)).lines).toEqual([line('"Mode" takes one of: On, Off.', 'error')]);
    expect(t.edits.map((e) => e.newValue)).toEqual(['Off', 'On']);
  });

  it('tells a refused edit by the value the row kept', async () => {
    // The document says why in its own dialog; the window says what is left.
    const t = fake({ refuse: () => true });
    expect((await run('Kp = foo(', t)).lines).toEqual([line('Kp = 1'), line('"Kp" is unchanged.', 'info')]);
    expect((await run('Kp.Name = Ki', t)).lines).toEqual([line('"Kp" was not renamed.', 'error')]);
  });

  it('sends nothing for the value the cell already has', async () => {
    const t = fake();
    expect(await texts('Kp = 1', t)).toEqual(['Kp = 1']);
    expect(t.edits).toEqual([]);
  });

  it('says how to ask, and what is not there', async () => {
    const t = fake();
    expect((await run('Kp =', t)).lines).toEqual([line('Give a value: Kp = <value>', 'error')]);
    expect((await run('set', t)).lines).toEqual([line('Usage: set <name>[.<Column>] <value>', 'error')]);
    expect((await run('set Kp', t)).lines).toEqual([line('Usage: set <name>[.<Column>] <value>', 'error')]);
    expect((await run('Nope = 1', t)).lines).toEqual([line('Nothing is named "Nope" in dd.sldd.', 'error')]);
    expect(t.edits).toEqual([]);
  });

  it('refuses every edit of a document open read-only', async () => {
    const t = fake({ readOnly: true });
    expect((await run('Kp = 5', t)).lines).toEqual([line('dd.sldd is read-only.', 'error')]);
    expect((await run('set Kp 5', t)).lines).toEqual([line('dd.sldd is read-only.', 'error')]);
  });

  it('reads an assignment to a name a command has as an assignment', async () => {
    const t = fake({ rows: [row('u/ls', null, 'ls', { Value: '1', _valueEditable: true })] });
    expect(await texts('ls = 2', t)).toEqual(['ls = 2']);
  });
});

describe('add', () => {
  it('creates an entry of the class in the section the Add gallery would, and names it', async () => {
    const t = fake();
    expect((await run('add Simulink.Parameter p2', t)).lines).toEqual([line('Created "p2" (Simulink.Parameter).')]);
    expect(t.added).toEqual([{ section: 'design', className: 'Simulink.Parameter', rename: false }]);
    expect(t.edits).toEqual([{ rowId: `${U}/design/Param`, columnId: 'Name', oldValue: 'Param', newValue: 'p2' }]);
    expect(await texts('p2', t)).toEqual(['p2 = []']);
  });

  it('keeps the default name without one', async () => {
    const t = fake();
    expect(await texts('add Simulink.Parameter', t)).toEqual(['Created "Param" (Simulink.Parameter).']);
    expect(t.edits).toEqual([]);
  });

  it("takes a class in two sections to the gallery's first, and a class in any case", async () => {
    const t = fake();
    await run('add Simulink.Bus', t);
    await run('add simulink.parameter', t);
    expect(t.added.map((e) => [e.section, e.className])).toEqual([
      ['design', 'Simulink.Bus'],
      ['design', 'Simulink.Parameter'],
    ]);
  });

  it('lists the classes the document takes when asked for one it does not', async () => {
    const classes: AddChoice[] = [
      { className: 'MatlabVariable', section: '', label: 'MATLAB Variable' },
      { className: 'Simulink.Parameter', section: '', label: 'Simulink Parameter' },
    ];
    const t = fake({ classes });
    expect((await run('add Foo', t)).lines).toEqual([
      line('dd.sldd cannot take a "Foo".', 'error'),
      line('It takes: MatlabVariable, Simulink.Parameter', 'info'),
    ]);
    expect((await run('add', t)).lines).toEqual([
      line('Usage: add <class> [<name>]', 'error'),
      line('It takes: MatlabVariable, Simulink.Parameter', 'info'),
    ]);
    expect(t.added).toEqual([]);
  });

  it('says so when the document added nothing, or would not take the name', async () => {
    expect((await run('add Simulink.Parameter', fake({ refuseAdd: true }))).lines).toEqual([
      line('No Simulink.Parameter was added.', 'error'),
    ]);
    const t = fake({ refuse: (e) => e.columnId === 'Name' });
    expect((await run('add Simulink.Parameter p2', t)).lines).toEqual([
      line('Created "Param" (Simulink.Parameter), but could not name it "p2".', 'error'),
    ]);
  });

  it('refuses a document open read-only, and one that takes no entries', async () => {
    expect((await run('add Simulink.Parameter', fake({ readOnly: true }))).lines).toEqual([line('dd.sldd is read-only.', 'error')]);
    expect((await run('add Simulink.Parameter', fake({ classes: null }))).lines).toEqual([
      line('Nothing can be added to dd.sldd.', 'error'),
    ]);
    expect((await run('add Simulink.Parameter', fake({ classes: [] }))).lines).toEqual([
      line('Nothing can be added to dd.sldd.', 'error'),
    ]);
  });
});

describe('addChoicesOf', () => {
  it("offers a dictionary every tile, each naming its section, in the gallery's order", () => {
    expect(addChoicesOf({})).toEqual(allTiles().map((t) => ({ className: t.className, section: t.section, label: t.label })));
    const bus = addChoicesOf({}).filter((c) => c.className === 'Simulink.Bus');
    expect(bus.map((c) => c.section)).toEqual(['design', 'arch']);
  });

  it("offers a MAT-file the classes its view lists, in no section, as the gallery does (no string tile)", () => {
    expect(addChoicesOf({ add: { classes: ['MatlabVariable', 'Simulink.Parameter', 'string'] } })).toEqual([
      { className: 'MatlabVariable', section: '', label: 'MATLAB Variable' },
      { className: 'Simulink.Parameter', section: '', label: 'Simulink Parameter' },
    ]);
  });

  it("offers a model its workspace's classes in no section, and its configuration sets in theirs", () => {
    expect(addChoicesOf({ add: { classes: ['MatlabVariable'] }, addSections: ['config'] })).toEqual([
      { className: 'MatlabVariable', section: '', label: 'MATLAB Variable' },
      { className: 'Simulink.ConfigSet', section: 'config', label: 'Config Set' },
      { className: 'Simulink.ConfigSetRef', section: 'config', label: 'Config Reference' },
    ]);
  });
});

describe('rm', () => {
  it('deletes the row the name finds', async () => {
    const t = fake();
    expect((await run('rm Kp', t)).lines).toEqual([line('Removed "Kp".')]);
    expect(t.removed).toEqual([[`${U}/design/Kp`]]);
    // The element Kp is still there, found now that no entry has the name.
    expect(await texts('Kp', t)).toEqual(['Kp = <Simulink.BusElement>']);
    await run('rm Bus.Element', t);
    expect(t.removed.at(-1)).toEqual([`${U}/design/Bus/Element`]);
  });

  it('refuses a section, and says when the document kept the row', async () => {
    const t = fake({ refuseRemove: true });
    expect((await run('rm "Design Data"', t)).lines).toEqual([line('"Design Data" is a section: remove its entries instead.', 'error')]);
    expect((await run('rm Kp', t)).lines).toEqual([line('"Kp" was not removed.', 'error')]);
    expect(t.removed).toEqual([[`${U}/design/Kp`]]);
  });

  it('says how to ask, and refuses a document open read-only', async () => {
    expect((await run('rm', fake())).lines).toEqual([line('Usage: rm <name>', 'error')]);
    expect((await run('rm Nope', fake())).lines).toEqual([line('Nothing is named "Nope" in dd.sldd.', 'error')]);
    expect((await run('rm Kp', fake({ readOnly: true }))).lines).toEqual([line('dd.sldd is read-only.', 'error')]);
  });
});

describe('save', () => {
  it("shows the save's own message, or says it saved", async () => {
    expect((await run('save', fake())).lines).toEqual([line('Saved dd.sldd.')]);
    expect((await run('save', fake({ save: async () => '' }))).lines).toEqual([line('Saved dd.sldd.')]);
    expect((await run('save', fake({ save: async () => 'Wrote 2 KB.' }))).lines).toEqual([line('Wrote 2 KB.')]);
  });

  it('says why a save failed, and when there is no saving here', async () => {
    const failing = fake({ save: async () => Promise.reject(new Error('disk full')) });
    expect((await run('save', failing)).lines).toEqual([line('Save failed: disk full', 'error')]);
    expect((await run('save', fake({ readOnly: true }))).lines).toEqual([line('dd.sldd cannot be saved here.', 'error')]);
    expect((await run('save', fake({ docs: [] }))).lines).toEqual([line('No document is open.', 'info')]);
  });
});

describe('anything else', () => {
  it('is not a command, and is not run as code', async () => {
    expect((await run('1+2', fake())).lines).toEqual([line('Unrecognized command "1+2". Type "help" for the commands.', 'error')]);
    expect((await run('foo bar', fake())).lines).toEqual([line('Unrecognized command "foo". Type "help" for the commands.', 'error')]);
    expect((await run("alert('x')", fake())).lines).toEqual([
      line('Unrecognized command "alert(\'x\')". Type "help" for the commands.', 'error'),
    ]);
  });

  it('answers a target that throws with the error, as a line', async () => {
    const t = fake();
    t.rows = () => {
      throw new Error('the document closed');
    };
    expect((await run('ls', t)).lines).toEqual([line('the document closed', 'error')]);
    const u = fake({ inspect: async () => Promise.reject(new Error('gone')) });
    expect((await run('info Kp', u)).lines).toEqual([line('gone', 'error')]);
    const v = fake();
    v.docs = () => {
      throw 'not an Error';
    };
    expect((await run('sources', v)).lines).toEqual([line('not an Error', 'error')]);
  });
});

// The commands over the package's own source for a JSON dictionary: its rows, its inspector page,
// its edits and refusals, its add and its delete, and the bytes a save would write.
describe('over a JSON dictionary opened in a workspace', () => {
  async function open() {
    const ws = createWorkspace({ editing: true });
    const doc = await ws.open(readFileSync('test/fixtures/params.sldd'), 'params.sldd');
    const table = doc.table as EditableTableSource;
    const view = await table.open();
    // The rows a connected table would hold, kept as the source repaints them.
    let rows = view.rows;
    // A structural gesture is queued in the source and answered later: its add or delete paints,
    // says the selection it leaves (or a refusal), and writes the text after that, within the same
    // task. An edit sent before the write is done is lost (the source cannot find the entry's text
    // yet), so the gesture is done one task past its selection: `add <class> <name>` renames next.
    const waiting: (() => void)[] = [];
    table.subscribe((change) => {
      if (change.kind === 'replaceAll') rows = change.view.rows;
      if (change.kind === 'updateEntry') rows = spliceEntryRows(rows, change.entryRowId, change.rows) ?? rows;
      if (change.kind === 'insertEntry') rows = insertEntryRows(rows, change.sectionRowId, change.beforeRowId, change.rows) ?? rows;
      if (change.kind === 'select' || change.kind === 'refused' || change.kind === 'error') for (const done of waiting.splice(0)) done();
    });
    table.opened?.();
    const settled = () => new Promise<void>((done) => waiting.push(() => setTimeout(done, 0)));
    const target: CommandTarget = {
      docs: () => [{ name: doc.name, kind: doc.kind, active: true, dirty: doc.dirty }],
      rows: () => rows,
      inspect: (rowId) => table.inspect(rowId),
      edit: (edit) => table.edit(edit),
      addEntry: (entry) => {
        const done = settled();
        table.addEntry(entry);
        return done;
      },
      remove: (rowIds) => {
        const done = settled();
        table.delete(rowIds);
        return done;
      },
      classes: () => addChoicesOf(view),
    };
    return { ws, doc, target };
  }

  it('lists, inspects, edits, refuses, removes and adds', async () => {
    const { ws, doc, target } = await open();
    try {
      expect((await run('ls', target)).lines).toEqual([
        line('Design Data', 'info'),
        line('  Kp  double  1'),
        line('  Uo  double  2'),
        line('  Ki  double  3'),
      ]);

      const info = await texts('info Uo', target);
      expect(info[0]).toBe('General');
      expect(info).toContain('  Data Type  double');

      expect(await texts('Kp = 5', target)).toEqual(['Kp = 5']);
      expect(doc.dirty).toBe(true);
      expect(await texts('Kp', target)).toEqual(['Kp = 5']);

      // Core refuses the expression; the row keeps 5.
      expect((await run('Kp = foo(', target)).lines).toEqual([line('Kp = 5'), line('"Kp" is unchanged.', 'info')]);
      // A name another entry has is refused too.
      expect((await run('Uo.Name = Ki', target)).lines).toEqual([line('"Uo" was not renamed.', 'error')]);

      expect(await texts('rm Ki', target)).toEqual(['Removed "Ki".']);
      expect(await texts('add Simulink.Parameter p2', target)).toEqual(['Created "p2" (Simulink.Parameter).']);
      expect((await texts('ls', target)).map((t) => t.trim().split(/\s{2,}/)[0])).toEqual(['Design Data', 'Kp', 'Uo', 'p2']);

      // And the document holds it all: what a save would write.
      const text = new TextDecoder().decode(doc.serialize().bytes);
      expect(text).toContain('"p2"');
      expect(text).not.toContain('"Ki"');
      expect(JSON.parse(text).__MW_TEXT_PARTS__['__MW_TEXT_PART__/data/chunk0'].__MW_TEXT_content.entries[0]).toMatchObject({
        name: 'Kp',
        value: 5,
      });
    } finally {
      ws.dispose();
    }
  });
});
