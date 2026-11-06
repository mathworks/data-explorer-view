// Copyright 2026 The MathWorks, Inc.
//
// The raw form of a row of a document's table: what `TableSource.raw` answers, for every kind of
// file the workspace opens.
//
// A row's raw form is what the file holds for it, as core gives it, so it depends on the file:
//
//   a JSON dictionary's entry      its record (core's entryRecord), as JSON spelt as the
//                                  dictionary's text spells it (core's textDictionaryJson)
//   a compressed dictionary's      its <Object> as the chunk's XML holds it (core's
//   entry                          serializeEntryToXml), out of the chunk's indent
//   a row inside an entry          its part of the same: a JSON value, or the XML element it is
//                                  written as (`<P Name=…>`, or a cell's `<Element>`)
//   a MAT-file's variable, and a   the bytes of its element as read (`_rawBytes`, as a dump), or
//   Model Workspace's              its record where core keeps no bytes (an object), as JSON
//   a model's block, external      no record of its own (core's serialize() is null): what the
//   data source or reference       model says of it, the facts core read from the file
//
// A section heading and the file itself have no record of their own that is cheap to write (a
// dictionary's whole text can be 46 MB), so each has a summary of itself, as ts's Raw pane had: a
// section's name and size; a dictionary's core properties, references and size; a MAT-file's
// header; a model's release, UUID, dictionary and the parts of its package.
//
// Total, as every answer of a TableSource is: a row that is not there, or a node core will not
// write, has nothing to show.
import { ModelBlockNode, entryRecord, sectionByName, serializeEntryToXml, textDictionaryJson } from 'data-explorer-core';
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
import { noRaw, rawOfNode, rawOfValue, type RawView } from './rawView.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A document's tree, as `rawOfRow` reads it. */
export interface RawSource {
  /** The document's root node: the tree its table's rows are of. */
  readonly root: unknown;
  /** The ids that name the file itself: its uri, and the srcId its tree is registered under. */
  readonly fileIds: readonly string[];
  /** The node a row id names in the tree, or null. */
  find(rowId: string): unknown;
}

/**
 * The raw form of the row `rowId` of the document `source` holds, for the Raw pane: see the head
 * of this file for each kind of row. Nothing to show for a row that is not there.
 */
export function rawOfRow(source: RawSource, rowId: string): RawView {
  const root = source.root as any;
  if (!root || typeof rowId !== 'string' || rowId === '') return noRaw();
  try {
    if (source.fileIds.includes(rowId)) return rawOfFile(root);
    if (isSectionRowId(rowId)) {
      const section = sectionByName(root, sectionNameFromRowId(rowId)!);
      return section ? rawOfValue({ section: section.displayName || section.name, entries: section.children.length }) : noRaw();
    }
    const node = source.find(rowId) as any;
    if (!node) return noRaw();
    switch (root.sourceFormat) {
      case 'json':
        return jsonRaw(node);
      case 'xml':
        return xmlRaw(node);
      case 'slx':
      case 'mdl':
        return modelRaw(node);
      default:
        return rawOfNode(node);
    }
  } catch {
    // A node core will not write, as its record or its XML: nothing to show for it.
    return noRaw();
  }
}

/**
 * A row of a JSON dictionary: an entry's record (a deep copy, as core snapshots one), or a nested
 * row's part of it, spelt as the dictionary's text spells it: MATLAB's numbers (a double of a
 * million and up with a fraction), two spaces deep.
 */
function jsonRaw(node: any): RawView {
  const value = node.isEntry ? entryRecord(node) : node.serialize?.();
  if (value === null || value === undefined) return noRaw();
  try {
    return { format: 'json', text: textDictionaryJson(value, 2) };
  } catch {
    // A value the dictionary's writer refuses (a BigInt) is written as any other record is.
    return rawOfValue(value);
  }
}

