// Copyright 2026 The MathWorks, Inc.
//
// The command palette's filter: which commands a few typed letters find, and in what order. A
// person types "sav" or "tex" and presses Enter on the first row, so the order is what matters
// most, and it follows the strength of the match before anything else:
//
//   prefix       the label begins with the query            "sav"  → Save As
//   word         each letter begins a word, or runs on from  "exp"  → Toggle Explorer
//                the letter before it                        "tr"   → Toggle Raw View
//   subsequence  the letters are in the label, in order      "ste"  → Paste
//
// the prototype's palette kept every subsequence match in the order the commands were written,
// so "s" put Close above Settings. Within one strength the commands run lately come first, then
// the one whose match starts earlier, then the order the app gave: a command used a moment ago
// is the likelier of two equal matches, but a loose match of it never climbs over a label that
// begins with what was typed.
//
// Case is ignored, and a space in the query means "and then a new word": "sa a" is Save As and
// not Save. A command whose label does not match is still listed, after every one that does, when
// its category begins with the query or the query begins its words ("vie" lists the View commands
// under Toggle Raw View); a loose subsequence of a category ("it" in Edit) lists nothing, since
// every command of the category would follow it into the list.
//
// DOM-free, as every model is: the palette draws what rankCommands returns.

/** How strongly a query matched a text, strongest first. */
export type MatchTier = 'prefix' | 'word' | 'subsequence';

/** A query's match in one text. */
export interface FuzzyMatch {
  /** How strongly it matched. */
  tier: MatchTier;
  /**
   * The indices in the text of the characters the query's letters matched, ascending: what the
   * palette draws in bold. A space in the query matches no character and has no index.
   */
  positions: number[];
}

/** What rankCommands reads of a command: the palette's PaletteCommand is one. */
export interface RankItem {
  /** What the recent list names it by. */
  id: string;
  /** The text the query is matched against first. */
  label: string;
  /** A group name the query is matched against when the label does not match. */
  category?: string;
}

/** A command rankCommands found, with where in its label the query matched. */
export interface Ranked<T> {
  /** The command, as given (not a copy). */
  item: T;
  /** As FuzzyMatch's positions, in the label; empty when the category matched, or the query is empty. */
  positions: number[];
}

// The order of the strengths, and the one past them that a category match takes.
const TIER_RANK: Record<MatchTier, number> = { prefix: 0, word: 1, subsequence: 2 };
const CATEGORY_RANK = 3;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const LOWER = /\p{Ll}/u;
const UPPER = /\p{Lu}/u;

/** One character of the text or the query, as it is compared: case folded. */
const fold = (ch: string): string => ch.toLowerCase();

/**
 * Whether a word begins at `at` in `text`: at the start, after anything that is not a letter or a
 * digit (a space, a dot, a colon, a bracket), or where a lower-case letter turns upper-case
 * (openFile). An upper-case letter after another is the same word, so MATLAB is one.
 */
function isWordStart(text: string, at: number): boolean {
  if (at === 0) return true;
  const before = text[at - 1]!;
  if (!LETTER_OR_DIGIT.test(before)) return true;
  return LOWER.test(before) && UPPER.test(text[at]!);
}

/** One letter of the query, and whether a space came before it (so it must begin a word). */
interface Letter {
  ch: string;
  afterSpace: boolean;
}

// More than anyone types into a palette: a longer query is a paste by mistake (a file's text),
// matched by its first 200 code units rather than searched for whole.
const MAX_QUERY = 200;

/** The query trimmed, runs of space made one, case folded and cut to MAX_QUERY: what is matched. */
function normalise(query: string): string {
  return fold(query.trim().replace(/\s+/g, ' ')).slice(0, MAX_QUERY).trimEnd();
}

// By code unit, as the text is indexed: a letter outside the BMP is two, matched one by one.
function lettersOf(normalised: string): Letter[] {
  const letters: Letter[] = [];
  let afterSpace = false;
  for (let i = 0; i < normalised.length; i++) {
    const ch = normalised[i]!;
    if (ch === ' ') {
      afterSpace = true;
      continue;
    }
    letters.push({ ch, afterSpace });
    afterSpace = false;
  }
  return letters;
}

