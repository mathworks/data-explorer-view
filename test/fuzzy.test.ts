// Copyright 2026 The MathWorks, Inc.
//
// The command palette's filter (src/model/shell/fuzzy.ts): which commands a query finds, and in
// what order. A person types a few letters and presses Enter on the first row, so the order is
// the feature: the command they meant has to be on top. Three things are held here. Every command
// whose label holds the query's letters in order is found, and no other (but for the category
// rule below). The order is prefix, then word starts, then any subsequence, and within one of
// those the commands run lately come first. And the positions are the characters the query
// matched, which the palette draws in bold, so they must be the label's own characters.
import { describe, it, expect } from 'vitest';
import { fuzzyMatch, rankCommands, type RankItem } from '../src/model/shell/fuzzy.js';

// the prototype's palette, which these commands are taken from.
const COMMANDS: RankItem[] = [
  { id: 'new', label: 'New', category: 'File' },
  { id: 'save', label: 'Save', category: 'File' },
  { id: 'saveAs', label: 'Save As', category: 'File' },
  { id: 'saveAll', label: 'Save All', category: 'File' },
  { id: 'close', label: 'Close', category: 'File' },
  { id: 'paste', label: 'Paste', category: 'Edit' },
  { id: 'toggleExplorer', label: 'Toggle Explorer', category: 'View' },
  { id: 'toggleSearch', label: 'Toggle Search', category: 'View' },
  { id: 'toggleRaw', label: 'Toggle Raw View', category: 'View' },
  { id: 'settings', label: 'Settings', category: 'Other' },
];

const ids = (query: string, recent: string[] = []): string[] => rankCommands(COMMANDS, query, recent).map((r) => r.item.id);

