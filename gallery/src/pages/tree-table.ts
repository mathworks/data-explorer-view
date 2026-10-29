// Copyright 2026 The MathWorks, Inc.
// The tree table alone: one file at a time, its read-only switch, and every event it sends. The
// file is read in the page, and connectTable feeds the table from it; the composed page adds the
// inspector and the variable editor.
import { createWorkspace, type Doc } from 'data-explorer-view/model';
import { connectTable, defineTreeTable, type TableHandle } from 'data-explorer-view/tree-table';
import { askedFixture, fixturePicker, openFixture, type Fixture } from '../fixtures';
import { byId, logEvents, startPage } from '../shell';

startPage();
defineTreeTable(); // <dex-tree-table>, and the filter bar, column filter and Add gallery it draws

const stage = byId('stage');
const readonly = byId<HTMLInputElement>('readonly');
logEvents(
  stage,
  [
    'dex-row-selected',
    'dex-request-children',
    'dex-link-clicked',
    'dex-matrix-open',
    'dex-table-context-menu',
    'dex-edit-completed',
    'dex-edit-text-request',
    'dex-add-entry',
    'dex-row-drag-start',
    'dex-row-drop',
  ],
  byId('event-log'),
);

// `?budget=5` paints five rows' worth and holds the rest back, as a file too large to show at once
// is painted: the banner says so, and a row's children load as it is opened.
const budget = Number(new URLSearchParams(location.search).get('budget'));
const ws = createWorkspace(budget >= 1 ? { rowBudget: budget } : {});
let shown: { doc: Doc; handle: TableHandle } | null = null;

async function show(fixture: Fixture): Promise<void> {
  shown?.handle.table.remove();
  shown?.handle.dispose();
  shown?.doc.dispose();
  shown = null;
  const table = document.createElement('dex-tree-table');
  table.readonly = readonly.checked;
  // Where the table keeps this file's column choices.
  table.storageKey = `dex-gallery:${fixture.id}`;
  stage.append(table);
  const doc = await openFixture(ws, fixture);
  if (!table.isConnected) return void doc.dispose(); // another file was picked meanwhile
  shown = { doc, handle: connectTable(table, doc.table) };
  const params = new URLSearchParams(location.search);
  params.set('fixture', fixture.id);
  history.replaceState(null, '', `?${params}`);
}

readonly.addEventListener('change', () => {
  if (shown) shown.handle.table.readonly = readonly.checked;
});
const first = askedFixture();
byId('toolbar').prepend(fixturePicker(first, (f) => void show(f)));
void show(first);
