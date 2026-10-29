// Copyright 2026 The MathWorks, Inc.
// The unit test that is slow on purpose says so, with its own ceiling, rather than running
// under vitest's default (5 s for a test).
//
// rowBuilder's "builds every row instead of overflowing the argument limit" builds 200,000
// rows, because that is what overflowed. It takes ~250 ms on an idle machine and timed out at
// 5,683 ms and 5,252 ms on loaded ones (2026-10-03 and 10-04). A default ceiling is sized for an
// idle machine, so it failed under load with nothing wrong. Raising the global default instead
// was rejected: it would hide a real slowdown in every other test.
//
// No run can make the timeout happen on demand, since the repro is a loaded machine. So this
// file checks the test source: the 200,000-row test passes an explicit timeout. It came from
// data-explorer-vscode's file of the same name with the row builder; the half about webview
// entries stayed there, with the webviews.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const TEST_DIR = import.meta.dirname;
// vitest's own default, which this test has to stand clear of.
const DEFAULT_TEST_TIMEOUT = 5_000;

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function callsNamed(sf: ts.SourceFile, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// The timeout a vitest call passes as its argument at `index`, if it is a number literal.
function timeoutArg(call: ts.CallExpression, index: number): number | undefined {
  const arg = call.arguments[index];
  return arg && ts.isNumericLiteral(arg) ? Number(arg.text.replace(/_/g, '')) : undefined;
}

function where(sf: ts.SourceFile, node: ts.Node): string {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${relative(TEST_DIR, sf.fileName)}:${line + 1}`;
}

describe('the 200,000-row test passes its own timeout', () => {
  it('above the default test timeout', () => {
    const sf = parse(join(TEST_DIR, 'rowBuilder.test.ts'));
    const title = 'builds every row instead of overflowing the argument limit';
    const [test] = callsNamed(sf, 'it').filter((c) => {
      const [name] = c.arguments;
      return name !== undefined && ts.isStringLiteralLike(name) && name.text === title;
    });
    expect(test, 'the test is still in rowBuilder.test.ts under its title').toBeDefined();
    // And it is still the one that builds 200,000 rows, which is why it gets the ceiling.
    expect(test!.getText(sf)).toContain('const count = 200000;');
    const timeout = timeoutArg(test!, 2);
    expect(timeout ?? 0, `${where(sf, test!)}: passes ${timeout ?? 'no'} timeout`).toBeGreaterThan(
      DEFAULT_TEST_TIMEOUT,
    );
  });
});
