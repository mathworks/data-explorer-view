// Copyright 2026 The MathWorks, Inc.
// The property inspector alone, fed for one row: pick an entry of a file, and the inspector
// shows that entry's properties, as it would for the row selected in a table.
import { isSectionRowId } from 'data-explorer-view/model';
import { definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { askedFixture, fixturePicker, type Fixture } from '../fixtures';
import { byId, logEvents, startPage } from '../shell';
import { closeDocument, openFixture, type OpenDocument } from '../wiring/documents';
import { wireInspector } from '../wiring/inspectorWiring';
import { tablePayload } from '../wiring/tableData';

startPage();
definePropertyInspector(); // <dex-property-inspector>, and the matrix glyph its Value rows draw

const entries = byId<HTMLSelectElement>('entries');
const inspector = wireInspector(byId<DexPropertyInspector>('inspector'), byId('inspector-empty'));
logEvents(byId('stage'), ['dex-matrix-open', 'dex-pi-navigate', 'dex-property-changed'], byId('event-log'));

let doc: OpenDocument | null = null;

async function show(fixture: Fixture): Promise<void> {
  if (doc) closeDocument(doc);
  inspector.clear();
  const opened = await openFixture(fixture);
  doc = opened;
  // The file's entries, as the rows of its table: an entry is a row right under a section
  // (a dictionary's, a model's) or at the top (a MAT-file's variables).
  entries.replaceChildren();
  for (const row of tablePayload(opened).rows) {
    const top = row.parent === null || isSectionRowId(row.parent);
    if (top && !isSectionRowId(row.ID)) entries.append(new Option(row.Name.label, row.ID));
  }
  entries.selectedIndex = 0;
  showEntry();
}

function showEntry(): void {
  if (doc && entries.value) inspector.show(doc.uri, [entries.value]);
  else inspector.clear();
}

entries.addEventListener('change', showEntry);
const first = askedFixture();
byId('toolbar').append(fixturePicker(first, (f) => void show(f)));
void show(first);
