// Copyright 2026 The MathWorks, Inc.
//
// The icon ids data-explorer-core's nodes can answer with, read out of its installed dist. A row's
// icon is whatever its node's `icon` getter returns (rowBuilder passes it through), so this is
// the vocabulary the table draws from — and no fixture holds every class, so it is read from the
// code, not from rows.
//
// Three places an id is written in core, and this reads all three:
//   * a string a `get icon()` returns (`return this.isDerived ? 'typeBus' : 'wsBus'`);
//   * an `icon:` or `iconId:` property (the section definitions, the data-source presentations);
//   * a constant whose name says ICON (`OBJECT_ICON`, the MCOS class map), which getters return
//     by name.
// A literal compared against (`this.sourceFormat === 'xml' ? …`) is a condition, not an answer,
// and is skipped.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE_DIST = join(process.cwd(), 'node_modules', 'data-explorer-core', 'dist');

function coreFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return coreFiles(path);
      return name.endsWith('.js') ? [path] : [];
    });
}

const noComments = (js: string): string => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The text from `open` (an index of `{`) to its matching `}`. Strings in a getter carry no braces. */
function block(js: string, open: number): string {
  let depth = 0;
  for (let i = open; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) return js.slice(open, i + 1);
  }
  throw new Error(`unbalanced block at ${open}`);
}

/** Quoted literals in `text`, skipping the ones a comparison reads. */
function answers(text: string): string[] {
  return [...text.matchAll(/(===|!==|==|!=)?\s*'([A-Za-z][\w-]*)'/g)].filter((m) => !m[1]).map((m) => m[2]);
}

export interface CoreIcons {
  /** How many `get icon()` getters were read: a floor for the test, so a scan that found the
   *  getters gone (a renamed dist, a minifier) fails rather than passes on nothing. */
  readonly getters: number;
  readonly ids: ReadonlySet<string>;
}

export function coreIconIds(): CoreIcons {
  const ids = new Set<string>();
  let getters = 0;
  for (const file of coreFiles(CORE_DIST)) {
    const js = noComments(readFileSync(file, 'utf8'));
    for (const m of js.matchAll(/get icon\(\)\s*\{/g)) {
      getters++;
      const body = block(js, m.index! + m[0].length - 1);
      for (const r of body.matchAll(/return\s+([^;]+);/g)) for (const id of answers(r[1])) ids.add(id);
    }
    for (const m of js.matchAll(/\bicon(?:Id)?\s*:\s*'([A-Za-z][\w-]*)'/g)) ids.add(m[1]);
    for (const m of js.matchAll(/\bconst\s+\w*ICON\w*\s*=\s*/g)) {
      const at = m.index! + m[0].length;
      if (js[at] === '{') {
        // A class-to-icon map: its values, not its keys.
        for (const v of block(js, at).matchAll(/:\s*'([A-Za-z][\w-]*)'/g)) ids.add(v[1]);
      } else {
        const lit = /^'([A-Za-z][\w-]*)'/.exec(js.slice(at));
        if (lit) ids.add(lit[1]);
      }
    }
  }
  return { getters, ids };
}
