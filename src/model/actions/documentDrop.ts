// Copyright 2026 The MathWorks, Inc.
//
// Where a drop onto a document AS A WHOLE lands. A table's rows are each in a section, so a drop on
// one of them lands in that row's section (dropDecision, over the table's section rules). An app's
// list of its open files (the app shell's Explorer) has a row for the file itself too, and a drop
// there has to land in one of the file's sections: this says which, by the rule the prototype's
// paste into a file had.
//
//   - A document that is ONE target (a MAT-file's whole-file rule) takes it there.
//   - Else the section every dragged entry came from, where the document has one of that name and
//     it takes them (or the drop is the no-op of a move back into it): a configuration set goes
//     among the sets, and a move onto the file it came from does nothing, as a drop on its own
//     section's row does nothing.
//   - Else the first of its sections that takes them all.
//   - Else the refusal of that own section, or of the first, which says why.
//
// Each section is asked exactly as a drop on its heading asks it (dropDecision, with the same drag
// and the same rule), so the file's row never invites a drop that the section's row would refuse.
// DOM-free.
import { dropDecision, type DragMode, type DragSource, type DropDecision } from './dropDecision.js';
import { WHOLE_FILE_SECTION, type SectionRule } from './sectionRules.js';

/** Where a drop onto a whole document lands, and what it would do there. */
export interface DocumentDrop {
  /** The section's name, as its rule spells it: WHOLE_FILE_SECTION ('') for a document that is one target. */
  sectionName: string;
  /** What the drop would do there, as a drop on that section's heading is predicted. */
  decision: DropDecision;
}

/**
 * Where the drag `source`, let go over the document `docUri` as a whole in `mode`, lands among the
 * sections its `rules` describe, and what it would do there; null for a document with no rule, which
 * takes no drop anywhere (one that may not be edited).
 */
export function documentDrop(source: DragSource, docUri: string, rules: readonly SectionRule[], mode: DragMode): DocumentDrop | null {
  if (rules.length === 0) return null;
  const at = (rule: SectionRule): DocumentDrop => ({
    sectionName: rule.sectionName,
    decision: dropDecision(
      source,
      { docUri, sectionName: rule.sectionName, sectionLabel: rule.sectionLabel, isDerived: rule.isDerived, allowedTypes: rule.allowedTypes },
      mode,
    ),
  });
  const whole = rules.find((r) => r.sectionName === WHOLE_FILE_SECTION);
  if (whole) return at(whole);
  // The section every item came from, by name: one only where all of them name the same one.
  const items = source.items ?? [];
  const named = items[0]?.sectionName;
  const ownRule = typeof named === 'string' && items.every((it) => it.sectionName === named) ? rules.find((r) => r.sectionName === named) : undefined;
  const own = ownRule ? at(ownRule) : undefined;
  if (own && (own.decision.canDrop || own.decision.noop)) return own;
  const taking = rules.filter((r) => r !== ownRule).map(at).find((d) => d.decision.canDrop);
  return taking ?? own ?? at(rules[0]!);
}
