// Copyright 2026 The MathWorks, Inc.
//
// The public API of a built package, read out of a directory that holds one: this checkout, or a
// release tag's tree (check-api.mjs writes one out with `git archive`). Each part is a list of
// items, `{ key, value }`, where the key says what the item is and the value what it is like; the
// rule for each kind of item is check-api.mjs's.
//
//   exports      the export map's keys (package.json `exports`)
//   names        every entry's export names, value or type, and a value's type (its built .d.ts)
//   elements     each widget's tag, properties, methods, attributes and events (the manifest)
//   details      each event detail's fields (the detail interface, in the built .d.ts)
//   wire         each message of the six wire unions, and its fields (dist/model/source/wire.d.ts)
//   tokens       the theme's tokens (src/theme/tokens.css), and the ones each widget entry reads
//   icons        the icon ids (icons/*.svg)
//   observed     the attributes each widget class observes, by Lit's reckoning (imported in Node)
//   package      sideEffects, peerDependencies and files (package.json)
//
// The .d.ts files are read with TypeScript, resolving `data-explorer-core` and `lit` through the
// node_modules the directory has (a release's tree is given this checkout's).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const squash = (text) => text.replace(/\s+/g, ' ').trim();

/** Every public item of a manifest: each widget's tag, and its public members, attributes and events. */
export function elementItems(manifest) {
  const items = [];
  for (const mod of manifest?.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.customElement || !decl.tagName) continue;
      const tag = `<${decl.tagName}>`;
      items.push({ key: tag, value: decl.name });
      for (const m of decl.members ?? []) {
        if (m.static || (m.privacy && m.privacy !== 'public')) continue;
        if (m.kind === 'field') items.push({ key: `${tag} property ${m.name}`, value: m.type?.text ?? '' });
        else if (m.kind === 'method') items.push({ key: `${tag} method ${m.name}()`, value: signature(m) });
      }
      for (const a of decl.attributes ?? []) items.push({ key: `${tag} attribute ${a.name}`, value: a.fieldName ?? '' });
      for (const e of decl.events ?? []) items.push({ key: `${tag} event ${e.name}`, value: e.type?.text ?? '' });
    }
  }
  return items;
}

