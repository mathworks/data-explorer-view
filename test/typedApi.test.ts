// Copyright 2026 The MathWorks, Inc.
//
// THE WIDGETS' TYPED API, as an app's TypeScript sees it.
//
// Every `dex-*` event a widget dispatches is declared on HTMLElementEventMap, in the widget's own
// module, with the type of its detail, so `table.addEventListener('dex-row-selected', (e) => …)`
// reads `e.detail.rowIds` with no cast. Two halves pin that:
//
//   * the source: each `new CustomEvent<T>('dex-…')` names its detail type, which is what makes
//     the compiler check the detail it sends, and the module's event map gives that name the same
//     `CustomEvent<T>` — no event dispatched and not declared, none declared and not dispatched;
//   * the build: a consumer file, compiled against dist/ through the package's own entries, listens
//     to every event and reads its detail under `strict`, and a misspelt field is an error.
//
// And custom-elements.json says the same: every widget, its events with these types, attribute
// names as Lit observes them, no private member.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { sourceFiles } from './tools/moduleGraph.js';

const ROOT = process.cwd();
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'));
const TAGS = ['dex-add-gallery', 'dex-column-filter', 'dex-context-menu', 'dex-error-dialog', 'dex-filter-bar', 'dex-icon',
  'dex-matrix-grid', 'dex-matrix-open', 'dex-property-inspector', 'dex-tree-table', 'dex-variable-editor'];

interface ModuleEvents {
  /** Event name → the type argument of each `new CustomEvent<…>` that dispatches it. */
  dispatched: Map<string, string[]>;
  /** Event name → the type its HTMLElementEventMap entry declares. */
  declared: Map<string, string>;
  untyped: string[];
}

function eventsOf(file: string): ModuleEvents {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  const out: ModuleEvents = { dispatched: new Map(), declared: new Map(), untyped: [] };
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'CustomEvent') {
      const name = node.arguments?.[0];
      const where = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      if (!name || !ts.isStringLiteral(name)) out.untyped.push(`${where} (a name that is not a literal)`);
      else if (!node.typeArguments?.length) out.untyped.push(`${where} ${name.text}`);
      else out.dispatched.set(name.text, [...(out.dispatched.get(name.text) ?? []), node.typeArguments[0]!.getText(source)]);
    }
    if (ts.isModuleDeclaration(node) && node.name.getText(source) === 'global') {
      node.forEachChild(function inGlobal(child): void {
        if (ts.isInterfaceDeclaration(child) && child.name.text === 'HTMLElementEventMap') {
          for (const m of child.members) {
            if (ts.isPropertySignature(m) && m.type && ts.isStringLiteral(m.name)) out.declared.set(m.name.text, m.type.getText(source));
          }
        } else child.forEachChild(inGlobal);
      });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return out;
}

const MODULES = sourceFiles(join(ROOT, 'src')).map((rel) => `src/${rel}`).map((file) => [file, eventsOf(file)] as const);

describe('every dispatched event is declared, in its own module, with its detail', () => {
  it('finds the events this test thinks it does', () => {
    // 22 events from 11 widgets: a parse that found none would pass everything below.
    const names = MODULES.flatMap(([, m]) => [...m.dispatched.keys()]);
    expect(new Set(names).size).toBe(22);
    expect(names.every((n) => n.startsWith('dex-'))).toBe(true);
  });

  it('dispatches every CustomEvent with its detail type named', () => {
    expect(MODULES.flatMap(([, m]) => m.untyped)).toEqual([]);
  });

  it.each(MODULES.filter(([, m]) => m.dispatched.size || m.declared.size))('%s declares what it dispatches, no more', (_file, m) => {
    expect([...m.declared.keys()].sort()).toEqual([...m.dispatched.keys()].sort());
    for (const [name, typeArgs] of m.dispatched) {
      for (const t of typeArgs) expect(m.declared.get(name), name).toBe(`CustomEvent<${t}>`);
    }
  });

  it('gives each event name to one module only', () => {
    const owners = new Map<string, string[]>();
    for (const [file, m] of MODULES) for (const name of m.declared.keys()) owners.set(name, [...(owners.get(name) ?? []), file]);
    expect([...owners].filter(([, files]) => files.length > 1)).toEqual([]);
  });
});

