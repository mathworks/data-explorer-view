// Copyright 2026 The MathWorks, Inc.
//
// What a project's page is sent: its parse as core's page model, the folder it is in, what a
// Managed Simulink Project adds, and what the read could not read. The VS Code extension's
// project route (its BinaryEditorProvider's `setProject`), so every app draws a project's page
// from the same message — `<dex-project-page>` takes it as it is.
//
// A PAGE, not a table — see core's ProjectPage.ts. Straight from `parseProject` rather than
// through the node tree the other formats build: what the page shows is the parse itself (run
// order, groups, label coverage), and a tree of rows is a shape none of that survives.
import {
  buildProjectPage,
  parseProject,
  projectFallbackName,
  readProjectStore,
  type ProjectPage,
  type StoreFs,
} from 'data-explorer-core';
import { dirname } from '../ids/pathUtil.js';
import type { MspProject } from '../ids/msp.js';
import { detectMsp, MSP_CONFIG } from '../ids/mspProject.js';
import { warningBanner, type WarningBanner } from '../rows/parseWarnings.js';

/** A project's page, as the page is sent it. */
export interface SetProjectMessage {
  type: 'setProject';
  /** The page: core's model of the parsed project. */
  page: ProjectPage;
  /**
   * The project's folder, as a path to show under its name. Only the app knows it — the store
   * records nothing absolute, by design, so a project stays portable.
   */
  root: string;
  /** What a Managed Simulink Project adds; absent for every project that is not one. */
  msp?: MspProject;
  /** What the parse could not read; absent after a clean read. */
  warnings?: WarningBanner;
}

/**
 * The page for the project whose marker (a `.prj`, or a `matlab.toml`) is at `markerPath`, from
 * its store (core's `readProjectStore`): `root` is the folder the page names, and `mspConfig` the
 * text of `msp_config.json` beside the marker, when there is one.
 *
 * The fallback name is core's `projectFallbackName` of the PATH, not a reduction of the file
 * name: every project in the TOML format spells its definition file identically, so the parent
 * folder is what names it — the same string the hierarchy's project row shows.
 */
export function projectPageMessage(
  store: Record<string, string>,
  markerPath: string,
  root: string,
  mspConfig?: string,
): SetProjectMessage {
  const parsed = parseProject(store, projectFallbackName(markerPath));
  return {
    type: 'setProject',
    page: buildProjectPage(parsed),
    root,
    // Undefined for every project that is not a Managed Simulink Project, which leaves the page
    // exactly what it is without one.
    msp: detectMsp(parsed, mspConfig),
    // A project is the format this matters most for: its store is read by convention with no
    // schema, so a document that did not survive its trip costs whatever entity it described and
    // leaves a page that looks whole.
    warnings: warningBanner(parsed.warnings),
  };
}

/** Code-unit order, which is the same on every machine — unlike `localeCompare`. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The page for the project marker at `markerPath`, read through `fs`: its store, sorted (the order
 * a directory lists in is the filesystem's, not the project's), and `msp_config.json` beside it
 * when there is one. `root` defaults to the marker's folder. An unreachable store is an empty
 * project whose warnings say so, as core's `readProjectStore` has it; it never throws for that.
 */
export async function readProjectPage(markerPath: string, fs: StoreFs, root: string = dirname(markerPath)): Promise<SetProjectMessage> {
  const read = await readProjectStore(markerPath, fs);
  const store = Object.fromEntries(Object.entries(read).sort(([a], [b]) => byCodeUnit(a, b)));
  let config: string | undefined;
  try {
    config = await fs.readText(`${dirname(markerPath)}/${MSP_CONFIG}`);
  } catch {
    config = undefined; // no config: an ordinary project, or one the labels alone describe
  }
  return projectPageMessage(store, markerPath, root, config);
}
