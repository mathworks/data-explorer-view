// Copyright 2026 The MathWorks, Inc.
//
// The Gallery view's wiring: <dex-gallery-panel> shows the Add gallery's tiles for the active file,
// as its table's view says it can take them (TableView.add, addSections: a dictionary's every tile,
// a MAT-file's or a model's own classes, a model's configuration sets beside them), headed with the
// file's name, and greyed for no file or one the page does not edit. A tile pressed adds one entry
// to that file, as the table's own `+ Add` does: through the document's source, its Name open for
// a rename once it is there. connectShell calls refresh() as the active tab or its view changes.

import type { NewEntry, TableView } from '../../../model/source/tableSource.js';
import type { DexGalleryPanel } from '../modules/dex-gallery-panel.js';

/** The file a tile adds to: what the panel shows of it, and the add. */
export interface GalleryTarget {
  /** The file's name, the heading's "Add to …". */
  name: string;
  /** Its table's view, once painted: what the gallery offers. */
  view: TableView | undefined;
  /** Whether the page edits it now: else the tiles are greyed. */
  editable: boolean;
  /** Add one entry to it: the shell commits a cell editor still open first. */
  add(entry: NewEntry): void | Promise<void>;
}

/** Wire `panel` to the active file (`target()`, null for none); refresh() draws it as it is now. */
export function connectGalleryPane(panel: DexGalleryPanel, context: { target(): GalleryTarget | null }): { refresh(): void; dispose(): void } {
  const refresh = (): void => {
    const target = context.target();
    panel.target = target?.name ?? '';
    panel.disabled = !target?.editable;
    panel.classes = target?.view?.add?.classes ?? null;
    panel.sections = target?.view?.addSections ?? null;
  };
  // The panel sends nothing while disabled; the file is asked again, as the press may come after
  // a change the panel was not yet redrawn for.
  const onAdd = (e: CustomEvent<{ className: string; section: string }>): void => {
    const target = context.target();
    if (!target?.editable) return;
    void target.add({ className: e.detail.className, section: e.detail.section, rename: true });
  };
  panel.addEventListener('dex-gallery-add', onAdd);
  refresh();
  return {
    refresh,
    dispose() {
      panel.removeEventListener('dex-gallery-add', onAdd);
    },
  };
}
