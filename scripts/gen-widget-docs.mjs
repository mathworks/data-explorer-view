// Copyright 2026 The MathWorks, Inc.
//
// Writes the API half of each docs/widgets/<widget>.md from custom-elements.json: its properties,
// attributes, methods, events with the shape of each detail, the parts its define function
// defines and the theme tokens it reads. Each page keeps what is written above the marker line
// (what the widget is for, and an example) and gets everything below it from here, so the
// reference cannot drift from the source: edit a widget's JSDoc, not the page.
//
// `npm run build` runs it after the manifest. With --check it writes nothing and fails when a
// page is not the one it would write, or when a widget has no page.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs', 'widgets');
const MARKER = '<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->';
const check = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const srcPath = (dist) => dist.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts');

function sourceFiles(dir) {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((e) => (statSync(join(ROOT, dir, e)).isDirectory() ? sourceFiles(`${dir}/${e}`) : e.endsWith('.ts') ? [`${dir}/${e}`] : []));
}

// Every exported interface and type alias of the widgets and the model, by name, as written —
// with the doc comment written above it, which is where a type says what its fields mean (the
// four forms of a link target, for one), and which a declaration's own text leaves out: what an
// event's detail is, and what that names in turn. A widget's own spelling first.
const types = new Map();
for (const file of [...sourceFiles('src/widgets'), ...sourceFiles('src/model')]) {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (types.has(statement.name.text)) continue;
    // The types it names: in its members, and in what it extends.
    const names = new Set();
    statement.forEachChild(function walk(node) {
      if (ts.isTypeReferenceNode(node)) names.add(node.typeName.getText(source));
      else if (ts.isExpressionWithTypeArguments(node)) names.add(node.expression.getText(source));
      node.forEachChild(walk);
    });
    types.set(statement.name.text, { text: withDocComment(statement, source), names: [...names] });
  }
}

/** A declaration's text, from the `/** … *\/` comment right above it when it has one. */
function withDocComment(statement, source) {
  const doc = ts.getJSDocCommentsAndTags(statement).filter((d) => d.kind === ts.SyntaxKind.JSDoc).at(-1);
  return source.text.slice(doc ? doc.getStart(source) : statement.getStart(source), statement.getEnd());
}

/** The declarations a type's text needs, itself first and each one once. */
function shapes(name, seen = new Set()) {
  if (seen.has(name) || !types.has(name)) return [];
  seen.add(name);
  const { text, names } = types.get(name);
  return [text, ...names.flatMap((n) => shapes(n, seen))];
}

// Each widget's define function, its default tag and the defines it calls first: the parts it
// registers along with itself.
const defines = new Map();
for (const file of sourceFiles('src/widgets')) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/export function (define\w+)\(tag = '([\w-]+)'\): void \{([\s\S]*?)\n\}/g)) {
    defines.set(m[1], { tag: m[2], calls: [...m[3].matchAll(/\b(define\w+)\(\)/g)].map((c) => c[1]) });
  }
}
const tagOfDefine = new Map([...defines].map(([fn, d]) => [fn, d.tag]));
const defineOfTag = new Map([...defines].map(([fn, d]) => [d.tag, fn]));

// Which entries export each widget class, read off the entries' index files.
const entriesOf = new Map();
for (const [key, target] of Object.entries(pkg.exports)) {
  if (key.includes('*') || typeof target !== 'object' || !target.default.startsWith('./dist/widgets/')) continue;
  const index = readFileSync(join(ROOT, srcPath(target.default.slice(2))), 'utf8');
  for (const m of index.matchAll(/export \{([^}]*)\}/g)) {
    for (const name of m[1].split(',').map((n) => n.trim()).filter(Boolean)) {
      entriesOf.set(name, [...(entriesOf.get(name) ?? []), `${pkg.name}${key.slice(1)}`]);
    }
  }
}

const page = (tag) => `${tag.replace(/^dex-/, '')}.md`;
// One line, as a type written over several reads in a sentence; a union's leading bar dropped.
const code = (text) => `\`${String(text).replace(/\s+/g, ' ').replace(/^\| /, '').replace(/\( /g, '(').replace(/,? \)/g, ')').replace(/`/g, "'")}\``;
const prose = (text) => (text ?? '').trim();

function propertySection(decl) {
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field' && !m.static);
  if (!fields.length) return ['## Properties', '', 'None.'];
  const out = ['## Properties', ''];
  for (const f of fields) {
    const facts = [`type ${code(f.type?.text ?? 'unknown')}`];
    if (f.default !== undefined) facts.push(`default ${code(f.default)}`);
    if (f.attribute) facts.push(`attribute ${code(f.attribute)}${f.reflects ? ', reflected' : ''}`);
    else facts.push(f.readonly ? 'read-only' : 'property only');
    out.push(`### \`${f.name}\``, '', facts.join(' · '), '');
    if (prose(f.description)) out.push(prose(f.description), '');
  }
  return out.slice(0, -1);
}

