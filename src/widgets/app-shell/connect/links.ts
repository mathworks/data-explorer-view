// Copyright 2026 The MathWorks, Inc.
//
// Where a link from one open file leads: the file to open, and the row to select in it.
// The table answers links into its own file; these are the rest (connectTable's `navigate`).
//
// Lifted from data-explorer-app src/renderer/linkPath.ts at 0983920.

import { projectPathSegments } from '../../../model/ids/pathUtil.js';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';

/** Where a link leads. */
export interface LinkDestination {
  /** The file to open, absolute. */
  path: string;
  /** The row to select there, by name (an entry, a variable, or a block's key). */
  select?: string;
}

const isPath = (p: string) => p.startsWith('/') || p.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(p);

/** The folder of the file at `path`, either separator. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut < 0 ? '' : path.slice(0, cut);
}

/**
 * A link's file as a path. A source is a core source id (the file's uri, perhaps prefixed),
 * which uriPath reads back into a path, or, where the file recorded only that, a bare name
 * beside the file the link is in.
 */
function sourcePath(source: string, fromPath: string): string {
  const path = uriPath(source);
  return isPath(path) ? path : `${folderOf(fromPath)}/${path}`;
}

/** Where `link`, in the file at `fromPath`, leads: the file to open, and the row to select there by name. */
export function linkDestination(link: LinkTarget, fromPath: string): LinkDestination {
  switch (link.kind) {
    case 'file':
      return { path: sourcePath(link.file, fromPath) };
    case 'block':
      return { path: sourcePath(link.source, fromPath), select: link.block };
    default:
      return { path: sourcePath(link.source, fromPath), select: link.name };
  }
}

/**
 * The path a project page's link names: `rel` (`models/plant.slx`, `../Lib`, either separator)
 * from the project's folder `root`, with `.` and `..` resolved.
 */
export function projectLinkPath(root: string, rel: string): string {
  const base = sourceUri(root).replace(/\/?$/, '/');
  const href = new URL(projectPathSegments(rel).map(encodeURIComponent).join('/'), base).href;
  return uriPath(href.replace(/([^/])\/$/, '$1'));
}
