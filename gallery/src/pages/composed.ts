// Copyright 2026 The MathWorks, Inc.
// Table, inspector and variable editor together, as an app wires them: the table's selection
// drives the inspector, and the matrix glyph (in a Value cell or the inspector's Value row)
// opens the one variable editor.
import { definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { defineTreeTable } from 'data-explorer-view/tree-table';
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { askedFixture, fixturePicker, type Fixture } from '../fixtures';
import { byId, startPage } from '../shell';
import { closeDocument, openFixture, type OpenDocument } from '../wiring/documents';
import { wireInspector } from '../wiring/inspectorWiring';
import { wireMatrix } from '../wiring/matrixWiring';
import { childRows, matrixCells, tablePayload } from '../wiring/tableData';
import { wireTable } from '../wiring/tableWiring';

startPage();
defineTreeTable();
definePropertyInspector();
defineVariableEditor();

const stage = byId('stage');
const editor = byId<DexVariableEditor>('editor');
const inspector = wireInspector(byId<DexPropertyInspector>('inspector'), byId('inspector-empty'));
let doc: OpenDocument | null = null;
wireMatrix(document, editor, (nodeId) => (doc ? matrixCells(doc, nodeId) : null));

async function show(fixture: Fixture): Promise<void> {
  if (doc) closeDocument(doc);
  doc = null;
  editor.close();
  inspector.clear();
  stage.querySelector('dex-tree-table')?.remove();
  const table = document.createElement('dex-tree-table');
  table.readonly = true;
  table.storageKey = `dex-gallery:${fixture.id}`;
  stage.append(table);
  const wired = wireTable(table, {
    children: (nodeId) => (doc ? childRows(doc, nodeId).rows : []),
    select: (rowIds) => {
      if (doc) inspector.show(doc.uri, rowIds);
    },
  });
  const opened = await openFixture(fixture);
  if (!table.isConnected) {
    closeDocument(opened); // another file was picked meanwhile
    return;
  }
  doc = opened;
  wired.setPayload(tablePayload(opened));
  const params = new URLSearchParams(location.search);
  params.set('fixture', fixture.id);
  history.replaceState(null, '', `?${params}`);
}

const first = askedFixture();
byId('toolbar').append(fixturePicker(first, (f) => void show(f)));
void show(first);