describe('fuzzyMatch', () => {
  it('finds a text that begins with the query, in any case, as a prefix', () => {
    expect(fuzzyMatch('sav', 'Save As')).toEqual({ tier: 'prefix', positions: [0, 1, 2] });
    expect(fuzzyMatch('SAVE', 'save')).toEqual({ tier: 'prefix', positions: [0, 1, 2, 3] });
  });

  it('finds a query whose letters begin words of the text, or run on from one, as a word match', () => {
    // "exp" is the start of Explorer; "tr" the starts of Toggle and Raw; "togex" runs on from both.
    expect(fuzzyMatch('exp', 'Toggle Explorer')).toEqual({ tier: 'word', positions: [7, 8, 9] });
    expect(fuzzyMatch('tr', 'Toggle Raw View')).toEqual({ tier: 'word', positions: [0, 7] });
    expect(fuzzyMatch('togex', 'Toggle Explorer')).toEqual({ tier: 'word', positions: [0, 1, 2, 7, 8] });
  });

  it('takes a word start after punctuation and in camelCase', () => {
    expect(fuzzyMatch('as', 'Save.As')).toEqual({ tier: 'word', positions: [5, 6] });
    expect(fuzzyMatch('f', 'openFile')).toEqual({ tier: 'word', positions: [4] });
    // An upper-case letter after another is no word start: MATLAB is one word.
    expect(fuzzyMatch('tl', 'MATLAB')?.tier).toBe('subsequence');
  });

  it('finds the word match a first greedy try would miss', () => {
    // Show's S starts a word, but no word starts with the e that would follow it: the match is
    // Search's S and the e that runs on from it.
    expect(fuzzyMatch('se', 'Show Search')).toEqual({ tier: 'word', positions: [5, 6] });
  });

  it('finds the query as letters in order anywhere else, as a subsequence', () => {
    expect(fuzzyMatch('ste', 'Paste')).toEqual({ tier: 'subsequence', positions: [2, 3, 4] });
    expect(fuzzyMatch('ogl', 'Toggle')).toEqual({ tier: 'subsequence', positions: [1, 2, 4] });
  });

  it('finds nothing when a letter is missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'Save')).toBeNull();
    expect(fuzzyMatch('evas', 'Save')).toBeNull();
    expect(fuzzyMatch('saves', 'Save')).toBeNull();
  });

  it('reads a space in the query as the start of another word', () => {
    // "save as" is a prefix of Save As as typed; "sa a" asks for a word starting with "a".
    expect(fuzzyMatch('save as', 'Save As')).toEqual({ tier: 'prefix', positions: [0, 1, 2, 3, 5, 6] });
    expect(fuzzyMatch('sa a', 'Save As')).toEqual({ tier: 'word', positions: [0, 1, 5] });
    // Without a word there to start, the space asks for nothing more than the letters in order.
    expect(fuzzyMatch('sa ve', 'Save')).toEqual({ tier: 'subsequence', positions: [0, 1, 2, 3] });
  });

  it('ignores spaces at either end, and runs of them', () => {
    expect(fuzzyMatch('  save   as ', 'Save As')).toEqual({ tier: 'prefix', positions: [0, 1, 2, 3, 5, 6] });
  });

  it('matches anything to an empty query, at no position', () => {
    expect(fuzzyMatch('', 'Save')).toEqual({ tier: 'prefix', positions: [] });
    expect(fuzzyMatch('   ', 'Save')).toEqual({ tier: 'prefix', positions: [] });
  });

  it('answers at once for a long query that is a subsequence of a long label and no word match', () => {
    // Every 'a' starts a word and the 'b' at the end follows an 'x', so the letters are all there
    // in order but no word match exists, and the word match has to rule out every way of placing
    // the a's. Its two tables of letters by text do that in one pass from the last letter back;
    // the search that went back over the places before them took seconds here.
    const started = Date.now();
    expect(fuzzyMatch(`${'a'.repeat(199)}b`, `${'a '.repeat(1000)}xb`)?.tier).toBe('subsequence');
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('matches the first 200 characters of a longer query', () => {
    // A query pasted by mistake (a whole file's text) is cut short rather than searched for.
    const started = Date.now();
    const match = fuzzyMatch('a'.repeat(10_000), 'a'.repeat(300));
    expect(match).toEqual({ tier: 'prefix', positions: Array.from({ length: 200 }, (_, i) => i) });
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('answers at once for a query it cannot place among many word starts', () => {
    // Every 'a' starts a word, so a word match that tried each way of placing sixty of them among
    // a hundred before giving up on the 'b' would never finish. The text holds no 'b', so the
    // plain subsequence test that runs first answers before the word match is tried at all.
    const started = Date.now();
    expect(fuzzyMatch(`${'a'.repeat(60)}b`, 'a '.repeat(100))).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('rankCommands', () => {
  it('lists every command, in the order given, for an empty query', () => {
    expect(ids('')).toEqual(COMMANDS.map((c) => c.id));
  });

  it('lists the recent commands first for an empty query, latest first, then the rest in order', () => {
    expect(ids('', ['toggleRaw', 'save'])).toEqual([
      'toggleRaw', 'save', 'new', 'saveAs', 'saveAll', 'close', 'paste', 'toggleExplorer', 'toggleSearch', 'settings',
    ]);
  });

  it('ignores a recent id that is no command any more', () => {
    expect(ids('', ['gone', 'close'])[0]).toBe('close');
  });

  it('ranks prefix matches over word matches over subsequences', () => {
    // "s": Save, Save As, Save All, Settings begin with it; Toggle Search has a word that does;
    // Paste and Close only hold an s.
    expect(ids('s')).toEqual(['save', 'saveAs', 'saveAll', 'settings', 'toggleSearch', 'paste', 'close']);
  });

  it('ranks, within one kind of match, the earlier match first, then the order given', () => {
    // "o" begins no label and no word of one. The Toggles hold it at 1 and Close at 2, so Close
    // follows them though it is given first; the three Toggles keep their order. Settings is
    // found by its category, Other, last.
    expect(ids('o')).toEqual(['toggleExplorer', 'toggleSearch', 'toggleRaw', 'close', 'settings']);
  });

  it('puts the recent commands first within one kind of match, and not above a better one', () => {
    // A command run lately is the likelier one of equals; but a weak match it is does not jump a
    // label that begins with what was typed.
    expect(ids('sav', ['saveAll'])).toEqual(['saveAll', 'save', 'saveAs']);
    expect(ids('s', ['close'])).toEqual(['save', 'saveAs', 'saveAll', 'settings', 'toggleSearch', 'close', 'paste']);
  });

  it("lists a command by its category's words after every label match, never by a loose subsequence", () => {
    // "vie": Toggle Raw View by its label, then the other View commands by their category.
    expect(ids('vie')).toEqual(['toggleRaw', 'toggleExplorer', 'toggleSearch']);
    // "it" is in Edit only as a subsequence, and in no label at all: nothing is found for it.
    expect(ids('it')).toEqual([]);
  });

  it('gives the positions of the label for a label match, and none for a category match', () => {
    const ranked = rankCommands(COMMANDS, 'vie');
    expect(ranked[0]!.positions).toEqual([11, 12, 13]);
    expect(ranked[1]!.positions).toEqual([]);
  });

  it('finds nothing for a query no label or category holds', () => {
    expect(ids('qqq')).toEqual([]);
  });

  it('gives back the items it was given, not copies', () => {
    expect(rankCommands(COMMANDS, '')[0]!.item).toBe(COMMANDS[0]);
  });
});
