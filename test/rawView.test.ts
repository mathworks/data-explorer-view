// Copyright 2026 The MathWorks, Inc.
//
// The Raw pane's model (src/model/raw/rawView.ts): what a node's raw form is, the hex dump of a
// value's bytes, and the two tokenizers the pane colours its text by.
//
// The pane draws what these give it and nothing else, so each promise here is one a user sees:
// a tokenizer that dropped or doubled a character would show a record other than the one the file
// holds, one that threw would leave the pane blank on a file it could not read, and a dump with no
// cap would hang the page on a large matrix. So the tokenizers are held to giving back exactly the
// text they were given, on any text at all (malformed, cut short, random), and the dump to its
// layout and its cap. rawOfNode is held to ts's rules over hand-made nodes; what each kind of
// document answers, over real files, is test/rawSource.test.ts.
import { describe, expect, it } from 'vitest';
import {
  HEX_LIMIT,
  NO_RAW_DATA,
  formatHex,
  rawOfNode,
  rawOfValue,
  tokenizeJson,
  tokenizeXml,
  type RawToken,
} from '../src/model/raw/rawView.js';

const joined = (tokens: RawToken[]): string => tokens.map((t) => t.text).join('');
// The tokens as `kind:text`, whitespace left out (and trimmed off the text around it), so a case
// reads as the coloured text does.
const shown = (tokens: RawToken[]): string[] =>
  tokens.filter((t) => t.text.trim() !== '').map((t) => `${t.kind}:${t.kind === 'text' ? t.text.trim() : t.text}`);