/**
 * How `query` matches `text`, or null when it does not: the text holds the query's letters in
 * order, case ignored. An empty query (or spaces alone) matches every text, as a prefix, at no
 * position. A query longer than 200 code units is matched by its first 200. Time and memory grow
 * as the query's length times the text's, whatever the two hold.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = normalise(query);
  if (q === '') return { tier: 'prefix', positions: [] };
  // The text folded once, a code unit at a time, for the three tests to share.
  const chars = Array.from({ length: text.length }, (_, j) => fold(text[j]!));
  const letters = lettersOf(q);
  // The loosest test first, and the cheapest: a text without the letters in order matches none
  // of the three, and most of the commands in a palette are such texts for any query typed.
  const loose = subsequenceMatch(letters, chars);
  if (!loose) return null;
  const prefix = prefixMatch(q, text, chars);
  if (prefix) return { tier: 'prefix', positions: prefix };
  const word = wordMatch(letters, text, chars);
  if (word) return { tier: 'word', positions: word };
  return { tier: 'subsequence', positions: loose };
}

// Character by character rather than text.toLowerCase().startsWith(q): folding a whole text can
// change its length (İ folds to two code units), and the positions are indices into the text as
// given. A space in the query matches any white space in the text.
function prefixMatch(q: string, text: string, chars: readonly string[]): number[] | null {
  if (text.length < q.length) return null;
  const positions: number[] = [];
  for (let i = 0; i < q.length; i++) {
    if (q[i] === ' ') {
      if (!/\s/.test(text[i]!)) return null;
      continue;
    }
    if (chars[i] !== q[i]) return null;
    positions.push(i);
  }
  return positions;
}

// The first letter begins a word; each next one runs on from the letter before it or begins a
// word itself, and after a space in the query it must begin one. The first place that works
// for a letter can strand the ones after it (Show's S for "se" in "Show Search", with no word
// starting with e after it), so which places can lead to a whole match is worked out first,
// from the last letter back, and the match is then read off from the front, each letter at the
// first place that can. Two tables of letters × text cells, each filled once: no search goes
// back over a place, however many word starts the text has, and nothing recurses.
function wordMatch(letters: Letter[], text: string, chars: readonly string[]): number[] | null {
  const k = letters.length;
  const n = text.length;
  if (k > n) return null;
  const width = n + 1;
  const starts = Uint8Array.from({ length: n }, (_, j) => (isWordStart(text, j) ? 1 : 0));
  // can[i·width + j]: letter i at j, and every letter after it placed after j.
  // later[i·width + j]: letter i can go at a word start at j or after, so it can follow any
  // letter placed before j. Column n is the end of the text, where neither can be.
  const can = new Uint8Array(k * width);
  const later = new Uint8Array(k * width);
  for (let i = k - 1; i >= 0; i--) {
    const row = i * width;
    const next = (i + 1) * width;
    const runOnAllowed = i + 1 < k && !letters[i + 1]!.afterSpace;
    for (let j = n - 1; j >= 0; j--) {
      let ok = chars[j] === letters[i]!.ch;
      if (ok && i + 1 < k) ok = (runOnAllowed && can[next + j + 1] === 1) || later[next + j + 1] === 1;
      can[row + j] = ok ? 1 : 0;
      later[row + j] = (ok && starts[j] === 1) || later[row + j + 1] === 1 ? 1 : 0;
    }
  }
  if (later[0] !== 1) return null;
  const positions: number[] = [];
  let prev = -1;
  for (let i = 0; i < k; i++) {
    const row = i * width;
    let j = prev + 1;
    // Running on is the earliest place there is; failing that, the first word start that can.
    // The tables say one is there; the bound only keeps a mistake in them from looping.
    if (!(i > 0 && !letters[i]!.afterSpace && can[row + j] === 1)) {
      while (j < n && !(starts[j] === 1 && can[row + j] === 1)) j++;
      if (j === n) return null;
    }
    positions.push(j);
    prev = j;
  }
  return positions;
}

// Each letter at the first place after the last one: if the letters are in the text in order at
// all, this finds them, and at the earliest start.
function subsequenceMatch(letters: Letter[], chars: readonly string[]): number[] | null {
  const positions: number[] = [];
  let j = 0;
  for (const { ch } of letters) {
    while (j < chars.length && chars[j] !== ch) j++;
    if (j === chars.length) return null;
    positions.push(j++);
  }
  return positions;
}

/**
 * The commands `query` finds, in the order the palette lists them. For an empty query, every
 * command: those in `recent` first, in its order, then the rest in the order given. Otherwise the
 * commands whose label matches, strongest match first (prefix, then word, then subsequence), then
 * those whose category begins with the query or whose words it begins; within each, those in
 * `recent` first, then the earlier match, then the order given.
 *
 * `recent` is ids, latest first; an id no command has is passed over.
 */
export function rankCommands<T extends RankItem>(items: readonly T[], query: string, recent: readonly string[] = []): Ranked<T>[] {
  const recentRank = new Map<string, number>();
  recent.forEach((id, at) => {
    if (!recentRank.has(id)) recentRank.set(id, at);
  });
  const found: { ranked: Ranked<T>; tier: number; recent: number; first: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = fuzzyMatch(query, item.label);
    const category = label ? null : item.category ? fuzzyMatch(query, item.category) : null;
    if (!label && (!category || category.tier === 'subsequence')) return;
    found.push({
      ranked: { item, positions: label ? label.positions : [] },
      tier: label ? TIER_RANK[label.tier] : CATEGORY_RANK,
      recent: recentRank.get(item.id) ?? Number.POSITIVE_INFINITY,
      first: label?.positions[0] ?? 0,
      index,
    });
  });
  found.sort((a, b) => a.tier - b.tier || compare(a.recent, b.recent) || a.first - b.first || a.index - b.index);
  return found.map((f) => f.ranked);
}

// Infinity - Infinity is NaN, which sort reads as "equal" only by luck of the engine.
function compare(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
