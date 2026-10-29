// Copyright 2026 The MathWorks, Inc.
// Table, inspector and variable editor together, as an app wires them: a file read in the page,
// connectTable feeding the table from it, and connectInspector following the table's selection.
// The matrix glyph (in a Value cell or the inspector's Value row) opens the one variable editor.
import { createWorkspace, type Doc } from 'data-explorer-view/model';
import { connectInspector, definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { connectTable, defineTreeTable, type TableHandle } from 'data-explorer-view/tree-table';
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { askedFixture, fixturePicker, openFixture, type Fixture } from '../fixtures';
import { byId, startPage } from '../shell';

startPage();
defineTreeTable();
definePropertyInspector();
defineVariableEditor();

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