// A small seeded generator, so a failure of the random cases is the same failure next time.
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('tokenizeJson', () => {
  it('names each part of a record: keys, strings, numbers, literals and punctuation', () => {
    const text = JSON.stringify({ name: 'Kp', value: -1.5e3, tags: [true, false, null], n: 0 }, null, 2);
    const tokens = tokenizeJson(text);
    expect(joined(tokens)).toBe(text);
    expect(shown(tokens)).toEqual([
      'punct:{',
      'key:"name"', 'punct::', 'string:"Kp"', 'punct:,',
      'key:"value"', 'punct::', 'number:-1500', 'punct:,',
      'key:"tags"', 'punct::', 'punct:[', 'literal:true', 'punct:,', 'literal:false', 'punct:,', 'literal:null', 'punct:]', 'punct:,',
      'key:"n"', 'punct::', 'number:0',
      'punct:}',
    ]);
  });

  it('reads a key with space before its colon, and a string with escapes as one string', () => {
    const text = '{ "a\\"b" : "c\\\\" , "d": "e\\u0041" }';
    expect(shown(tokenizeJson(text))).toEqual([
      'punct:{', 'key:"a\\"b"', 'punct::', 'string:"c\\\\"', 'punct:,', 'key:"d"', 'punct::', 'string:"e\\u0041"', 'punct:}',
    ]);
  });

  it('spells every JSON number as one number', () => {
    for (const n of ['0', '-0', '12', '-3.25', '1e300', '2E-7', '6.02e+23']) {
      expect(tokenizeJson(n), n).toEqual([{ kind: 'number', text: n }]);
    }
  });

  it('gives whitespace, and everything that is not JSON, as text, one token for each run', () => {
    expect(tokenizeJson('  \n\t ')).toEqual([{ kind: 'text', text: '  \n\t ' }]);
    // A word that is not a literal, and a stray character, are text, run together with the
    // whitespace around them.
    expect(tokenizeJson('[NaN, @ Infinity]')).toEqual([
      { kind: 'punct', text: '[' },
      { kind: 'text', text: 'NaN' },
      { kind: 'punct', text: ',' },
      { kind: 'text', text: ' @ Infinity' },
      { kind: 'punct', text: ']' },
    ]);
    expect(tokenizeJson('')).toEqual([]);
  });

  it('ends a string left open at the end of its line, so the next line is still read', () => {
    const text = '{"a": "open\n"b": 1}';
    const tokens = tokenizeJson(text);
    expect(joined(tokens)).toBe(text);
    expect(shown(tokens)).toEqual(['punct:{', 'key:"a"', 'punct::', 'string:"open', 'key:"b"', 'punct::', 'number:1', 'punct:}']);
    expect(tokenizeJson('"to the end')).toEqual([{ kind: 'string', text: '"to the end' }]);
    expect(tokenizeJson('"\\')).toEqual([{ kind: 'string', text: '"\\' }]);
  });

  it('reads a malformed number as far as it is one, and a lone minus as text', () => {
    expect(shown(tokenizeJson('01 - 1. 2e'))).toEqual(['number:0', 'number:1', 'text:-', 'number:1', 'text:.', 'number:2', 'text:e']);
  });

  it('gives back the text it was given, whatever it is, and never throws', () => {
    const next = random(7);
    const valid = JSON.stringify({ a: [1, -2.5, 'x"y', { b: null, c: true }], d: '\\', e: '' }, null, 2);
    const alphabet = '{}[]:,"\\-+.eE0123456789 \n\ttrufalsn@xyz';
    for (let i = 0; i < 300; i++) {
      const from = Math.floor(next() * valid.length);
      const cut = valid.slice(from, from + Math.floor(next() * valid.length));
      const noise = Array.from({ length: Math.floor(next() * 40) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
      for (const text of [cut, noise, cut + noise]) {
        const tokens = tokenizeJson(text);
        expect(joined(tokens)).toBe(text);
        expect(tokens.every((t) => t.text.length > 0)).toBe(true);
      }
    }
  });
});

describe('tokenizeXml', () => {
  it('names each part of an element: its tag, its attributes, their values, its text', () => {
    const text = '<P Name="Value" Class="double">1.0</P>';
    const tokens = tokenizeXml(text);
    expect(joined(tokens)).toBe(text);
    expect(shown(tokens)).toEqual([
      'punct:<', 'tag:P', 'attr:Name', 'punct:=', 'string:"Value"', 'attr:Class', 'punct:=', 'string:"double"', 'punct:>',
      'text:1.0',
      'punct:</', 'tag:P', 'punct:>',
    ]);
  });

  it('reads a declaration, a comment, a self-closing element and single quotes', () => {
    const text = "<?xml version='1.0'?>\n<!-- a <b> comment -->\n<Object Class=\"DD.ENTRY\"/>";
    const tokens = tokenizeXml(text);
    expect(joined(tokens)).toBe(text);
    expect(shown(tokens)).toEqual([
      'punct:<?', 'tag:xml', 'attr:version', 'punct:=', "string:'1.0'", 'punct:?>',
      'comment:<!-- a <b> comment -->',
      'punct:<', 'tag:Object', 'attr:Class', 'punct:=', 'string:"DD.ENTRY"', 'punct:/>',
    ]);
  });

  it('keeps a CDATA section, and an entity, as the text they are', () => {
    const text = '<P><![CDATA[a <b> & c]]> &amp; d</P>';
    expect(shown(tokenizeXml(text))).toEqual(['punct:<', 'tag:P', 'punct:>', 'text:<![CDATA[a <b> & c]]> &amp; d', 'punct:</', 'tag:P', 'punct:>']);
  });

  it('reads malformed markup as far as it goes: a lone <, an open comment, an open tag, an open value', () => {
    expect(shown(tokenizeXml('a < b'))).toEqual(['text:a < b']);
    expect(tokenizeXml('<!-- open')).toEqual([{ kind: 'comment', text: '<!-- open' }]);
    expect(shown(tokenizeXml('<a b="open'))).toEqual(['punct:<', 'tag:a', 'attr:b', 'punct:=', 'string:"open']);
    // A tag that opens inside another ends the first one.
    expect(shown(tokenizeXml('<a <b>'))).toEqual(['punct:<', 'tag:a', 'punct:<', 'tag:b', 'punct:>']);
    expect(shown(tokenizeXml('<a / x>'))).toEqual(['punct:<', 'tag:a', 'text:/', 'attr:x', 'punct:>']);
    expect(tokenizeXml('')).toEqual([]);
  });

  it('gives back the text it was given, whatever it is, and never throws', () => {
    const next = random(11);
    const valid = '<?xml version="1.0"?>\n<Object Class="DD.ENTRY">\n  <!-- x -->\n  <P Name="a">1 &lt; 2</P>\n  <Element/>\n</Object>';
    const alphabet = '<>/?!-="\' \n[]CDATAabc&;';
    for (let i = 0; i < 300; i++) {
      const from = Math.floor(next() * valid.length);
      const cut = valid.slice(from, from + Math.floor(next() * valid.length));
      const noise = Array.from({ length: Math.floor(next() * 40) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
      for (const text of [cut, noise, cut + noise]) {
        const tokens = tokenizeXml(text);
        expect(joined(tokens)).toBe(text);
        expect(tokens.every((t) => t.text.length > 0)).toBe(true);
      }
    }
  });
});

describe('formatHex', () => {
  const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

  it('lays out 16 bytes a line: the offset, the bytes, and what they read as', () => {
    const bytes = new Uint8Array([...ascii('MATLAB 5.0 MAT-f'), 0x00, 0x0e, 0x7f, 0x41]);
    expect(formatHex(bytes).split('\n')).toEqual([
      '00000000  4d 41 54 4c 41 42 20 35 2e 30 20 4d 41 54 2d 66  MATLAB 5.0 MAT-f',
      // A short last line keeps the third column where the others have it; an unprintable byte is a dot.
      '00000010  00 0e 7f 41                                      ...A',
    ]);
  });

  it('dumps the first 64 KB, and says how many bytes it left out', () => {
    const bytes = new Uint8Array(HEX_LIMIT + 1234);
    const lines = formatHex(bytes).split('\n');
    expect(HEX_LIMIT).toBe(64 * 1024);
    expect(lines).toHaveLength(HEX_LIMIT / 16 + 1);
    expect(lines.at(-2)!.startsWith('0000fff0  00')).toBe(true);
    expect(lines.at(-1)).toBe('… 1,234 more bytes');
  });

  it('takes a cap of its own, and says one byte as one', () => {
    expect(formatHex(ascii('abcdefghijklmnopq'), 16).split('\n')).toEqual([
      '00000000  61 62 63 64 65 66 67 68 69 6a 6b 6c 6d 6e 6f 70  abcdefghijklmnop',
      '… 1 more byte',
    ]);
    expect(formatHex(ascii('abc'), 0)).toBe('… 3 more bytes');
  });

  it('dumps no bytes as no text', () => {
    expect(formatHex(new Uint8Array(0))).toBe('');
  });
});

describe('rawOfNode: the prototype\'s rules', () => {
  it("is a node's bytes, where it keeps the bytes it was read from", () => {
    const bytes = new Uint8Array([14, 0, 0, 0]);
    const raw = rawOfNode({ _rawBytes: bytes, serialize: () => ({ name: 'x' }) });
    expect(raw).toEqual({ format: 'hex', bytes });
    // The node's own bytes, not a copy: the dump is read once, and a copy of a large matrix costs.
    expect(raw.format === 'hex' && raw.bytes).toBe(bytes);
  });

  it('is its record as JSON, two spaces deep, where it has one', () => {
    expect(rawOfNode({ serialize: () => ({ name: 'Kp', value: [1, 2] }) })).toEqual({
      format: 'json',
      text: '{\n  "name": "Kp",\n  "value": [\n    1,\n    2\n  ]\n}',
    });
    expect(rawOfNode({ _rawBytes: new Uint8Array(0), serialize: () => 4 })).toEqual({ format: 'json', text: '4' });
    expect(rawOfNode({ _rawBytes: null, serialize: () => 'Roadster' })).toEqual({ format: 'json', text: '"Roadster"' });
  });

  it('is nothing, said so, for no node, no record, or a record that cannot be read', () => {
    const none = { format: 'none', reason: NO_RAW_DATA };
    expect(NO_RAW_DATA).toBe('No raw data for this row.');
    for (const node of [null, undefined, 'x', 3, {}, { serialize: () => null }, { serialize: () => undefined }, { serialize: 'x' }]) {
      expect(rawOfNode(node), String(node)).toEqual(none);
    }
    expect(
      rawOfNode({
        serialize: () => {
          throw new Error('no');
        },
      }),
    ).toEqual(none);
  });
});

describe('rawOfValue', () => {
  it('writes a 64-bit integer, which JSON has no number for, as its digits', () => {
    expect(rawOfValue({ n: 18446744073709551615n })).toEqual({ format: 'json', text: '{\n  "n": "18446744073709551615"\n}' });
  });

  it('falls back to the value as text where JSON cannot write it, and to nothing where there is none', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(rawOfValue(loop)).toEqual({ format: 'text', text: '[object Object]' });
    expect(rawOfValue(() => 1)).toEqual({ format: 'none', reason: NO_RAW_DATA });
    expect(rawOfValue(null)).toEqual({ format: 'none', reason: NO_RAW_DATA });
  });
});
