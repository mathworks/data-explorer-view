// Copyright 2026 The MathWorks, Inc.
//
// Reading a core srcId back as the document it names (src/model/ids/srcId.ts): the edges of
// `srcIdToUriString`. Ported from data-explorer-vscode test/srcId.test.ts at 632f6e0. The round
// trip through `binaryEditSrcId`, and a plain uriString left alone, are sourceUri.test.ts's, over
// every kind of link target and every path it spells.
import { describe, it, expect } from 'vitest';
import { binaryEditSrcId, srcIdToUriString } from '../src/model/ids/srcId.js';

const URI = 'file:///w/Controller.sldd';

describe('srcIdToUriString', () => {
  it('leaves a bare basename alone', () => {
    // The block -> dictionary-variable grammar carries only a name; the host resolves it
    // against the workspace. Mangling it here would break links that work today.
    expect(srcIdToUriString('params.sldd')).toBe('params.sldd');
  });

  it('strips only a LEADING prefix', () => {
    // A file may legitimately be named for the prefix. Stripping anywhere in the string
    // would rewrite its path into one that names nothing.
    const odd = 'file:///w/binedit:notes.sldd';
    expect(srcIdToUriString(odd)).toBe(odd);
  });

  it('strips exactly one prefix', () => {
    // slice, not a repeated replace: nothing doubles the prefix, and quietly unwrapping a
    // srcId twice would resolve two different documents to the same one.
    expect(srcIdToUriString(binaryEditSrcId(binaryEditSrcId(URI)))).toBe(binaryEditSrcId(URI));
  });
});
