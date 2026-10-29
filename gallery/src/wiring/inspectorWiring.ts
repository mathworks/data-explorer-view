// Copyright 2026 The MathWorks, Inc.
// The property inspector follows a table's selection: the first selected row's node, found in
// core's session, through view's inspector rules (a section row shows nothing).
//
// Hand wiring, until view connects an inspector to a table itself (see ../../README.md).
import { buildPropertyGroups, findNode, InspectorSelection } from 'data-explorer-view/model';
import type { DexPropertyInspector } from 'data-explorer-view/property-inspector';

export interface InspectorHandle {
  show(uri: string, rowIds: readonly string[]): void;
  clear(): void;
}

/** `empty` is what the page shows instead while there is nothing to inspect. */
export function wireInspector(pi: DexPropertyInspector, empty: HTMLElement): InspectorHandle {
  const paint = (groups: DexPropertyInspector['groups']) => {
    pi.groups = groups;
    pi.hidden = groups.length === 0;
    empty.hidden = groups.length > 0;
  };
  const selection = new InspectorSelection(
    { showNode: (node) => paint(buildPropertyGroups(node)), clear: () => paint([]) },
    findNode,
  );
  paint([]);
  return {
    show: (uri, rowIds) => selection.show(uri, rowIds),
    clear: () => paint([]),
  };
}
