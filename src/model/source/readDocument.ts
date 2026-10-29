// Copyright 2026 The MathWorks, Inc.
//
// How a document's bytes become the tree its table shows: per file type, the route the VS Code
// extension's host takes, so a table in a page shows what the extension's table shows.
//
//   a JSON dictionary          its text, parsed, under the uri           (SlddTextEditorProvider)
//   a compressed dictionary    its bytes, under `binedit:` + the uri     (BinarySlddEditorProvider)
//   a model                    parsed, under the uri                     (BinaryEditorProvider)
//   a MAT-file                 its bytes, under `binedit:` + the uri     (MatEditorProvider)
//
// The srcIds are the providers' because a srcId is in every row id, link target and matrix node
// id: a table fed by either side then holds the same ids. The banner texts are the providers'
// too ("Failed to parse plant.sldd: …"), with the srcId spelled as the file's name.
//
// The extension's golden payloads hold all of this (test/goldens/inPage.test.ts): every fixture
// it pins is opened through here and must answer what the extension's host sends.
import { isMatFile, isModelFile, isProjectFile, isSlddFile, parseModel } from 'data-explorer-core';
import { binaryEditSrcId } from '../ids/srcId.js';
import { rowPlannerFor, type PlanOptions, type RowPlanner } from '../rows/rowPlanner.js';
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { DocumentRegistry } from '../workspace/SlddModel.js';
import { uriPath } from './sourceUri.js';

/** What kind of file a document is, which decides what it opens in. */
export type DocKind = 'dictionary' | 'model' | 'mat' | 'project';

/** The kind of the file `name` names, or undefined for a file this package does not open. */
export function docKindOf(name: string): DocKind | undefined {
  if (isMatFile(name)) return 'mat';
  if (isSlddFile(name)) return 'dictionary';
  if (isModelFile(name)) return 'model';
  if (isProjectFile(name)) return 'project';
  return undefined;
}

/** One read of a document: the tree it registered, and how its table is planned from it. */
export interface Reading {
  /** The id the tree is registered under: the uri, or `binedit:` + the uri. */
  srcId: string;
  node: any;
  planner: RowPlanner;
  /** The stamps a paint is planned with. */
  paint?: PlanOptions;
  /** The stamps a fetch of children is planned with. */
  fetch?: PlanOptions;
  /** The notice above the table, asked as the paint is built. */
  notice(): string | undefined;
  /** The banner as the table shows it. */
  banner(banner: WarningBanner | undefined): WarningBanner | undefined;
  /** The banner text of a failure while the paint is built. */
  paintFailed(err: unknown): string;
}

/** A message of core's with the srcId spelled as the file's name (vscode's `describeSource`). */
const describeSource = (srcId: string, name: string) => (text: string): string => text.split(srcId).join(name);

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const asIs = (banner: WarningBanner | undefined) => banner;
const noNotice = () => undefined;

/**
 * Read `bytes`, the file `name` opened under `uri`, into `registry`. Throws an Error whose message
 * is what the table's banner shows when the file cannot be read.
 */
export function readDocument(
  registry: DocumentRegistry,
  kind: Exclude<DocKind, 'project'>,
  name: string,
  uri: string,
  bytes: ArrayBuffer,
): Reading {
  switch (kind) {
    case 'dictionary':
      return isZip(bytes) ? readZip(registry, name, uri, bytes) : readJson(registry, name, uri, bytes);
    case 'model':
      return readModel(registry, name, uri, bytes);
    case 'mat':
      return readMat(registry, name, uri, bytes);
  }
}

