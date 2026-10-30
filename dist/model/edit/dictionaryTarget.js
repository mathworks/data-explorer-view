// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/structuralEdit.ts at c73da3c (its
// resolveSectionForPaste, SectionTarget and sectionTarget). The extension keeps its own copy until
// its editors move onto view's engines; keep the two alike (view's CI reports a vscode commit to
// that file).
//
// Where a paste or a drop lands in a dictionary: a row's section, read off view's row ids.
import { findOwningEntry, sectionByName } from 'data-explorer-core';
import { isSectionRowId, sectionNameFromRowId } from '../ids/sectionRowId.js';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resolve the section a paste should target, given the right-clicked row's model node (may be
// null) and its row id. Two cases:
//  - The row is an entry or nested child → its owning entry's parent section.
//  - The row is a SECTION HEADER (`section:<name>`) → that section directly. findNode can't
//    resolve a `section:*` id (a real node id is a name-path, not prefixed), and an empty section
//    can ONLY be pasted into via its header, so the section is looked up on the model by name.
// Null if neither path yields a section (an unknown header, or a detached node).
export function resolveSectionForPaste(model, node, rowId) {
    const owning = node ? findOwningEntry(node) : null;
    if (owning?.parent)
        return owning.parent;
    if (typeof rowId === 'string' && isSectionRowId(rowId)) {
        return sectionByName(model, sectionNameFromRowId(rowId));
    }
    return null;
}
/**
 * The target a paste or drop onto `rowId` lands in, or null. One answer for both dictionary
 * formats, resolved before anything changes — and by NAME from then on: a same-document move that
 * has to re-read its model after removing the sources finds the section again by its name
 * (`sectionByName`), never through the row, which may have been one of the entries it moved.
 */
export function sectionTarget(model, node, rowId) {
    const section = resolveSectionForPaste(model, node, rowId);
    return section ? { sectionName: section.name, model, section } : null;
}
