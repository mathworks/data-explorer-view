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
//   a MAT-file's variable, and a   the bytes of its element as read (`_rawBytes`, as a dump),
//   Model Workspace's              while they are what it holds; its record, as JSON, once it
//                                  is edited, or where core keeps no bytes (an object)
//   a model's block, external      no record of its own (core's serialize() is null): what the
//   data source or reference       model says of it, the facts core read from the file
//
// A section heading and the file itself have no record of their own that is cheap to write (a
// dictionary's whole text can be 46 MB), so each has a summary of itself, as ts's Raw pane had: a
// section's name and size; a dictionary's core properties, references and size; a MAT-file's
// header; a model's release, UUID, dictionary and the parts of its package.
//
// Total, as every answer of a TableSource is: a row that is not there has nothing to show, and a
// node core will not write says so.
import { ModelBlockNode, entryRecord, sectionByName, serializeEntryToXml, textDictionaryJson } from 'data-explorer-core';
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
import { noRaw, rawOfNode, rawOfValue } from './rawView.js';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * What the Raw pane says for a row whose raw form core refused to write (its XML, its record): not
 * NO_RAW_DATA, which is a row that has none, so that a failure does not pass for an empty answer.
 */
export const RAW_NOT_WRITTEN = "This row's raw form could not be written.";
/**
 * The raw form of the row `rowId` of the document `tree` is of, for the Raw pane: see the head
 * of this file for each kind of row. Nothing to show for a row that is not there (NO_RAW_DATA),
 * and RAW_NOT_WRITTEN where core throws as it writes one.
 */
export function rawOfRow(tree, rowId) {
    if (typeof rowId !== 'string' || rowId === '')
        return noRaw();
    try {
        const root = tree.root();
        if (!root)
            return noRaw();
        if (tree.fileIds.includes(rowId))
            return rawOfFile(root);
        if (isSectionRowId(rowId)) {
            const section = sectionByName(root, sectionNameFromRowId(rowId));
            return section ? rawOfValue({ section: section.displayName || section.name, entries: section.children.length }) : noRaw();
        }
        const node = tree.find(rowId);
        if (!node)
            return noRaw();
        switch (root.sourceFormat) {
            case 'json':
                return jsonRaw(node);
            case 'xml':
                return xmlRaw(node);
            case 'slx':
            case 'mdl':
                return modelRaw(node);
            default:
                return variableRaw(node);
        }
    }
    catch {
        // A node core will not write, as its record or its XML, or a tree that cannot be had: said as
        // a failure, not as a row with nothing to show.
        return noRaw(RAW_NOT_WRITTEN);
    }
}
/**
 * A row of a JSON dictionary: an entry's record (a deep copy, as core snapshots one), or a nested
 * row's part of it, spelt as the dictionary's text spells it: MATLAB's numbers (a double of a
 * million and up with a fraction), two spaces deep.
 */
function jsonRaw(node) {
    const value = node.isEntry ? entryRecord(node) : node.serialize?.();
    if (value === null || value === undefined)
        return noRaw();
    try {
        return { format: 'json', text: textDictionaryJson(value, 2) };
    }
    catch {
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
function xmlRaw(node) {
    if (node.isEntry)
        return { format: 'xml', text: outdented(serializeEntryToXml(node)) };
    if (typeof node.serializeXml !== 'function')
        return rawOfNode(node);
    const element = /^\d+$/.test(String(node.name));
    const written = element ? node.serializeXml('Element', {}, 0) : node.serializeXml('P', { Name: String(node.name) }, 0);
    if (typeof written !== 'string' || written === '')
        return noRaw();
    const text = outdented(written);
    // Core writes an object as the tag it is given around the object's own `<Element Class=…>`,
    // which is how a cell holds one. An array of objects holds each as that `<Element>` alone.
    return { format: 'xml', text: element && node.parent?.className !== 'cell' ? unwrapped(text) : text };
}
/** The one `<Element …>` an `<Element>` wraps, or `xml` as it is where it wraps no one element. */
function unwrapped(xml) {
    const open = '<Element>\n';
    const close = '\n</Element>';
    if (xml.length < open.length + close.length || !xml.startsWith(open) || !xml.endsWith(close))
        return xml;
    const inner = outdented(xml.slice(open.length, xml.length - close.length));
    const outer = inner.split('\n').filter((line) => !line.startsWith(' '));
    return outer.length <= 2 && outer[0].startsWith('<Element') ? inner : xml;
}
/** How many spaces `line` starts with. */
function indentOf(line) {
    let n = 0;
    while (n < line.length && line.charCodeAt(n) === 0x20)
        n++;
    return n;
}
/**
 * `text` with the indent every line has taken off, and no whitespace at its end: an entry's
 * `<Object>` comes out of the chunk four spaces in, and stands at the left edge alone.
 *
 * Linear in the text, whatever it holds. An entry can run to hundreds of thousands of lines, over
 * which a spread into Math.min overflows the stack; and a value can hold a long run of spaces
 * anywhere, from each of which a regular expression for the whitespace at the end scans again.
 */
function outdented(text) {
    const lines = text.trimEnd().split('\n');
    let indent = Infinity;
    for (const line of lines) {
        const n = indentOf(line);
        // A line of whitespace alone sets no indent.
        if (n < indent && line.trim() !== '')
            indent = n;
    }
    if (indent === 0 || indent === Infinity)
        return lines.join('\n');
    return lines.map((line) => line.slice(Math.min(indent, indentOf(line)))).join('\n');
}
/**
 * A row of a MAT-file, or of a Model Workspace: the bytes of its element while they are still what
 * it holds, and otherwise its record, which a save writes. Core keeps the bytes it read past an
 * edit, a rename or an edit of a row inside the variable (a save replays them for what no edit
 * touched); the variable as read (`_matVar`) is what they spell, and it is gone, or stale
 * (`_varStale`), once anything in it moved. An undo puts both back, and the bytes are shown again.
 */
function variableRaw(node) {
    const asRead = !!node._matVar && !node._varStale;
    return node._rawBytes instanceof Uint8Array && !asRead ? rawOfValue(node.serialize()) : rawOfNode(node);
}
/**
 * A row of a model. A Model Workspace variable and a configuration set have bytes, or a record, as
 * a MAT-file's variable has (variableRaw). A block, an external data source and a model reference
 * have none in core (their serialize() is null): what the model says of each, as core read it,
 * stands for one.
 */
function modelRaw(node) {
    const own = variableRaw(node);
    if (own.format !== 'none')
        return own;
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
    if (typeof node.fullPath === 'string')
        return rawOfValue({ name: node.name, fullPath: node.fullPath });
    if (typeof node.blockPath === 'string')
        return rawOfValue({ name: node.name, blockPath: node.blockPath });
    return own;
}
/**
 * The file itself: a summary of it, each kind's facts as core read them. Never the whole file's
 * record, which can be as large as the file.
 */
function rawOfFile(root) {
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
