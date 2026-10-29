// Copyright 2026 The MathWorks, Inc.
//
// data-explorer-view/host: what only a host serving the wire format uses, out of the app's model
// entry (D30). Three things hold it.
//
// - Which names it is: the list below, so a name added to or dropped from the entry is a decision
//   someone makes here rather than a change no one sees.
// - Until 1.0, ./model exports each of them too, as the SAME value, so nothing importing one from
//   ./model breaks during 0.x.
// - There, each is deprecated in a way an editor shows: imported from ./model, TypeScript reports
//   it as deprecated (diagnostic 6385/6387), and imported from ./host it does not. Read from the
//   built declarations, through the package's exports, as an app's editor reads them.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import * as host from '../src/host/index.js';
import * as model from '../src/model/index.js';

const ROOT = join(import.meta.dirname, '..');

const VALUES = [
  'DECORATIONS',
  'HEALTH_QUERY',
  'InspectorPage',
  'MAX_TABLE_ROWS',
  'answerChildRequest',
  'answerMatrixRequest',
  'binaryEditSrcId',
  'capRows',
  'childRowsMessage',
  'decode',
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
  'rowCapBanner',
];
const TYPES = ['CappedRows', 'HealthDecoration', 'PostTarget', 'TabSources', 'UsageFiller'];

describe('data-explorer-view/host', () => {
  it('exports the host plumbing, and only that', () => {
    expect(Object.keys(host).sort()).toEqual(VALUES);
  });

  it('is still ./model, value for value, until 1.0', () => {
    for (const name of VALUES) expect((model as Record<string, unknown>)[name], name).toBe((host as Record<string, unknown>)[name]);
  });

  it('is deprecated where ./model exports it, and nowhere else', () => {
    const consumer = join(ROOT, 'test', '__host-consumer__.ts');
    const names = [...VALUES, ...TYPES.map((t) => `type ${t}`)].join(', ');
    const use = [...VALUES, ...TYPES].map((n, i) => (TYPES.includes(n) ? `let t${i}: ${n} | undefined;\nvoid t${i};` : `void ${n};`)).join('\n');
    const text = (from: string) => `import { ${names} } from 'data-explorer-view/${from}';\n${use}\n`;
    const deprecated = (from: string): string[] => {
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
      expect(service.getSemanticDiagnostics(consumer).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')), from).toEqual([]);
      const flagged = service
        .getSuggestionDiagnostics(consumer)
        .filter((d) => d.code === 6385 || d.code === 6387)
        .map((d) => source.slice(d.start!, d.start! + d.length!).replace(/^type /, ''));
      return [...new Set(flagged)].sort();
    };
    expect(deprecated('model')).toEqual([...VALUES, ...TYPES].sort());
    expect(deprecated('host')).toEqual([]);
  }, 120_000);
});
