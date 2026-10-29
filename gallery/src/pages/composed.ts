// Copyright 2026 The MathWorks, Inc.
// Folder, table, inspector and variable editor together, as an app wires them: the folder's
// hierarchy on the left (connectHierarchy), a file chosen there or in the picker read in the page,
// connectTable feeding the table from it, and connectInspector following the table's selection.
// The matrix glyph (in a Value cell or the inspector's Value row) opens the one variable editor.
import { connectHierarchy, defineHierarchy, type DexHierarchy } from 'data-explorer-view/hierarchy';
import { createWorkspace, type Doc } from 'data-explorer-view/model';
import { connectInspector, definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { connectTable, defineTreeTable, type TableHandle } from 'data-explorer-view/tree-table';
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { askedFixture, FIXTURES, fixturePicker, openFixture, type Fixture } from '../fixtures';
import { FIXTURE_FOLDER, folderHierarchy, uriOf } from '../folders';
import { byId, startPage } from '../shell';

startPage();
defineTreeTable();
definePropertyInspector();
defineVariableEditor();
defineHierarchy();

const stage = byId('stage');
const editor = byId<DexVariableEditor>('editor');
const inspector = byId<DexPropertyInspector>('inspector');
const ws = createWorkspace();
let shown: { doc: Doc; table: TableHandle; dispose(): void } | null = null;

async function show(fixture: Fixture): Promise<void> {
  shown?.dispose();
  shown = null;
  editor.close();
  const table = document.createElement('dex-tree-table');
  table.readonly = true;
  table.storageKey = `dex-gallery:${fixture.id}`;
  stage.append(table);
  const doc = await openFixture(ws, fixture);
  if (!table.isConnected) return void doc.dispose(); // another file was picked meanwhile
  const handle = connectTable(table, doc.table, { variableEditor: editor });
  const pi = connectInspector(inspector, handle, { empty: byId('inspector-empty') });
  shown = {
    doc,
    table: handle,
    dispose() {
      pi.dispose();
      handle.dispose();
      table.remove();
      doc.dispose();
    },
  };
  const params = new URLSearchParams(location.search);
  params.set('fixture', fixture.id);
  history.replaceState(null, '', `?${params}`);
}

const first = askedFixture();
byId('toolbar').append(fixturePicker(first, (f) => void show(f)));
void show(first);

// A file chosen in the folder opens as one picked: the folder lists the picker's files.
const folder = connectHierarchy(byId<DexHierarchy>('folder'), folderHierarchy(FIXTURE_FOLDER));
folder.on('open', (uri) => {
  const fixture = FIXTURES.find((f) => uriOf(`${FIXTURE_FOLDER.path}/${f.name}`) === uri);
  if (!fixture) return;
  byId<HTMLSelectElement>('fixture').value = fixture.id;
  void show(fixture);
});
