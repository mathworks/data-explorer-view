// Copyright 2026 The MathWorks, Inc.
//
// The hierarchy's relationships over files MATLAB wrote: a model that links a dictionary, a MAT-file
// as external data and a referenced model, which references another; two dictionaries that
// reference a third. Each file's tier-1 artifact is shaped by buildGraphSource
// (src/model/hierarchy/graphSources.ts) and the web is resolved by RelGraph
// (src/model/hierarchy/graphModel.ts), in both on-disk formats MATLAB writes a dictionary and a
// model in. Ported from data-explorer-vscode test/parity/parity.test.ts Phase 1 at 632f6e0, with its
// artifacts (test/parity/artifacts/{text,binary}/, written by that repo's test/parity/generate.m
// under MATLAB) copied byte for byte. Its other phases (what each file holds) are content parity
// over core's parsers, and stay with that suite.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractSlxStructure, isModelFile, isSlddFile } from 'data-explorer-core';
import { buildGraphSource } from '../src/model/hierarchy/graphSources.js';
import { RelGraph, type GraphSource } from '../src/model/hierarchy/graphModel.js';
import { scanSldd } from '../src/model/workspace/slddContent.js';

const ART = (variant: string, name: string) =>
  fileURLToPath(new URL(`./parity/artifacts/${variant}/${name}`, import.meta.url));

function bytesOf(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

const VARIANTS = ['text', 'binary'] as const;
const FILES = ['common.sldd', 'util.sldd', 'params.sldd', 'plant.slx', 'sub.slx', 'top.slx', 'signals.mat'];

// A GraphSource for a file the way the cheap tier shapes one: extract the tier-1 artifact from
// the bytes, then shape a node out of it. `buildGraphSource` takes artifacts and never bytes, so
// the extraction is here, which is where graphSourcesOf does it too.
//
// `scanSldd` covers BOTH on-disk dictionary formats behind core's own format sniff, so this does
// not test the first two bytes for 'PK' itself; the text/binary split is what the `variant` axis
// of this suite drives.
function graphSourceFor(variant: string, name: string): GraphSource {
  const path = ART(variant, name);
  const uriString = `test://${variant}/${name}`;
  if (isSlddFile(name)) {
    return buildGraphSource({ uriString, path: name, slddRefs: scanSldd(bytesOf(path)).refs });
  }
  if (isModelFile(name)) {
    return buildGraphSource({ uriString, path: name, structure: extractSlxStructure(bytesOf(path), name) });
  }
  // A MAT-file inherits nothing, so there is no artifact to extract for it at all.
  return buildGraphSource({ uriString, path: name });
}

describe.each(VARIANTS)('Phase 1: relationships [%s]', (variant) => {
  let sources: GraphSource[];
  let byName: Map<string, GraphSource>;
  beforeAll(() => {
    sources = FILES.map((f) => graphSourceFor(variant, f));
    byName = new Map(sources.map((s) => [s.path, s]));
  });

  it('model → sldd (top.slx → params.sldd)', () => {
    expect(byName.get('top.slx')!.dataDictionary).toBe('params.sldd');
  });

  it('model → model (top → plant, plant → sub); names normalized to .slx', () => {
    expect(byName.get('top.slx')!.modelRefs).toContain('plant.slx');
    expect(byName.get('plant.slx')!.modelRefs).toContain('sub.slx');
  });

  it('model → mat (top.slx → signals.mat as external data)', () => {
    const ds = byName.get('top.slx')!.dataSources;
    expect(ds).toContain('signals.mat');
  });

  it('sldd → sldd (params.sldd → common.sldd, util.sldd → common.sldd)', () => {
    expect(byName.get('params.sldd')!.slddRefs).toContain('common.sldd');
    expect(byName.get('util.sldd')!.slddRefs).toContain('common.sldd');
  });

  it('RelGraph resolves the web with top.slx as a root and no dangling missing nodes', () => {
    const graph = new RelGraph(sources);
    // roots() returns group headers; the flat parity fixture (bare basenames) yields a single
    // folder group labeled '/'. top.slx is a root within that group.
    const group = graph.roots().find((r) => r.label === '/')!;
    const groupRoots = graph.children(group);
    const rootLabels = groupRoots.map((r) => r.label);
    expect(rootLabels).toContain('top.slx');
    // Walk children of top.slx; every ref should resolve (no 'missing').
    const top = groupRoots.find((r) => r.label === 'top.slx')!;
    const kids = graph.children(top);
    const missing = kids.filter((k) => k.kind === 'missing').map((k) => k.label);
    expect(missing).toEqual([]);
  });

  it('full tree walk from top.slx resolves every relationship (no missing anywhere)', () => {
    const graph = new RelGraph(sources);
    const group = graph.roots().find((r) => r.label === '/')!;
    const top = graph.children(group).find((r) => r.label === 'top.slx')!;
    // BFS the whole expansion tree; collect labels + any missing nodes.
    const seenLabels = new Set<string>();
    const missing: string[] = [];
    const queue = [top];
    let guard = 0;
    while (queue.length && guard++ < 1000) {
      const node = queue.shift()!;
      if (node.kind === 'missing') missing.push(node.label);
      seenLabels.add(node.label);
      if (!node.cycle) queue.push(...graph.children(node));
    }
    expect(missing).toEqual([]);
    // The tree must surface every relationship target somewhere.
    for (const label of ['plant.slx', 'sub.slx', 'External Data', 'params.sldd', 'signals.mat', 'common.sldd']) {
      expect(seenLabels).toContain(label);
    }
  });
});
