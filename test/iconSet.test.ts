// Copyright 2026 The MathWorks, Inc.
//
// EVERY ICON ID THE WIDGETS AND THE MODEL CAN ASK FOR SHIPS IN icons/.
//
// <dex-icon> draws `<base><id>.svg` and has no fallback, so an id with no file is a broken
// image in a row, a tile or a button — in every app, and invisible to every test that does not
// look for the file. An id reaches it from five places, each checked below: the alias table
// dex-icon maps a data-model kind through, an Add gallery tile, a template that names its own
// glyph, a row of a folder's hierarchy, and a table row, whose icon is its core node's (rowBuilder
// passes it through). The last one is read out of core's code (tools/coreIcons.ts) rather than off
// fixture rows, because no fixture holds every class.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { allTiles } from '../src/model/ids/addCatalog.js';
import { HIERARCHY_ICONS } from '../src/model/hierarchy/folderHierarchy.js';
import { widgetSources } from './tools/cssTokens.js';
import { coreIconIds } from './tools/coreIcons.js';

const ROOT = process.cwd();
const FILES = readdirSync(join(ROOT, 'icons')).sort();
const SHIPPED = new Set(FILES.filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -'.svg'.length)));
const missing = (ids: Iterable<string>): string[] => [...new Set(ids)].filter((id) => !SHIPPED.has(id)).sort();

// Ids core writes that no view draws, each with the reason. Checked to still be in core, so an
// entry cannot outlive the id it excuses.
const NOT_DRAWN: Record<string, string> = {
  abstractClass: "the session's synthetic `__all__` root (DataModel's allNode), which no row stands for",
};

describe('every icon id the widgets and the model can ask for ships in icons/', () => {
  it('each id dex-icon maps a data-model kind onto', () => {
    const src = readFileSync(join(ROOT, 'src', 'widgets', 'shared', 'dex-icon.ts'), 'utf8');
    const table = /const ALIASES[^=]*=\s*\{([\s\S]*?)\};/.exec(src);
    expect(table, 'dex-icon.ts has no ALIASES table').not.toBeNull();
    const targets = [...table![1].matchAll(/:\s*'([\w-]+)'/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(10);
    expect(missing(targets)).toEqual([]);
  });

  it("each Add gallery tile's glyph, in the dictionary's catalog and so in every MAT-file's", () => {
    // matCatalog only ever keeps tiles of ADD_CATALOG, so these are all of them.
    const tiles = allTiles();
    expect(tiles.length).toBeGreaterThan(20);
    expect(missing(tiles.map((t) => t.iconId))).toEqual([]);
  });

  it('each glyph a widget template names itself', () => {
    const named = widgetSources().flatMap(([, src]) =>
      [...src.matchAll(/\.?iconId=(?:\$\{'([\w-]+)'\}|"([\w-]+)")/g)].map((m) => m[1] ?? m[2]),
    );
    // The variable editor's open button names `wsTable`; a template that stopped naming any
    // would leave this case checking nothing.
    expect(named).toContain('wsTable');
    expect(missing(named)).toEqual([]);
  });

  it('each icon a row of a folder hierarchy can name', () => {
    // A folder, a project, External Data, each kind of file, and the fallback for a kind with none.
    expect(HIERARCHY_ICONS).toEqual(
      expect.arrayContaining(['simulink_folder', 'simulink_project', 'link_database', 'simulink', 'typeGeneric']),
    );
    expect(missing(HIERARCHY_ICONS)).toEqual([]);
  });

  it("each id core's nodes can answer with, which is what a row draws", () => {
    const { getters, ids } = coreIconIds();
    expect(getters, "get icon() getters read from core's dist").toBeGreaterThan(30);
    expect(ids.size).toBeGreaterThan(50);
    expect(missing([...ids].filter((id) => !(id in NOT_DRAWN)))).toEqual([]);
  });

  it('excuses only ids core still writes and that really have no file', () => {
    const { ids } = coreIconIds();
    for (const id of Object.keys(NOT_DRAWN)) {
      expect(ids.has(id), `${id} is no longer in core: drop it from NOT_DRAWN`).toBe(true);
      expect(SHIPPED.has(id), `${id} ships now: drop it from NOT_DRAWN`).toBe(false);
    }
  });
});

describe('the icons ship with the package', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  it('as data-explorer-view/icons/<id>.svg, in the files npm packs', () => {
    expect(pkg.exports['./icons/*']).toBe('./icons/*');
    expect(pkg.files).toContain('icons');
  });

  it('as SVG files and nothing else', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.filter((f) => !f.endsWith('.svg'))).toEqual([]);
    for (const f of FILES) expect(readFileSync(join(ROOT, 'icons', f), 'utf8'), f).toMatch(/^<svg[\s>]/);
  });
});