function signature(method) {
  const params = (method.parameters ?? []).map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type?.text ?? ''}`);
  return `(${params.join(', ')}) => ${method.return?.type?.text ?? 'void'}`;
}

/** The export map's keys, each with its target. */
export function exportItems(pkg) {
  return Object.entries(pkg.exports ?? {}).map(([key, target]) => ({ key: `export map ${key}`, value: JSON.stringify(target) }));
}

/** The entries with types: key → its .d.ts, from the export map. */
function typedEntries(pkg) {
  return Object.entries(pkg.exports ?? {}).flatMap(([key, t]) => (typeof t === 'object' && t?.types && !key.includes('*') ? [[key, t.types]] : []));
}

/** The widget entries (not the 0.x pattern a release before 1.0 has beside them): key → target. */
function widgetEntries(pkg) {
  return Object.entries(pkg.exports ?? {}).filter(([key, t]) => !key.includes('*') && typeof t === 'object' && t?.default?.includes('/widgets/'));
}

/** One TypeScript program over every entry's .d.ts in `dir`. */
function program(dir, pkg) {
  const roots = typedEntries(pkg).map(([, types]) => resolve(dir, types)).filter(existsSync);
  const options = { noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] };
  return ts.createProgram(roots, options);
}

/** A type's text, with any `import("…")` qualifier dropped: the same type reads the same from any directory. */
function typeText(checker, type) {
  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation).replace(/import\("[^"]*"\)\./g, '');
}

/** Every entry's export names: `<entry> <name> (value)` with its type, or `(type)`. */
export function nameItems(dir, pkg, prog = program(dir, pkg)) {
  const checker = prog.getTypeChecker();
  const items = [];
  for (const [key, types] of typedEntries(pkg)) {
    const source = prog.getSourceFile(resolve(dir, types));
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      // `export type { X }` exports a value's name as a type only.
      const typeOnly = (exported.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly));
      const isValue = !typeOnly && (target.flags & ts.SymbolFlags.Value) !== 0;
      const decl = target.valueDeclaration ?? target.declarations?.[0];
      const value = isValue && decl ? typeText(checker, checker.getTypeOfSymbolAtLocation(target, decl)) : '';
      items.push({ key: `${key} ${exported.name} (${isValue ? 'value' : 'type'})`, value, entry: key });
    }
  }
  return items;
}

/** The fields of an interface or an object type, each as `name: type` or `name?: type`. */
function fieldsOf(node, source) {
  const members = ts.isInterfaceDeclaration(node) ? node.members : ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type) ? node.type.members : null;
  if (!members) return null;
  return members.filter(ts.isPropertySignature).map((m) => ({
    name: m.name.getText(source).replace(/^['"]|['"]$/g, ''),
    text: `${m.name.getText(source)}${m.questionToken ? '?' : ''}: ${squash(m.type?.getText(source) ?? 'any')}`,
  }));
}

/** Every exported interface and type alias of the built .d.ts files under `dirs`, by name. */
function declarations(dir, dirs) {
  const found = new Map();
  const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((e) => (statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : e.endsWith('.d.ts') ? [join(d, e)] : [])) : []);
  for (const file of dirs.flatMap((d) => walk(join(dir, d))).sort()) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    for (const st of source.statements) {
      if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && !found.has(st.name.text)) found.set(st.name.text, { node: st, source });
    }
  }
  return found;
}

/** Each event's detail: one item per field of its detail type, or the type's text when it has none. */
export function detailItems(dir, manifest) {
  const types = declarations(dir, ['dist/widgets', 'dist/model']);
  const items = [];
  for (const { key, value } of elementItems(manifest).filter((i) => / event /.test(i.key))) {
    const name = /^CustomEvent<(.*)>$/.exec(value)?.[1]?.trim() ?? value;
    const found = types.get(name);
    const fields = found && fieldsOf(found.node, found.source);
    if (!fields) {
      items.push({ key: `${key} detail`, value: found ? squash(found.node.getText(found.source)) : name });
      continue;
    }
    for (const f of fields) items.push({ key: `${key} detail ${f.name}`, value: f.text });
  }
  return items;
}

/** The wire: each message of the six unions by its `type`, each of its fields, and the file's other type aliases. */
export function wireItems(dir) {
  const file = join(dir, 'dist', 'model', 'source', 'wire.d.ts');
  if (!existsSync(file)) return [];
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const byName = new Map(source.statements.filter((s) => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)).map((s) => [s.name.text, s]));
  const UNIONS = ['TableHostMessage', 'TableClientMessage', 'TableEditHostMessage', 'TableEditClientMessage', 'FolderHostMessage', 'FolderClientMessage'];
  const items = [];
  for (const union of UNIONS) {
    const alias = byName.get(union);
    if (!alias || !ts.isTypeAliasDeclaration(alias)) continue;
    const members = ts.isUnionTypeNode(alias.type) ? alias.type.types : [alias.type];
    for (const member of members) {
      const name = member.getText(source);
      const decl = byName.get(name);
      const fields = decl ? fieldsOf(decl, source) : null;
      const type = fields?.find((f) => f.name === 'type')?.text.replace(/^type\??: /, '').replace(/['"]/g, '') ?? name;
      items.push({ key: `wire ${union} ${type}`, value: name });
      for (const f of fields ?? []) if (f.name !== 'type') items.push({ key: `wire ${union} ${type} field ${f.name}`, value: f.text });
    }
  }
  for (const [name, st] of byName) {
    if (ts.isTypeAliasDeclaration(st) && !UNIONS.includes(name)) items.push({ key: `wire type ${name}`, value: squash(st.type.getText(source)) });
  }
  return items;
}

/** The theme's tokens, and the tokens each widget entry's modules read. */
export function tokenItems(dir, pkg) {
  const file = join(dir, 'src', 'theme', 'tokens.css');
  const css = existsSync(file) ? readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') : '';
  const items = [...new Set([...css.matchAll(/(--dex-[\w-]+)\s*:/g)].map((m) => m[1]))].sort().map((t) => ({ key: `theme token ${t}`, value: '' }));
  for (const [key, target] of widgetEntries(pkg)) {
    const reads = new Set();
    for (const module of closure(resolve(dir, target.default))) for (const m of readFileSync(module, 'utf8').matchAll(/var\(\s*(--dex-[\w-]+)/g)) reads.add(m[1]);
    for (const t of [...reads].sort()) items.push({ key: `${key} reads ${t}`, value: '' });
  }
  return items;
}

/** The package's own modules an entry loads, followed through its relative imports. */
function closure(start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const at = queue.shift();
    if (seen.has(at) || !existsSync(at)) continue;
    seen.add(at);
    for (const { fileName } of ts.preProcessFile(readFileSync(at, 'utf8'), true, true).importedFiles) {
      if (fileName.startsWith('.')) queue.push(resolve(dirname(at), fileName));
    }
  }
  return [...seen];
}

/** The icon ids: the files in icons/, without `.svg`. */
export function iconItems(dir) {
  const icons = join(dir, 'icons');
  if (!existsSync(icons)) return [];
  return readdirSync(icons).filter((f) => f.endsWith('.svg')).sort().map((f) => ({ key: `icon ${f.slice(0, -4)}`, value: '' }));
}

/**
 * What each widget class observes, by Lit's own reckoning: its static observedAttributes, read in
 * a Node that imports each widget entry, and named by its tag where the manifest gives one.
 */
export function observedItems(dir, pkg, manifest) {
  const entries = widgetEntries(pkg).map(([, t]) => t.default);
  if (!entries.length) return [];
  const script = `
    const out = {};
    for (const e of ${JSON.stringify(entries)}) {
      const m = await import(new URL(e, 'file://' + process.cwd() + '/').href);
      for (const v of Object.values(m)) if (typeof v === 'function' && 'observedAttributes' in v) out[v.name] = [...v.observedAttributes];
    }
    console.log(JSON.stringify(out));`;
  const byClass = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: dir, encoding: 'utf8' }));
  const tags = new Map((manifest?.modules ?? []).flatMap((m) => (m.declarations ?? []).filter((d) => d.tagName).map((d) => [d.name, `<${d.tagName}>`])));
  return Object.entries(byClass).flatMap(([name, attrs]) => attrs.sort().map((a) => ({ key: `${tags.get(name) ?? name} observes ${a}`, value: '' })));
}

/** sideEffects, peerDependencies and files. */
export function packageItems(pkg) {
  const side = pkg.sideEffects === undefined ? ['(any)'] : Array.isArray(pkg.sideEffects) ? pkg.sideEffects : [String(pkg.sideEffects)];
  return [
    ...side.map((s) => ({ key: `package.json sideEffects ${s}`, value: '' })),
    ...Object.entries(pkg.peerDependencies ?? {}).map(([name, range]) => ({ key: `package.json peerDependencies ${name}`, value: range })),
    ...(pkg.files ?? []).map((f) => ({ key: `package.json files ${f}`, value: '' })),
  ];
}

/** Everything above, for the package in `dir`, each item tagged with the part it is of. */
export function surfaceOf(dir, { manifest } = {}) {
  const pkg = readJson(join(dir, 'package.json'));
  const man = manifest ?? (existsSync(join(dir, 'custom-elements.json')) ? readJson(join(dir, 'custom-elements.json')) : null);
  const parts = {
    exports: exportItems(pkg),
    names: nameItems(dir, pkg),
    elements: elementItems(man),
    details: detailItems(dir, man),
    wire: wireItems(dir),
    tokens: tokenItems(dir, pkg),
    icons: iconItems(dir),
    observed: observedItems(dir, pkg, man),
    package: packageItems(pkg),
  };
  return Object.entries(parts).flatMap(([part, items]) => items.map((i) => ({ ...i, part })));
}