/**
 * A row of a compressed dictionary: an entry's `<Object>` as its chunk holds it, and a nested
 * row's element as its entry's XML writes it. A property or a field is a `<P>` named for it; an
 * element of a cell or an array is named by its place (1, 2, …), which no MATLAB name can be,
 * and is an `<Element>` with no name.
 */
function xmlRaw(node: any): RawView {
  if (node.isEntry) return { format: 'xml', text: outdented(serializeEntryToXml(node)) };
  if (typeof node.serializeXml !== 'function') return rawOfNode(node);
  const element = /^\d+$/.test(String(node.name));
  const written: unknown = element ? node.serializeXml('Element', {}, 0) : node.serializeXml('P', { Name: String(node.name) }, 0);
  if (typeof written !== 'string' || written === '') return noRaw();
  const text = outdented(written);
  // Core writes an object as the tag it is given around the object's own `<Element Class=…>`,
  // which is how a cell holds one. An array of objects holds each as that `<Element>` alone.
  return { format: 'xml', text: element && node.parent?.className !== 'cell' ? unwrapped(text) : text };
}

/** The one `<Element …>` an `<Element>` wraps, or `xml` as it is where it wraps no one element. */
function unwrapped(xml: string): string {
  const wrapped = /^<Element>\n([\s\S]*)\n<\/Element>$/.exec(xml);
  if (!wrapped) return xml;
  const inner = outdented(wrapped[1]!);
  const outer = inner.split('\n').filter((line) => !line.startsWith(' '));
  return outer.length <= 2 && outer[0]!.startsWith('<Element') ? inner : xml;
}

/**
 * `text` with the indent every line has taken off, and no line break at its end: an entry's
 * `<Object>` comes out of the chunk four spaces in, and stands at the left edge alone.
 */
function outdented(text: string): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^ */.exec(line)![0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return indent === 0 ? lines.join('\n') : lines.map((line) => line.slice(Math.min(indent, /^ */.exec(line)![0].length))).join('\n');
}

/**
 * A row of a model. A Model Workspace variable and a configuration set have a record, or bytes, as
 * any node has (rawOfNode). A block, an external data source and a model reference have none in
 * core (their serialize() is null): what the model says of each, as core read it, stands for one.
 */
function modelRaw(node: any): RawView {
  const own = rawOfNode(node);
  if (own.format !== 'none') return own;
  if (node instanceof ModelBlockNode) {
    return rawOfValue({
      name: node.name,
      blockType: node.blockType,
      sid: node.sid,
      blockPath: node.blockPath,
      parameters: node.paramUsages.map(({ property, value }) => ({ property, value })),
    });
  }
  // A DataSourceNode has the path the model names the file by; a ModelReferenceNode, the path of
  // the block that references it. Neither class is core's to export.
  if (typeof node.fullPath === 'string') return rawOfValue({ name: node.name, fullPath: node.fullPath });
  if (typeof node.blockPath === 'string') return rawOfValue({ name: node.name, blockPath: node.blockPath });
  return own;
}

/**
 * The file itself: a summary of it, each kind's facts as core read them. Never the whole file's
 * record, which can be as large as the file.
 */
function rawOfFile(root: any): RawView {
  switch (root.sourceFormat) {
    case 'json':
    case 'xml':
      return rawOfValue({
        format: root.FileFormat,
        coreProperties: root.coreProperties ?? null,
        dictionaryReferences: root.dictionaryReferences ?? [],
        allowAccessBWS: root.allowAccessBWS,
        entries: root.NumberOfEntries,
      });
    case 'mat':
      return rawOfValue({ header: root.header, variables: root.children.length });
    case 'slx':
    case 'mdl':
      return rawOfValue({
        format: root.sourceFormat,
        release: root.release,
        uuid: root.uuid,
        dataDictionary: root.dataDictionary ?? null,
        // The text parts of an .slx package, by name; an .mdl is one text and has none.
        ...(root.rawContents ? { parts: Object.keys(root.rawContents) } : {}),
      });
    default:
      return noRaw();
  }
}
