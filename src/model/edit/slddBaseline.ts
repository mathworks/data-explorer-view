// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/slddBaseline.ts at c73da3c (its captureBaseline,
// computeModified, isEntryModified and clearBaseline). With the baseline held by the document's
// engine rather than in a map keyed by uri at module level. The extension keeps its own copy until
// its editors move onto view's engines; keep the two alike (view's CI reports a vscode commit to
// that file).
//
// A dictionary's Status column: entry name -> canonical serialized JSON, as the file on disk holds
// it. "Modified" is a diff of the model against that.

// Stored when an entry fails to serialize, so a serialize failure counts as "different" rather
// than crashing the diff. The NUL is written as an ESCAPE, never a raw byte: a literal NUL makes
// git classify this source as binary.
const SERIALIZE_ERROR = '\u0000error';

// One entry's canonical JSON, or the sentinel if it will not serialize.
//
// The sentinel means "this entry cannot be written as it stands", and is compared like any other
// string: an entry that fails on one side only reads as Modified, and one that fails at the
// baseline AND now reads as unmodified, because two equal sentinels say nothing about two values.
function entryJson(entry: any): string {
  try {
    return JSON.stringify(entry.serialize());
  } catch {
    return SERIALIZE_ERROR;
  }
}

// THE rule for "is this entry modified": its canonical JSON differs from the baseline's, or the
// baseline has never heard of it (a newly added entry). One rule for the whole-model diff and the
// single-entry question, which the two repaint paths ask: a divergence would be a "Modified" dot
// that appears or clears depending on which repaint the user happened to trigger.
function differsFromBaseline(baseline: Map<string, string>, name: string, json: string): boolean {
  return !baseline.has(name) || baseline.get(name) !== json;
}

// Walk model.children (sections) -> section.children (entries): entry name -> canonical JSON.
// Both `|| []` stay because a diff pass must not be the thing that throws on a shape change.
function serializeEntries(model: any): Map<string, string> {
  const map = new Map<string, string>();
  const sections = (model && model.children) || [];
  for (const section of sections) {
    const entries = (section && section.children) || [];
    for (const entry of entries) map.set(entry.name, entryJson(entry));
  }
  return map;
}

/** What the file on disk holds, entry by entry, for one document's Status column. */
export class EntryBaseline {
  private baseline: Map<string, string> | undefined;

  /** Capture the model's entries as the last-saved baseline. */
  capture(model: any): void {
    this.baseline = serializeEntries(model);
  }

  /**
   * The names of the entries whose serialization differs from the baseline (or that it has no
   * entry for: newly added). Empty when no baseline was ever captured.
   */
  modified(model: any): Set<string> {
    const result = new Set<string>();
    const baseline = this.baseline;
    if (!baseline) return result;
    for (const [name, json] of serializeEntries(model)) {
      if (differsFromBaseline(baseline, name, json)) result.add(name);
    }
    return result;
  }

  /**
   * Whether ONE entry differs from the baseline: what an entry-scoped repaint asks, which must not
   * serialize every entry of the dictionary to answer about one. False with no baseline.
   */
  isModified(entry: any): boolean {
    const baseline = this.baseline;
    if (!baseline) return false;
    return differsFromBaseline(baseline, entry.name, entryJson(entry));
  }

  /** Drop the baseline (the last view of the document closed). */
  clear(): void {
    this.baseline = undefined;
  }
}