function methodSection(decl) {
  const methods = (decl.members ?? []).filter((m) => m.kind === 'method' && !m.static);
  if (!methods.length) return ['## Methods', '', 'None.'];
  const out = ['## Methods', ''];
  for (const m of methods) {
    const params = (m.parameters ?? []).map((p) => `${p.name}${p.optional || p.default !== undefined ? '?' : ''}: ${p.type?.text ?? 'unknown'}`);
    out.push(`### \`${m.name}(${params.join(', ')}): ${m.return?.type?.text ?? 'void'}\``, '');
    if (prose(m.description)) out.push(prose(m.description), '');
  }
  return out.slice(0, -1);
}

function eventSection(decl) {
  const events = decl.events ?? [];
  if (!events.length) return ['## Events', '', 'None.'];
  const out = [
    '## Events',
    '',
    'Each is a `CustomEvent` that bubbles and is composed (it leaves the shadow root), declared on',
    "`HTMLElementEventMap`, `DocumentEventMap` and `WindowEventMap`, so a listener's `e.detail` is",
    'typed with no cast, on the element, the document or the window.',
    '',
  ];
  for (const e of events) {
    const detail = /^CustomEvent<(\w+)>$/.exec(e.type?.text ?? '')?.[1];
    out.push(`### \`${e.name}\``, '');
    if (prose(e.description)) out.push(prose(e.description), '');
    if (!detail || detail === 'null') out.push('`detail` is `null`.', '');
    else out.push(`\`detail\` is a \`${detail}\`:`, '', '```ts', shapes(detail).join('\n\n'), '```', '');
  }
  return out.slice(0, -1);
}

function partSection(decl) {
  const fn = defineOfTag.get(decl.tagName);
  const parts = (defines.get(fn)?.calls ?? []).map((c) => tagOfDefine.get(c)).filter(Boolean);
  const out = ['## Parts it defines', ''];
  if (!parts.length) out.push(`\`${fn}()\` defines \`<${decl.tagName}>\` alone.`);
  else {
    out.push(`\`${fn}()\` defines these first, under their default names, then \`<${decl.tagName}>\`:`, '');
    for (const tag of parts) out.push(`- [\`<${tag}>\`](${page(tag)})`);
  }
  out.push('', 'It has no `::part()` names and no slots.');
  return out;
}

function tokenSection(decl) {
  const tokens = decl.cssProperties ?? [];
  const out = ['## Theme tokens it reads', ''];
  if (!tokens.length) return [...out, 'None.'];
  out.push(
    'Each falls back to the light default when the page sets none (see `data-explorer-view/theme.css`).',
    '',
    '| Token | Light default | |',
    '|---|---|---|',
  );
  for (const t of tokens) out.push(`| \`${t.name}\` | ${code(t.default)} | ${prose(t.description).replace(/\|/g, '\\|')} |`);
  return out;
}

function reference(decl) {
  const entries = entriesOf.get(decl.name) ?? [];
  const fn = defineOfTag.get(decl.tagName);
  return [
    MARKER,
    '',
    '## At a glance',
    '',
    `| Tag | Class | Define | Entry |`,
    '|---|---|---|---|',
    `| \`<${decl.tagName}>\` | \`${decl.name}\` | \`${fn}(tag = '${decl.tagName}')\` | ${entries.map((e) => `\`${e}\``).join(', ')} |`,
    '',
    ...propertySection(decl),
    '',
    ...methodSection(decl),
    '',
    ...eventSection(decl),
    '',
    ...partSection(decl),
    '',
    ...tokenSection(decl),
    '',
  ].join('\n');
}

const widgets = manifest.modules.flatMap((m) => (m.declarations ?? []).filter((d) => d.customElement && d.tagName));
const problems = [];
for (const decl of widgets) {
  const file = join(DOCS, page(decl.tagName));
  if (!existsSync(file)) {
    problems.push(`docs/widgets/${page(decl.tagName)} does not exist: write what <${decl.tagName}> is for above the marker line`);
    continue;
  }
  const now = readFileSync(file, 'utf8');
  const at = now.indexOf(MARKER);
  const intent = at < 0 ? `${now.trimEnd()}\n\n` : now.slice(0, at);
  const next = intent + reference(decl);
  if (next === now) continue;
  if (check) problems.push(`docs/widgets/${page(decl.tagName)} is not what custom-elements.json says: run npm run build`);
  else writeFileSync(file, next);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
