// Copyright 2026 The MathWorks, Inc.
//
// Reading --dex-* tokens out of source text: the widgets' stylesheets (css`` templates and the
// project page's string) and the theme sheet. happy-dom resolves no custom property and
// composites nothing, so what a page with no theme sheet would show is a fact about the text.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Off the cwd (vitest runs from the repo root), not import.meta.url: under happy-dom that URL is
// an http one.
export const ROOT = process.cwd();
export const WIDGETS_DIR = join(ROOT, 'src', 'widgets');

/** Every .ts file under src/widgets, as [path relative to the repo, raw text]. */
export function widgetSources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) out.push([relative(ROOT, path), readFileSync(path, 'utf8')]);
    }
  };
  walk(WIDGETS_DIR);
  return out;
}

/** Block comments and whole-line `//` comments blanked, keeping line numbers. The prose in
 *  these files quotes declarations verbatim to explain them, and must not count as code. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

export interface VarRead {
  name: string;
  /** Everything after the first top-level comma, trimmed; null when there is none. */
  fallback: string | null;
  line: number;
}

/** The var() starting at `at`: its name, its fallback and the index of its closing paren. */
function varAt(code: string, at: number): VarRead & { end: number } {
  let depth = 0;
  let end = at + 3;
  for (; end < code.length; end++) {
    if (code[end] === '(') depth++;
    else if (code[end] === ')' && --depth === 0) break;
  }
  const inner = code.slice(at + 4, end);
  let comma = -1;
  for (let i = 0, d = 0; i < inner.length; i++) {
    if (inner[i] === '(') d++;
    else if (inner[i] === ')') d--;
    else if (inner[i] === ',' && d === 0) {
      comma = i;
      break;
    }
  }
  return {
    name: (comma < 0 ? inner : inner.slice(0, comma)).trim(),
    fallback: comma < 0 ? null : inner.slice(comma + 1).trim(),
    line: code.slice(0, at).split('\n').length,
    end,
  };
}

/** Every `var(` in the text — outer and nested alike — with its name and fallback. */
export function varReads(code: string): VarRead[] {
  const reads: VarRead[] = [];
  for (let at = code.indexOf('var('); at >= 0; at = code.indexOf('var(', at + 4)) {
    if (/[\w-]/.test(code[at - 1] ?? '')) continue;
    const { name, fallback, line } = varAt(code, at);
    reads.push({ name, fallback, line });
  }
  return reads;
}

/** A read's chain of tokens through fallbacks that are themselves one whole var(), and the
 *  value the chain ends on: `var(--a, var(--b, #fff))` is [--a, --b] ending on `#fff`. */
export function chain(read: VarRead): { names: string[]; final: string | null } {
  const names = [read.name];
  let fallback = read.fallback;
  while (fallback !== null && fallback.startsWith('var(')) {
    const next = varAt(fallback, 0);
    if (next.end !== fallback.length - 1) break;
    names.push(next.name);
    fallback = next.fallback;
  }
  return { names, final: fallback };
}

/** Custom properties declared in a block of CSS text, name to whitespace-normalised value. */
export function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    out.set(m[1], normalise(m[2]));
  }
  return out;
}

export const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const THEME_CSS = readFileSync(join(ROOT, 'src', 'theme', 'tokens.css'), 'utf8');

/** The body of the one rule whose selector is exactly `selector`. */
export function block(css: string, selector: string): string {
  const code = stripComments(css);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(code);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

/** tokens.css's three sets. */
export const THEME_SETS = {
  light: declarations(block(THEME_CSS, ':root')),
  dark: declarations(block(THEME_CSS, '[data-theme="dark"]')),
  'high-contrast': declarations(block(THEME_CSS, '[data-theme="high-contrast"]')),
};

/** True when a value paints something: a colour, or a shadow that carries one. */
export const hasColour = (value: string): boolean =>
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|color-mix)\(|\b(transparent|white|black)\b/i.test(value);
