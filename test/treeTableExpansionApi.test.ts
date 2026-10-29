// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// THE EXPANSION, IN PUBLIC.
//
// Which rows are open lived in a private field, `_expandedIds`, and an app had to reach into it
// for the two things every table needs: open the top level when a file first shows (a dictionary
// otherwise opens as four closed section rows), and keep what the user opened across a repaint.
// VS Code's page still does exactly that through the field, so the field works as it did; next to
// it there is now `expandedIds`, `expand()`/`collapse()`, and `expandTopLevel`, which keeps the
// expansion in the table the way VS Code's page keeps it by hand.
import { describe, it, expect, beforeEach } from 'vitest';
import { DexTreeTable, defineTreeTable, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';
import { nextExpandedIds } from '../src/model/actions/rowUpdates.js';

defineTreeTable();

const row = (id: string, parent: string | null, extra: Partial<TreeTableRow> = {}): TreeTableRow => ({
  ID: id,
  parent,
  Name: { label: id },
  Value: '',
  DataType: '',
  Description: '',
  Status: '',
  ...extra,
});

// Two sections, an entry with a child, and a section whose entries were held back.
const ROWS = [
  row('section:A', null),
  row('a1', 'section:A'),
  row('a1.x', 'a1'),
  row('section:B', null),
  row('b1', 'section:B'),
  row('section:Lazy', null, { _lazy: true } as Partial<TreeTableRow>),
];

async function mount(configure: (t: DexTreeTable) => void = () => {}): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = ['Name', 'Value'];
  configure(table);
  document.body.appendChild(table);
  await table.updateComplete;
  return table;
}

const shown = (t: DexTreeTable): string[] =>
  Array.from(t.shadowRoot!.querySelectorAll('tr[data-row-id]')).map((tr) => tr.getAttribute('data-row-id')!);