/** A zip archive's local-file-header magic (PK\x03\x04): a compressed dictionary. */
function isZip(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** What the sectioned routes share: a failure says "Failed to parse", in the route's words. */
function sectioned(srcId: string, node: any, name: string, describe: (text: string) => string, paint?: PlanOptions): Reading {
  return {
    srcId,
    node,
    planner: rowPlannerFor(name),
    paint,
    notice: noNotice,
    banner: asIs,
    paintFailed: (err) => `Failed to parse ${name}: ${describe(messageOf(err))}`,
  };
}

/**
 * A dictionary that is not a zip. Text that parses as JSON takes SlddTextEditorProvider's route
 * (its text, decoded as VS Code decodes a document: UTF-8, a byte-order mark dropped). Anything
 * else takes the read-only view's, whose bytes read (core's) refuses it in its own words.
 *
 * The extension routes a JSON dictionary over its 50 MB editing limit to the read-only view; that
 * limit is VS Code's, so here every JSON dictionary is read as text, which builds the same tree.
 */
function readJson(registry: DocumentRegistry, name: string, uri: string, bytes: ArrayBuffer): Reading {
  let content: Record<string, unknown> | undefined;
  try {
    content = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    content = undefined;
  }
  if (content === undefined) {
    let node: any;
    try {
      node = registry.getModelFromBytes(uri, name, bytes);
    } catch (err) {
      throw new Error(`Failed to parse ${name}: ${messageOf(err)}`);
    }
    return sectioned(uri, node, name, (text) => text);
  }
  const describe = describeSource(uri, name);
  let node: any;
  try {
    node = registry.getModelFromContent(uri, name, content);
  } catch (err) {
    throw new Error(`Failed to parse ${name}: ${describe(messageOf(err))}`);
  }
  // A document opened clean: nothing in it differs from its last save.
  return sectioned(uri, node, name, describe, { modifiedNames: new Set() });
}

/** A compressed dictionary: BinarySlddEditorProvider's registration, under its srcId. */
function readZip(registry: DocumentRegistry, name: string, uri: string, bytes: ArrayBuffer): Reading {
  const srcId = binaryEditSrcId(uri);
  const describe = describeSource(srcId, name);
  let node: any;
  try {
    node = registry.getModelFromBytes(srcId, name, bytes);
  } catch (err) {
    throw new Error(`Failed to parse ${name}: ${describe(messageOf(err))}`);
  }
  return sectioned(srcId, node, name, describe, { modifiedNames: new Set() });
}

/**
 * A model: the read-only view's route, a parse and then its registration. The parse is named by
 * the file's path, as the extension's shared parse names it: core quotes it in what it says of a
 * `.mdl` it cannot read.
 */
function readModel(registry: DocumentRegistry, name: string, uri: string, bytes: ArrayBuffer): Reading {
  let node: any;
  try {
    node = registry.getModelFromParsed(uri, name, parseModel(bytes, uriPath(uri)));
  } catch (err) {
    throw new Error(`Failed to parse ${name}: ${messageOf(err)}`);
  }
  return sectioned(uri, node, name, (text) => text);
}

/** A MAT-file: MatEditorProvider's registration, stamps, notice and banner, under its srcId. */
function readMat(registry: DocumentRegistry, name: string, uri: string, bytes: ArrayBuffer): Reading {
  const srcId = binaryEditSrcId(uri);
  const describe = (err: unknown): string => describeSource(srcId, name)(messageOf(err));
  let mat: any;
  try {
    mat = registry.getModelFromBytes(srcId, name, bytes);
  } catch (err) {
    throw new Error(`Failed to parse ${name}: ${describe(err)}`);
  }
  // Whether a save could write the file back as it is. A MAT-file core holds read-only says why
  // in the notice: what a save would refuse, or that the file's layout is one it cannot keep.
  const notice = (): string | undefined => {
    if (!mat.readOnly) return undefined;
    let out: ReturnType<DocumentRegistry['session']['serializeSource']>;
    try {
      out = registry.session.serializeSource(srcId);
    } catch (err) {
      return `Read-only: ${describe(err)}`;
    }
    if (!out || out.kind !== 'binary' || !(out.bytes instanceof Uint8Array)) {
      return `Read-only: Cannot save "${name}": it is not held as a MAT-file. Nothing was written.`;
    }
    return `Read-only: ${name} is laid out in a way a save could not keep as it is, so it opens for viewing only.`;
  };
  // A variable travels on the clipboard, and nothing differs from a save the file has not had.
  const fetch: PlanOptions = { canCopy: true };
  return {
    srcId,
    node: mat,
    planner: rowPlannerFor(name),
    paint: { ...fetch, savedStatus: new Map() },
    fetch,
    notice,
    banner: (banner) => banner && { headline: describe(banner.headline), details: banner.details.map((d) => describe(d)) },
    paintFailed: (err) => `Failed to show ${name}: ${describe(err)}`,
  };
}
