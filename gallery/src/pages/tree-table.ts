// Copyright 2026 The MathWorks, Inc.
// The tree table alone: one file at a time, its read-only switch, and every event it sends.
// Nothing answers the events here but the lazy-children request; the composed page wires the
// selection and the matrix glyph to the other widgets.
import { defineTreeTable, type DexTreeTable } from 'data-explorer-view/tree-table';
import { askedFixture, fixturePicker, type Fixture } from '../fixtures';
import { byId, logEvents, startPage } from '../shell';
import { closeDocument, openFixture, type OpenDocument } from '../wiring/documents';
import { childRows, tablePayload } from '../wiring/tableData';
import { wireTable } from '../wiring/tableWiring';

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

let doc: OpenDocument | null = null;
let table: DexTreeTable | null = null;

async function show(fixture: Fixture): Promise<void> {
  if (doc) closeDocument(doc);
  doc = null;
  table?.remove();
  const el = document.createElement('dex-tree-table');
  table = el;
  el.readonly = readonly.checked;
  // Where the table keeps this file's column choices.
  el.storageKey = `dex-gallery:${fixture.id}`;
  stage.append(el);
  const wired = wireTable(el, {
    children: (nodeId) => (doc ? childRows(doc, nodeId).rows : []),
    select: () => {},
  });
  const opened = await openFixture(fixture);
  if (!el.isConnected) {
    closeDocument(opened); // another file was picked meanwhile
    return;
  }
  doc = opened;
  wired.setPayload(tablePayload(opened));
  const params = new URLSearchParams(location.search);
  params.set('fixture', fixture.id);
  history.replaceState(null, '', `?${params}`);
}

readonly.addEventListener('change', () => {
  if (table) table.readonly = readonly.checked;
});
const first = askedFixture();
byId('toolbar').prepend(fixturePicker(first, (f) => void show(f)));
void show(first);
