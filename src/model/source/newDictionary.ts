// Copyright 2026 The MathWorks, Inc.
//
// The bytes of a new data dictionary: what the shell's New opens (Workspace.create), and what its
// first save writes. Exactly what MATLAB R2027a writes for one (`Simulink.data.dictionary.create`
// then `saveChanges`): a text dictionary, tab-indented, with no entries, no references and the base
// workspace shut off, stamped with the release. So they are written by core's own writer for a text
// dictionary (textDictionaryJson, which a save writes with), under core's own names for the part
// that holds the entries, and test/newDictionary.test.ts holds them to MATLAB's bytes.
import { DATA_PART_KEY, TEXT_CONTENT, TEXT_PARTS, textDictionaryJson } from 'data-explorer-core';

/**
 * The release a new dictionary is stamped with: the one MATLAB wrote the bytes above with, and the
 * one core's text dictionaries are measured on.
 */
const RELEASE = 'R2027a';

/** A new, empty data dictionary's bytes, MATLAB's own: a copy each time, for a workspace keeps what it is given. */
export function newDictionaryBytes(): Uint8Array {
  const dictionary = {
    __MW_TEXT_COREPROPERTIES__: { release: RELEASE },
    [TEXT_PARTS]: {
      [DATA_PART_KEY]: {
        [TEXT_CONTENT]: { entries: [], 'Dictionary References': [], AllowAccessBWS: false },
      },
    },
  };
  // No newline at the end: MATLAB writes none.
  return new TextEncoder().encode(textDictionaryJson(dictionary, '\t'));
}
