// Copyright 2026 The MathWorks, Inc.
// The property inspector alone, fed for one row: pick an entry of a file, and the inspector shows
// that entry's properties, as it would for the row selected in a table. With no table, the page's
// own list is what the inspector follows: an InspectorFeed of its picks.
import { createWorkspace, isSectionRowId, type Doc, type InspectorFeed, type InspectorView } from 'data-explorer-view/model';
import { connectInspector, definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { askedFixture, fixturePicker, openFixture, type Fixture } from '../fixtures';
import { byId, logEvents, startPage } from '../shell';

startPage();
definePropertyInspector(); // <dex-property-inspector>, and the matrix glyph its Value rows draw

const entries = byId<HTMLSelectElement>('entries');
logEvents(byId('stage'), ['dex-matrix-open', 'dex-pi-navigate', 'dex-property-changed'], byId('event-log'));

const ws = createWorkspace();
let doc: Doc | null = null;

// The pages of the picks: what the inspector shows for the entry picked.
const listeners = new Set<(page: InspectorView) => void>();
const picks: InspectorFeed = {
  onPage: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  matrix: async (nodeId) => (doc ? doc.table.matrix(nodeId) : { nodeId, message: 'No file is open.' }),
};
connectInspector(byId<DexPropertyInspector>('inspector'), picks, { empty: byId('inspector-empty') });

async function show(fixture: Fixture): Promise<void> {
  doc?.dispose();
  doc = null;
  await showEntry();
  const opened = await openFixture(ws, fixture);
  doc = opened;
  // The file's entries, as the rows of its table: an entry is a row right under a section
  // (a dictionary's, a model's) or at the top (a MAT-file's variables).
  entries.replaceChildren();
  for (const row of (await opened.table.open()).rows) {
    const top = row.parent === null || isSectionRowId(row.parent);
    if (top && !isSectionRowId(row.ID)) entries.append(new Option(row.Name.label, row.ID));
  }
  entries.selectedIndex = 0;
  await showEntry();
}

async function showEntry(): Promise<void> {
  const page = doc && entries.value ? await doc.table.inspect(entries.value) : { groups: [] };
  for (const listener of [...listeners]) listener(page);
}

entries.addEventListener('change', () => void showEntry());
const first = askedFixture();
byId('toolbar').append(fixturePicker(first, (f) => void show(f)));
void show(first);
