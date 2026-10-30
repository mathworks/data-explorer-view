// Copyright 2026 The MathWorks, Inc.
//
// data-explorer-view/host: what only the VS Code extension's host uses, out of the app's model
// entry (D30). Two things hold it.
//
// - Which names it is: the list below, so a name added to or dropped from the entry is a decision
//   someone makes here rather than a change no one sees.
// - They are ./host's alone since 1.0: ./model exports none of them, and an app that imports one
//   from there is told so by TypeScript (no exported member), while one that imports it from
//   ./host compiles clean, with nothing deprecated. Read from the built declarations, through the
//   package's exports, as an app's editor reads them.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import * as host from '../src/host/index.js';
import * as model from '../src/model/index.js';

const ROOT = join(import.meta.dirname, '..');

const VALUES = [
  'BinaryEngine',
  'CopyRefused',
  'DECORATIONS',
  'EditStack',
  'EditStackIndex',
  'HEALTH_QUERY',
  'InspectorPage',
  'JsonEngine',
  'MAX_TABLE_ROWS',
  'MatEngine',
  'SaveMarks',
  'answerChildRequest',
  'answerMatrixRequest',
  'binaryEditSrcId',
  'buildClipboardSnapshot',
  'buildDragSnapshot',
  'capRows',
  'childRowsMessage',
  'clipMarkChange',
  'clipMarkOfDoc',
  'copyEntriesToClipboard',
  'decode',
  'defaultRegistry',
  'dragEntries',
  'encode',
  'findNode',
  'getModel',
  'getModelForBinaryTab',
  'getModelFromBytes',
  'getModelFromParsed',
  'invalidate',
  'matrixCellsMessage',
  'openSourceView',
  'parseDetached',
  'peekModel',
  'postOrFallback',
  'postOrReport',
  'releaseIfUnviewed',
  'releaseSourceView',
  'replacementsIn',
  'rowCapBanner',
  'sameClipMark',
  'sourceSectionOf',
];
const TYPES = [
  'BinaryEngineOptions',
  'BinarySave',
  'CappedRows',
  'CopyDeps',
  'DiskStamp',
  'DocumentRegistry',
  'Edit',
  'EditIndex',
  'EditSink',
  'HealthDecoration',
  'JsonDisk',
  'JsonEngineOptions',
  'JsonTableOptions',
  'JsonUsageFill',
  'JsonUsageReposts',
  'MarkedEdit',
  'MarkedEntry',
  'MatEngineOptions',
  'MatSave',
  'PostTarget',
  'RangeReplacement',
  'SaveMark',
  'SaveSnapshot',
  'SnapshotSession',
  'TabSources',
  'TextStore',
  'TextStoreChange',
  'UsageFill',
  'UsageFiller',
];

describe('data-explorer-view/host', () => {
  it('exports the host plumbing, and only that', () => {
    expect(Object.keys(host).sort()).toEqual(VALUES);
  });

  it('is not on ./model', () => {
    for (const name of VALUES) expect(Object.hasOwn(model, name), name).toBe(false);
  });

  it('compiles clean from ./host, and not at all from ./model', () => {
    const consumer = join(ROOT, 'test', '__host-consumer__.ts');
    const names = [...VALUES, ...TYPES.map((t) => `type ${t}`)].join(', ');
    const use = [...VALUES, ...TYPES].map((n, i) => (TYPES.includes(n) ? `let t${i}: ${n} | undefined;\nvoid t${i};` : `void ${n};`)).join('\n');
    const text = (from: string) => `import { ${names} } from 'data-explorer-view/${from}';\n${use}\n`;
    const compile = (from: string): { errors: string[]; deprecated: string[] } => {
      const source = text(from);
      const options: ts.CompilerOptions = {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ['lib.es2022.d.ts'],
        types: [],
        skipLibCheck: true,
      };
      const service = ts.createLanguageService({
        getScriptFileNames: () => [consumer],
        getScriptVersion: () => '1',
        getScriptSnapshot: (f) => ts.ScriptSnapshot.fromString(f === consumer ? source : (ts.sys.readFile(f) ?? '')),
        getCurrentDirectory: () => ROOT,
        getCompilationSettings: () => options,
        getDefaultLibFileName: ts.getDefaultLibFilePath,
        fileExists: (f) => f === consumer || ts.sys.fileExists(f),
        readFile: (f) => (f === consumer ? source : ts.sys.readFile(f)),
      });
      // The names TypeScript says the entry does not export (2305, or 2724 with a suggestion).
      const errors = service
        .getSemanticDiagnostics(consumer)
        .filter((d) => d.code === 2305 || d.code === 2724)
        .map((d) => source.slice(d.start!, d.start! + d.length!).replace(/^type /, ''));
      const others = service.getSemanticDiagnostics(consumer).filter((d) => d.code !== 2305 && d.code !== 2724);
      if (from === 'host') expect(others.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
      const deprecated = service
        .getSuggestionDiagnostics(consumer)
        .filter((d) => d.code === 6385 || d.code === 6387)
        .map((d) => source.slice(d.start!, d.start! + d.length!).replace(/^type /, ''));
      return { errors: [...new Set(errors)].sort(), deprecated: [...new Set(deprecated)].sort() };
    };
    expect(compile('host')).toEqual({ errors: [], deprecated: [] });
    expect(compile('model').errors).toEqual([...VALUES, ...TYPES].sort());
  }, 120_000);
});