async function give(t: DexTreeTable, rows: TreeTableRow[]): Promise<void> {
  t.rows = rows;
  await t.updateComplete;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('by default, as before', () => {
  it('opens nothing when rows arrive, and keeps an expansion across a change of rows, gone ids too', async () => {
    const table = await mount();
    await give(table, ROWS);
    expect(shown(table)).toEqual(['section:A', 'section:B', 'section:Lazy']);
    table.expandedIds = ['section:A', 'a1', 'gone'];
    await give(table, ROWS.filter((r) => r.ID !== 'b1'));
    expect(table.expandedIds).toEqual(new Set(['section:A', 'a1', 'gone']));
    expect(table.expandTopLevel).toBe(false);
  });

  it('still answers to the private field VS Code writes, both ways', async () => {
    const table = await mount();
    await give(table, ROWS);
    (table as any)._expandedIds = new Set(['section:B']);
    await table.updateComplete;
    expect(shown(table)).toEqual(['section:A', 'section:B', 'b1', 'section:Lazy']);
    expect(table.expandedIds).toEqual(new Set(['section:B']));
    table.expandedIds = ['section:A'];
    expect((table as any)._expandedIds).toEqual(new Set(['section:A']));
  });
});

describe('expandedIds', () => {
  it('opens exactly the rows it is set to, from any iterable', async () => {
    const table = await mount();
    await give(table, ROWS);
    table.expandedIds = new Set(['section:A', 'a1']);
    await table.updateComplete;
    expect(shown(table)).toEqual(['section:A', 'a1', 'a1.x', 'section:B', 'section:Lazy']);
    table.expandedIds = ['section:B'];
    await table.updateComplete;
    expect(shown(table)).toEqual(['section:A', 'section:B', 'b1', 'section:Lazy']);
  });

  it('reads what the user opened, as a copy the caller may change', async () => {
    const table = await mount();
    await give(table, ROWS);
    (table.shadowRoot!.querySelector('tr[data-row-id="section:B"] .toggle') as HTMLElement).click();
    await table.updateComplete;
    const read = table.expandedIds;
    expect(read).toEqual(new Set(['section:B']));
    read.add('section:A');
    await table.updateComplete;
    expect(shown(table)).not.toContain('a1');
  });

  it('is what an app keeps across a repaint with nextExpandedIds', async () => {
    const table = await mount();
    await give(table, ROWS);
    table.expandedIds = ['section:A', 'a1'];
    const before = table.expandedIds;
    const next = ROWS.filter((r) => r.ID !== 'a1.x' && r.ID !== 'a1');
    table.rows = next;
    table.expandedIds = nextExpandedIds(before, next);
    await table.updateComplete;
    expect(table.expandedIds).toEqual(new Set(['section:A']));
  });
});

describe('expand() and collapse()', () => {
  it('open as the twisty does: a row with nothing under it stays closed', async () => {
    const table = await mount();
    await give(table, ROWS);
    table.expand(['section:A', 'a1', 'b1', 'nope']);
    await table.updateComplete;
    expect(table.expandedIds).toEqual(new Set(['section:A', 'a1']));
    table.collapse(['a1']);
    await table.updateComplete;
    expect(shown(table)).toEqual(['section:A', 'a1', 'section:B', 'section:Lazy']);
  });

  it('ask for a deferred row’s children once, as its first click does', async () => {
    const table = await mount();
    await give(table, ROWS);
    const asked: string[] = [];
    table.addEventListener('dex-request-children', (e) => asked.push((e as CustomEvent).detail.nodeId));
    table.expand(['section:Lazy']);
    table.collapse(['section:Lazy']);
    table.expand(['section:Lazy']);
    await table.updateComplete;
    expect(asked).toEqual(['section:Lazy']);
    expect(table.expandedIds.has('section:Lazy')).toBe(true);
  });

  it('read the rows just assigned, before the table has drawn them', async () => {
    const table = await mount();
    table.rows = ROWS;
    table.expand(['section:B']);
    await table.updateComplete;
    expect(shown(table)).toContain('b1');
  });
});

describe('expandTopLevel', () => {
  it('is the attribute expand-top-level', () => {
    const el = document.createElement('dex-tree-table') as DexTreeTable;
    el.setAttribute('expand-top-level', '');
    expect(el.expandTopLevel).toBe(true);
  });

  it('opens the top level of the first rows with any in them, but not a deferred row', async () => {
    const table = await mount((t) => (t.expandTopLevel = true));
    await give(table, []);
    expect(table.expandedIds).toEqual(new Set());
    await give(table, ROWS);
    expect(table.expandedIds).toEqual(new Set(['section:A', 'section:B']));
    expect(shown(table)).toEqual(['section:A', 'a1', 'section:B', 'b1', 'section:Lazy']);
  });

  it('works when the rows come with the switch, before the table is connected', async () => {
    const table = await mount((t) => {
      t.expandTopLevel = true;
      t.rows = ROWS;
    });
    expect(table.expandedIds).toEqual(new Set(['section:A', 'section:B']));
  });

  it('then keeps what the user opened while it exists, and what they closed closed', async () => {
    const table = await mount((t) => (t.expandTopLevel = true));
    await give(table, ROWS);
    table.collapse(['section:B']);
    table.expand(['a1']);
    await table.updateComplete;
    // The file changed on disk: a1 went, a new entry came. B stays closed.
    await give(table, [...ROWS.filter((r) => r.ID !== 'a1' && r.ID !== 'a1.x'), row('b2', 'section:B')]);
    expect(table.expandedIds).toEqual(new Set(['section:A']));
    // An entry that comes back comes back closed: its id left the expansion with it (unlike the
    // default, which keeps every id it was given).
    await give(table, ROWS);
    expect(table.expandedIds).toEqual(new Set(['section:A']));
    expect(shown(table)).toEqual(['section:A', 'a1', 'section:B', 'section:Lazy']);
  });

  it('turned on after rows were shown, keeps the expansion rather than reopening the top level', async () => {
    const table = await mount();
    await give(table, ROWS);
    table.expandTopLevel = true;
    await give(table, [...ROWS]);
    expect(table.expandedIds).toEqual(new Set());
  });
});
