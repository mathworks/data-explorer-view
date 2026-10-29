// Copyright 2026 The MathWorks, Inc.
//
// What custom-elements-manifest.config.mjs adds to the analyzer, so that custom-elements.json
// says what a consumer gets and nothing else:
//
//   * paths name the dist/ files a consumer loads, not the src/ files the analyzer read;
//   * private members (TypeScript `private`, or a leading `_`) are left out: they are not API;
//   * attribute names are Lit's, lowercased (Lit observes `rowid` for a `rowId` property; the
//     analyzer writes the property's own spelling);
//   * each event's type and description come from the `HTMLElementEventMap` entry its module
//     declares, the one place a listener's type comes from too. An event a widget dispatches
//     with no entry, or an entry no widget in that module dispatches, fails the build;
//   * each widget's cssProperties are the theme's --dex-* tokens it reads, found in its source
//     and in the shared stylesheets it imports, with the light default and the note theme.css
//     gives. A token a widget declares for itself and reads back (the table's --dex-row-ink) is
//     its own plumbing, and theme.css does not declare it, so it is not listed;
//   * modules are sorted by path, so the file is the same on every machine.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TOKENS = 'src/theme/tokens.css';

const toPosix = (p) => p.split(sep).join('/');

/** Block comments and `//` comments blanked: the prose quotes tokens it does not read. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** theme.css's light set: each token's value and the comment, if any, directly above it. */
function lightTokens() {
  const text = readFileSync(join(ROOT, TOKENS), 'utf8');
  const root = text.slice(text.indexOf(':root {'), text.indexOf('\n}', text.indexOf(':root {')));
  const tokens = new Map();
  const re = /(?:\/\*([\s\S]*?)\*\/\s*)?(--dex-[\w-]+):\s*([^;]+);/g;
  for (let m; (m = re.exec(root)); ) {
    const note = m[1] ? m[1].replace(/\s+/g, ' ').trim() : undefined;
    tokens.set(m[2], { default: m[3].trim(), description: note });
  }
  return tokens;
}

/** The repo-relative .ts file a relative import names, or null. */
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const file = toPosix(join(dirname(from), spec)).replace(/\.js$/, '.ts');
  return existsSync(join(ROOT, file)) ? file : null;
}

/**
 * The --dex-* tokens a module reads: in a var(), or by name from script (the table's row height),
 * here and in the shared `*.styles.ts` sheets it imports.
 */
function tokensRead(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const code = stripComments(readFileSync(join(ROOT, file), 'utf8'));
  const read = new Set();
  for (const m of code.matchAll(/var\(\s*(--dex-[\w-]+)/g)) read.add(m[1]);
  for (const m of code.matchAll(/getPropertyValue\(\s*'(--dex-[\w-]+)'/g)) read.add(m[1]);
  for (const m of code.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
    const dep = resolveImport(file, m[1]);
    if (dep && dep.endsWith('.styles.ts')) for (const t of tokensRead(dep, seen)) read.add(t);
  }
  return read;
}

const distPath = (path) => path.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js');

/** Every `path` and `module` string in the manifest that names a src/ file, renamed. */
function toDist(value) {
  if (Array.isArray(value)) return value.forEach(toDist);
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if ((key === 'path' || key === 'module') && typeof v === 'string' && v.startsWith('src/')) value[key] = distPath(v);
    else toDist(v);
  }
}

const isPrivate = (member) =>
  (member.privacy !== undefined && member.privacy !== 'public') || /^[_#]/.test(member.name);

export function dexManifestPlugin() {
  // Module path → event name → { type, description }, from its `declare global` block.
  const eventMaps = new Map();
  return {
    name: 'dex-manifest',

    analyzePhase({ ts, node, moduleDoc }) {
      if (!ts.isModuleDeclaration(node) || node.name.getText() !== 'global' || !node.body) return;
      for (const statement of node.body.statements ?? []) {
        if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'HTMLElementEventMap') continue;
        const map = eventMaps.get(moduleDoc.path) ?? new Map();
        for (const member of statement.members) {
          if (!ts.isPropertySignature(member) || !member.type) continue;
          const docs = ts.getJSDocCommentsAndTags(member).filter(ts.isJSDoc);
          const description = docs.map((d) => ts.getTextOfJSDocComment(d.comment) ?? '').join('\n').trim();
          map.set(member.name.text, { type: member.type.getText(), description: description || undefined });
        }
        eventMaps.set(moduleDoc.path, map);
      }
    },

    packageLinkPhase({ customElementsManifest }) {
      const errors = [];
      const tokens = lightTokens();
      customElementsManifest.modules.sort((a, b) => a.path.localeCompare(b.path));
      for (const mod of customElementsManifest.modules) {
        const declared = eventMaps.get(mod.path) ?? new Map();
        const dispatched = new Set();
        for (const decl of mod.declarations ?? []) {
          if (!decl.customElement) continue;
          if (decl.members) decl.members = decl.members.filter((m) => !isPrivate(m));
          for (const attr of decl.attributes ?? []) attr.name = attr.name.toLowerCase();
          for (const member of decl.members ?? []) {
            if (typeof member.attribute === 'string') member.attribute = member.attribute.toLowerCase();
          }
          for (const event of decl.events ?? []) {
            dispatched.add(event.name);
            const entry = declared.get(event.name);
            if (!entry) {
              errors.push(`${mod.path}: ${decl.name} dispatches '${event.name}', which its HTMLElementEventMap does not declare`);
              continue;
            }
            event.type = { text: entry.type };
            if (entry.description) event.description = entry.description;
            else delete event.description;
          }
          const read = [...tokensRead(mod.path)].filter((name) => tokens.has(name)).sort();
          const cssProperties = read.map((name) => {
            const light = tokens.get(name);
            const property = { name };
            if (light.description) property.description = light.description;
            property.default = light.default;
            return property;
          });
          if (cssProperties.length) decl.cssProperties = cssProperties;
        }
        for (const name of declared.keys()) {
          if (!dispatched.has(name)) errors.push(`${mod.path}: HTMLElementEventMap declares '${name}', which no widget in it dispatches`);
        }
      }
      toDist(customElementsManifest);
      if (errors.length) throw new Error(`custom-elements.json:\n  ${errors.join('\n  ')}`);
    },
  };
}
