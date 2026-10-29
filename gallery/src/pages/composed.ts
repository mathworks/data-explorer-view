// Copyright 2026 The MathWorks, Inc.
// Folder, table, inspector and variable editor together, as an app wires them: the folders'
// hierarchy on the left (connectHierarchy), a file chosen there or in the picker read in the page,
// connectTable feeding the table from it, and connectInspector following the table's selection.
// The matrix glyph (in a Value cell or the inspector's Value row) opens the one variable editor.
//
// The workspace fills the Usage column over the same folders (its `usage`), so a dictionary entry
// names the blocks that use it in either model of usageorder; a click on one opens that model on
// the block, resolved by the rule the hierarchy draws with (resolveNavSource).
import { connectHierarchy, defineHierarchy, type DexHierarchy } from 'data-explorer-view/hierarchy';
import { basename, createWorkspace, resolveNavSource, srcIdToUriString, type Doc, type LinkTarget } from 'data-explorer-view/model';
import { connectInspector, definePropertyInspector, type DexPropertyInspector } from 'data-explorer-view/property-inspector';
import { connectTable, defineTreeTable, type TableHandle } from 'data-explorer-view/tree-table';
import { defineVariableEditor, type DexVariableEditor } from 'data-explorer-view/variable-editor';
import { askedFixture, FIXTURES, fixturePicker, openFixture, type Fixture } from '../fixtures';
import { FIXTURE_FOLDER, folderHierarchy, folderUsage, readingOf, uriOf, USAGE_ORDER } from '../folders';
import { byId, startPage } from '../shell';

startPage();
defineTreeTable();
definePropertyInspector();
defineVariableEditor();
defineHierarchy();

// The picker's files, and usageorder's: every file of the folders on the left.
const LABELS: Record<string, string> = {
  'ctrlA.slx': 'Model sharing a dictionary',
  'plantB.slx': 'Model sharing a dictionary',
  'sharedParams.sldd': 'Dictionary two models use',
};
const FILES: readonly Fixture[] = [
  ...FIXTURES,
  ...Object.entries(USAGE_ORDER.files).map(([name, url]) => ({
    id: `usageorder-${name}`,
    name,
    label: LABELS[name] ?? name,
    url,
    uri: uriOf(`${USAGE_ORDER.path}/${name}`),
  })),
];
const uriOfFixture = (f: Fixture): string => f.uri ?? uriOf(`${FIXTURE_FOLDER.path}/${f.name}`);

const reading = readingOf(FIXTURE_FOLDER, USAGE_ORDER);
const hierarchy = folderHierarchy(reading);
const stage = byId('stage');
const editor = byId<DexVariableEditor>('editor');
const inspector = byId<DexPropertyInspector>('inspector');
const ws = createWorkspace({ usage: folderUsage(reading) });
let shown: { doc: Doc; table: TableHandle; dispose(): void } | null = null;
let asked = 0;

async function show(fixture: Fixture): Promise<TableHandle | null> {
  const ask = ++asked;
  shown?.dispose();
  shown = null;
  editor.close();
  // A table still opening for an earlier pick goes too.
  for (const old of stage.querySelectorAll('dex-tree-table')) old.remove();
  const table = document.createElement('dex-tree-table');
  table.readonly = true;
  table.storageKey = `dex-gallery:${fixture.id}`;
  stage.append(table);
  const doc = await openFixture(ws, fixture);
  if (ask !== asked) {
    doc.dispose(); // another file was picked meanwhile
    return null;
  }
  const handle = connectTable(table, doc.table, { variableEditor: editor });
  const pi = connectInspector(inspector, handle, { empty: byId('inspector-empty') });
  handle.on('navigate', ({ link }) => void follow(link, doc.uri));
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
  byId<HTMLSelectElement>('fixture').value = fixture.id;
  const params = new URLSearchParams(location.search);
  params.set('fixture', fixture.id);
  history.replaceState(null, '', `?${params}`);
  return handle;
}

// A link to another document: its file, found as the hierarchy finds it for this one, and the row
// the link names in it (a block by its key, an entry or a parameter by its name).
async function follow(link: LinkTarget, from: string): Promise<void> {
  const source = link.kind === 'file' ? link.file : srcIdToUriString(link.source);
  const uri = await resolveNavSource(source, from, {
    scoped: (ref, referrer) => hierarchy.resolveReference(ref, referrer),
    firstMatch: async (ref) => reading.files.find((f) => basename(f.path).toLowerCase() === ref.toLowerCase())?.uriString,
  });
  const fixture = FILES.find((f) => uriOfFixture(f) === uri);
  if (!fixture) return;
  const handle = await show(fixture);
  if (handle && link.kind !== 'file') handle.selectByName(link.kind === 'block' ? link.block : link.name);
}

const first = askedFixture(FILES);
byId('toolbar').append(fixturePicker(first, (f) => void show(f), FILES));
void show(first);

// A file chosen in the folder opens as one picked.
const folder = connectHierarchy(byId<DexHierarchy>('folder'), hierarchy);
folder.on('open', (uri) => {
  const fixture = FILES.find((f) => uriOfFixture(f) === uri);
  if (fixture) void show(fixture);
});
