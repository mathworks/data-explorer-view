// Copyright 2026 The MathWorks, Inc.
// A fixture opened as an app opens a file: its bytes parsed by core, through view's document
// registry, under a srcId of its own. Row ids start with that srcId, and the inspector, the
// variable editor and lazy children find their node by it.
//
// Hand wiring, until view reads files for a table itself (see ../../README.md).
import { getModelFromBytes, openSourceView, releaseSourceView } from 'data-explorer-view/model';
import type { Fixture } from '../fixtures';

export interface OpenDocument {
  /** The srcId: any URI naming the file, here one per fixture. */
  uri: string;
  /** The file's name, by which core and view tell its kind. */
  name: string;
  /** core's root node for the file. */
  node: unknown;
}

export async function openFixture(fixture: Fixture): Promise<OpenDocument> {
  const response = await fetch(fixture.url);
  if (!response.ok) throw new Error(`${fixture.name}: ${response.status} ${response.statusText}`);
  const uri = `file:///fixtures/${fixture.name}`;
  const node = getModelFromBytes(uri, fixture.name, await response.arrayBuffer());
  // One view holds the tree; releaseSourceView gives it back.
  openSourceView(uri);
  return { uri, name: fixture.name, node };
}

export function closeDocument(doc: OpenDocument): void {
  releaseSourceView(doc.uri);
}
