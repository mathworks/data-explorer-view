// Copyright 2026 The MathWorks, Inc.
//
// No module of this package keeps its own copy of the file-type list. WHICH KIND a file is belongs
// to core, which publishes the lists (`SUPPORTED_EXTS`, `SUPPORTED_NAMES`) and the kind tests
// (`isModelFile`, `isSlddFile`, `isMatFile`, `isProjectFile`, `isTomlProjectFile`) and dispatches
// its own parsers on them. A module here that classifies a file, reduces a name or reads a model
// asks core rather than keeping a second opinion about whether `Params.SLDD` is a dictionary, and
// every miss of a hand-written copy fails QUIETLY: a case-sensitive `endsWith('.sldd')` disagrees
// with every glob about a file MATLAB or Windows named `Params.SLDD`, so the file is discovered,
// opened, indexed, and then classified as nothing.
//
// Ported from data-explorer-vscode test/fileTypes.test.ts › no consumer keeps its own copy of the
// list, at 632f6e0, which scanned the four modules below as this package's dist. Here they are
// scanned as their source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_EXTS, SUPPORTED_NAMES } from 'data-explorer-core';
import { blankCommentsAndKeepLines, sourceFiles } from './tools/moduleGraph.js';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('no consumer keeps its own copy of the list', () => {
  const CONSUMERS = [
    // The kind DISPATCH the name index used to hold itself: which reader a candidate's names come
    // from.
    'src/model/search/nameScan.ts',
    // The tree's file shaping: it classifies every file the tree lists and names every project.
    'src/model/hierarchy/graphSources.ts',
    // graphModel classifies nothing — it is handed a `type` already decided — but it does REDUCE a
    // name: a project group is labelled with its marker's name. That is the same kind of second
    // copy, so it is held to the same scan.
    'src/model/hierarchy/graphModel.ts',
    // Which reader registers a file's tree, by its kind.
    'src/model/workspace/SlddModel.ts',
  ];

  // Comments are blanked before scanning. A comment that mentions the old literal, or explains
  // why parseSlx is the wrong call here, is documentation — not a second copy of the rule.
  const code = (p: string) => blankCommentsAndKeepLines(read(p));

  // A brace glob listing extensions, e.g. `**/*.{sldd,mat,slx}`.
  const GLOB_LITERAL = /\*\*\/\*\.\{[a-z,]+\}/;
  // An extension alternation regex, e.g. /\.(slx|sldd|mat)$/ — two or more
  // extensions ORed together and anchored at the end.
  const EXT_ALTERNATION = /\\\.\([a-z|]+\)\$/;

  // Three of the scans below are built at run time out of core's lists, so each entry is spliced
  // into a pattern. Every metacharacter in it is escaped, so that the pattern matches the entry's
  // own characters and no entry becomes syntax: which characters core's strings carry is not this
  // file's to assume. SINGLE_EXT_ANCHOR scans the source of a regex, where a hand-written copy
  // escapes a metacharacter itself, so for such an entry the escape only keeps the scan from
  // throwing; that is enough while every SUPPORTED_EXTS entry is letters and digits, which the
  // scan's own test below asserts.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // A hand-rolled kind test, e.g. `path.endsWith('.sldd')`: case-SENSITIVE, so it disagrees with
  // core's kind tests about `Params.SLDD`. Ask core: isSlddFile/isMatFile/isProjectFile/isModelFile.
  const ENDSWITH_EXT = new RegExp(`endsWith\\((['"])\\.(${SUPPORTED_EXTS.map(escapeRe).join('|')})\\1\\)`, 'i');

  // A single extension anchored at the end, e.g. `/\.prj$/i` — the shape the alternation above
  // does not catch. It is how a project's name got written twice: graphModel labelling a project
  // group and graphSources naming a project for core's parser each spelled
  // `basename(p).replace(/\.prj$/i, '')`, and a label a user reads has to agree with the name the
  // parser is told. Both call core's `projectNameOf` now.
  const SINGLE_EXT_ANCHOR = new RegExp(`\\\\\\.(${SUPPORTED_EXTS.map(escapeRe).join('|')})\\$`, 'i');

  // A marker spelled out as a string, e.g. `'matlab.toml'` — the shape every check above misses,
  // because a NAME is not an extension. Both spellings come from core: `TOML_PROJECT_FILE` for the
  // string, `isTomlProjectFile` for the test. Case-insensitive on purpose: there is no legitimate
  // `MATLAB.TOML` in this package's code.
  const NAME_LITERAL = new RegExp(`(['"\`])(${SUPPORTED_NAMES.map(escapeRe).join('|')})\\1`, 'i');

  for (const file of CONSUMERS) {
    it(`${file} names no glob or extension test of its own`, () => {
      const src = code(file);
      expect(GLOB_LITERAL.test(src), `${file} should take its list from core`).toBe(false);
      expect(EXT_ALTERNATION.test(src), `${file} should use one of core's kind tests`).toBe(false);
      expect(ENDSWITH_EXT.test(src), `${file} should use one of core's kind tests`).toBe(false);
      expect(SINGLE_EXT_ANCHOR.test(src), `${file} should use core's kind tests or projectNameOf`).toBe(false);
      expect(NAME_LITERAL.test(src), `${file} should use core's TOML_PROJECT_FILE`).toBe(false);
    });
  }

  it('no other module under src/ names one either', () => {
    // The four above are the ones that classify today. A fifth that starts to is a copy wherever
    // it grows, so the same scan runs over everything this package ships.
    const SRC = join(root, 'src');
    const copies = sourceFiles(SRC).filter((f) => {
      const src = blankCommentsAndKeepLines(readFileSync(join(SRC, f), 'utf8'));
      return [GLOB_LITERAL, EXT_ALTERNATION, ENDSWITH_EXT, SINGLE_EXT_ANCHOR, NAME_LITERAL].some((re) => re.test(src));
    });
    expect(sourceFiles(SRC)).toEqual(expect.arrayContaining(CONSUMERS.map((f) => f.slice('src/'.length))));
    expect(copies).toEqual([]);
  });

  it('the scan would catch a hand-written marker name', () => {
    // The scan's own test, because a regex asserting that something is ABSENT passes just as
    // well when it can match nothing at all — and this one is built at run time out of
    // SUPPORTED_NAMES, so a typo in the escaping is invisible from the results above.
    for (const name of SUPPORTED_NAMES) {
      expect(NAME_LITERAL.test(`if (base === '${name}') return true;`)).toBe(true);
      expect(NAME_LITERAL.test(`const marker = "${name.toUpperCase()}";`)).toBe(true);
      // And the escaping holds: a dot in the name is a dot, not "any character".
      expect(NAME_LITERAL.test(`'${name.replace('.', 'X')}'`)).toBe(false);
    }
    expect(NAME_LITERAL.test("const p = 'Cargo.toml';")).toBe(false);
  });

  it('the scan would catch a hand-written endsWith kind test', () => {
    for (const ext of SUPPORTED_EXTS) {
      expect(ENDSWITH_EXT.test(`if (path.endsWith('.${ext}')) return true;`)).toBe(true);
      expect(ENDSWITH_EXT.test(`return name.endsWith(".${ext.toUpperCase()}");`)).toBe(true);
      // A near-miss is not a copy: a longer extension that starts with this one, and the
      // extension with no dot in front of it.
      expect(ENDSWITH_EXT.test(`path.endsWith('.${ext}x')`)).toBe(false);
      expect(ENDSWITH_EXT.test(`path.endsWith('_${ext}')`)).toBe(false);
    }
  });

  it('the scan would catch a hand-written single-extension anchor', () => {
    // The lines below spell each extension as itself, which is how a regex spells it only while
    // it has no metacharacter (see escapeRe), so that is asserted first: an extension that breaks
    // it fails here rather than going unscanned.
    for (const ext of SUPPORTED_EXTS) {
      expect(ext, `${ext} would be spelled escaped in a regex`).toMatch(/^[a-z0-9]+$/);
      expect(SINGLE_EXT_ANCHOR.test(String.raw`const stem = basename(p).replace(/\.${ext}$/i, '');`)).toBe(true);
      expect(SINGLE_EXT_ANCHOR.test(String.raw`if (/\.${ext.toUpperCase()}$/.test(p)) return;`)).toBe(true);
      // A near-miss: a longer extension, and a word character where the dot should be.
      expect(SINGLE_EXT_ANCHOR.test(String.raw`/\.${ext}x$/i`)).toBe(false);
      expect(SINGLE_EXT_ANCHOR.test(String.raw`/\w${ext}$/i`)).toBe(false);
    }
  });

  it('every consumer takes the rule from core', () => {
    // What the literal scan above brackets: a consumer deriving the rule from neither core nor a
    // copy of its own would pass the scan by classifying nothing.
    for (const file of CONSUMERS) {
      expect(read(file).includes("from 'data-explorer-core'"), `${file} must take its kind tests from core`).toBe(true);
    }
  });

  it('reads models through a core reader that sniffs the format', () => {
    // parseSlx on a `.mdl` throws "invalid zip data". The name scan reads a model through
    // `parseModel` (and the cache's `parsedModelOf`, which calls it), which decides from the BYTES
    // — that is also what makes a mislabelled file open instead of failing. What is barred is
    // reaching PAST the sniff to a single-format reader.
    const src = code('src/model/search/nameScan.ts');
    expect(src.includes('parseModel') || src.includes('scanModelStructure'), 'must read models through parseModel or scanModelStructure').toBe(true);
    expect(src, 'must not call parseSlx directly').not.toContain('parseSlx');
    expect(src, 'must not call parseMdl directly').not.toContain('parseMdl');
  });
});