describe('custom-elements.json', () => {
  const widgets = MANIFEST.modules.flatMap((mod: any) =>
    (mod.declarations ?? []).filter((d: any) => d.customElement).map((d: any) => ({ path: mod.path as string, ...d })),
  );

  it('lists every widget, under its default tag, at a file a consumer loads', () => {
    expect(widgets.map((w: any) => w.tagName).sort()).toEqual(TAGS);
    for (const w of widgets) expect(existsSync(join(ROOT, w.path)), w.path).toBe(true);
    expect(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).customElements).toBe('custom-elements.json');
  });

  it("lists each widget's events as its module declares them", () => {
    for (const w of widgets) {
      const declared = new Map(MODULES.find(([file]) => file === w.path.replace(/^dist/, 'src').replace(/\.js$/, '.ts'))![1].declared);
      const listed = new Map((w.events ?? []).map((e: any) => [e.name, e.type?.text]));
      expect(listed, w.tagName).toEqual(declared);
      for (const e of w.events ?? []) expect(e.description, `${w.tagName} ${e.name}`).toBeTruthy();
    }
  });

  it('names attributes as Lit observes them, and documents every property', () => {
    for (const w of widgets) {
      const observed = new Set<string>((customElementsObserved.get(w.tagName) ?? []) as string[]);
      expect(new Set((w.attributes ?? []).map((a: any) => a.name)), w.tagName).toEqual(observed);
      for (const m of w.members ?? []) {
        expect(m.name, w.tagName).not.toMatch(/^[_#]/);
        expect(m.privacy ?? 'public', `${w.tagName}.${m.name}`).toBe('public');
        expect(m.description, `${w.tagName}.${m.name} has no JSDoc`).toBeTruthy();
      }
      expect(w.description, `<${w.tagName}> has no JSDoc`).toBeTruthy();
    }
  });
});

// What each widget class observes, by Lit's own reckoning: its static observedAttributes, less
// the attributes of properties its JSDoc marks internal (the error dialog's, which show() fills).
let customElementsObserved: Map<string, string[]>;
beforeAll(async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    const entries = ['tree-table', 'property-inspector', 'variable-editor', 'context-menu', 'error-dialog', 'icon'];
    const out = {};
    for (const e of entries) {
      const m = await import('data-explorer-view/' + e);
      for (const v of Object.values(m)) {
        if (typeof v === 'function' && v.name.startsWith('Dex') && 'observedAttributes' in v) {
          out[v.name] = v.observedAttributes;
        }
      }
    }
    console.log(JSON.stringify(out));`;
  const byClass: Record<string, string[]> = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' }));
  const internal: Record<string, string[]> = {
    DexErrorDialog: ['dialogtitle', 'message', 'detail', 'invalidvalue', 'validvalue', 'showrevert'],
  };
  customElementsObserved = new Map();
  for (const mod of MANIFEST.modules) {
    for (const d of mod.declarations ?? []) {
      if (!d.customElement) continue;
      const all = byClass[d.name];
      if (!all) throw new Error(`${d.name} is on no widget entry`);
      customElementsObserved.set(d.tagName, all.filter((a) => !(internal[d.name] ?? []).includes(a)));
    }
  }
}, 120_000);

describe('an app written in TypeScript, against the built package', () => {
  const CONSUMER = join(ROOT, 'test', '__typed-api-consumer__.ts');
  const text = `
    import { defineTreeTable, type RowSelectedDetail, type MatrixOpenDetail } from 'data-explorer-view/tree-table';
    import { definePropertyInspector } from 'data-explorer-view/property-inspector';
    import { defineVariableEditor, type MatrixCellsAnswer } from 'data-explorer-view/variable-editor';
    import { defineContextMenu } from 'data-explorer-view/context-menu';
    import { defineErrorDialog } from 'data-explorer-view/error-dialog';
    import { defineIcon } from 'data-explorer-view/icon';
    import type { MatrixPayload as ModelPayload, MatrixDescriptor as ModelDescriptor } from 'data-explorer-view/model';
    import type { MatrixPayload as EditorPayload, MatrixDescriptor as EditorDescriptor } from 'data-explorer-view/variable-editor';
    import { rowPlannerFor, childRowsMessage, buildPropertyGroups } from 'data-explorer-view/model';
    import type { TreeTableRow as ModelRow, PropertyGroup as ModelGroup, PropertyRow as ModelPropertyRow, PIPropertyGroup } from 'data-explorer-view/model';
    import type { TreeTableRow as TableRow } from 'data-explorer-view/tree-table';
    import type { PropertyGroup as InspectorGroup, PropertyRow as InspectorRow } from 'data-explorer-view/property-inspector';

    defineTreeTable(); definePropertyInspector(); defineVariableEditor(); defineContextMenu(); defineErrorDialog(); defineIcon();
    const table = document.createElement('dex-tree-table');
    const inspector = document.createElement('dex-property-inspector');
    const menu = document.createElement('dex-context-menu');
    const dialog = document.createElement('dex-error-dialog');
    const bar = document.createElement('dex-filter-bar');
    const popup = document.createElement('dex-column-filter');
    const gallery = document.createElement('dex-add-gallery');
    const glyph = document.createElement('dex-matrix-open');
    const editor = document.createElement('dex-variable-editor');
    const s = (x: string): string => x;
    const b = (x: boolean): boolean => x;
    const n = (x: number): number => x;
    const none = (x: null): null => x;

    table.addEventListener('dex-row-selected', (e) => { const d: RowSelectedDetail = e.detail; d.rowIds.map(s); });
    table.addEventListener('dex-request-children', (e) => s(e.detail.nodeId));
    table.addEventListener('dex-table-context-menu', (e) => { n(e.detail.x); n(e.detail.y); e.detail.rowId?.at(0); e.detail.graphTarget?.at(0); });
    table.addEventListener('dex-row-drag-start', (e) => e.detail.rowIds.map(s));
    table.addEventListener('dex-row-drag-end', (e) => none(e.detail));
    table.addEventListener('dex-row-drop', (e) => { s(e.detail.targetRowId); const m: 'copy' | 'move' = e.detail.mode; s(m); });
    table.addEventListener('dex-edit-text-request', (e) => s(e.detail.rowId));
    table.addEventListener('dex-edit-completed', (e) => { s(e.detail.rowId); s(e.detail.columnId); s(e.detail.oldValue); s(e.detail.newValue); });
    table.addEventListener('dex-link-clicked', (e) => s(e.detail.target));
    table.addEventListener('dex-add-entry', (e) => { s(e.detail.className); s(e.detail.section); s(e.detail.label); b(e.detail.rename); });
    bar.addEventListener('dex-filter-applied', (e) => s(e.detail.text));
    popup.addEventListener('dex-column-filter-applied', (e) => { s(e.detail.column); s(e.detail.op); s(e.detail.value); s(e.detail.text); });
    popup.addEventListener('dex-column-filter-cleared', (e) => s(e.detail.column));
    popup.addEventListener('dex-column-filter-closed', (e) => none(e.detail));
    gallery.addEventListener('dex-add-tile', (e) => { s(e.detail.className); s(e.detail.section); s(e.detail.label); });
    gallery.addEventListener('dex-add-pin-changed', (e) => b(e.detail.pinned));
    gallery.addEventListener('dex-add-closed', (e) => none(e.detail));
    inspector.addEventListener('dex-property-changed', (e) => { s(e.detail.propName); s(e.detail.newValue); s(e.detail.oldValue); });
    inspector.addEventListener('dex-pi-navigate', (e) => s(e.detail.sourceId));
    menu.addEventListener('dex-action', (e) => s(e.detail.actionId));
    dialog.addEventListener('dex-revert', (e) => none(e.detail));
    for (const source of [table, inspector, glyph]) {
      source.addEventListener('dex-matrix-open', (e) => {
        const d: MatrixOpenDetail = e.detail;
        editor.show(d.anchorEl, d.matrix);
        const answer: MatrixCellsAnswer = { nodeId: d.matrix.nodeId, message: 'none' };
        void editor.deliver(answer);
      });
    }

    // @ts-expect-error a field the detail does not have
    table.addEventListener('dex-row-selected', (e) => e.detail.rowId);
    // @ts-expect-error a detail of another event
    table.addEventListener('dex-link-clicked', (e) => e.detail.rowIds);

    // The model's rows and groups go into the widgets as they are, typed, with no cast.
    const planned = rowPlannerFor('a.sldd').payload(null, 10);
    table.rows = planned.rows;
    const first: TableRow | undefined = planned.rows[0];
    s(first?.Name.label ?? '');
    // @ts-expect-error rows are the table's row type, not any
    planned.rows[0]?.Name.nope;
    table.rows = childRowsMessage('n', null, rowPlannerFor('a.mat')).rows;
    const rowsOfModel: ModelRow[] = table.rows;
    void rowsOfModel;
    inspector.groups = buildPropertyGroups(null);
    const groupsOfModel: PIPropertyGroup[] = inspector.groups;
    const inspectorGroups: InspectorGroup[] = groupsOfModel;
    const modelGroups: ModelGroup[] = inspectorGroups;
    const rowOf: InspectorRow | undefined = modelGroups[0]?.properties[0];
    const modelRow: ModelPropertyRow | undefined = rowOf;
    void modelRow;

    // One declaration, named by both entries.
    const p: ModelPayload = { name: 'A', className: 'double', dims: [1, 1], nodeId: 'n', cells: ['1'] };
    const q: EditorPayload = p;
    const r: ModelDescriptor = q;
    const t: EditorDescriptor = r;
    void t;
  `;

  let program: ts.Program;
  beforeAll(() => {
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
      skipLibCheck: true,
    };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;
    host.getSourceFile = (file, lang, ...rest) =>
      file === CONSUMER ? ts.createSourceFile(file, text, lang) : getSourceFile.call(host, file, lang, ...rest);
    host.fileExists = (file) => file === CONSUMER || fileExists.call(host, file);
    host.readFile = (file) => (file === CONSUMER ? text : readFile.call(host, file));
    program = ts.createProgram([CONSUMER], options, host);
  }, 120_000);

  it('reads every detail with no cast, and is told about a field that is not there', () => {
    const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });

  it('resolves the package through its entries to dist/, not to src/', () => {
    const files = program.getSourceFiles().map((f) => f.fileName).filter((f) => f.startsWith(ROOT) && !f.includes('node_modules'));
    expect(files.filter((f) => f !== CONSUMER && !f.startsWith(join(ROOT, 'dist')))).toEqual([]);
    expect(files.some((f) => f.endsWith('dist/widgets/tree-table/dex-tree-table.d.ts'))).toBe(true);
  });

  it('names one declaration for each type the model and a widget entry share', () => {
    const checker = program.getTypeChecker();
    const consumer = program.getSourceFile(CONSUMER)!;
    // The interface an imported name stands for, through any re-export and type alias.
    const declarationOf = (local: string): string => {
      let found: ts.Symbol | undefined;
      consumer.forEachChild(function find(node): void {
        if (ts.isImportSpecifier(node) && node.name.text === local) found = checker.getSymbolAtLocation(node.name);
        node.forEachChild(find);
      });
      const declared = checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(found!));
      const decl = declared.symbol!.declarations![0]!;
      return `${relative(ROOT, decl.getSourceFile().fileName)}:${decl.pos}`;
    };
    expect(declarationOf('EditorPayload')).toBe(declarationOf('ModelPayload'));
    expect(declarationOf('EditorDescriptor')).toBe(declarationOf('ModelDescriptor'));
    expect(declarationOf('ModelPayload')).toContain('dist/model/matrix/matrixPayload.d.ts');
    expect(declarationOf('TableRow')).toBe(declarationOf('ModelRow'));
    expect(declarationOf('ModelRow')).toContain('dist/model/rows/tableRow.d.ts');
    expect(declarationOf('InspectorGroup')).toBe(declarationOf('ModelGroup'));
    expect(declarationOf('PIPropertyGroup')).toBe(declarationOf('ModelGroup'));
    expect(declarationOf('InspectorRow')).toBe(declarationOf('ModelPropertyRow'));
    expect(declarationOf('ModelGroup')).toContain('dist/model/inspector/piBuilder.d.ts');
  });
});
