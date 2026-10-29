// Copyright 2026 The MathWorks, Inc.
//
// A property inspector that follows a feed of pages: a connected table's handle (its selection,
// inspected) or the pages a host sends (inspectorFeed). It shows each page, says when there is
// nothing to show, opens the variable editor on its Value row's matrix glyph and fills it, and
// hands a clicked cross-reference to the app.
//
// The VS Code extension's inspector webview (its pi-main.ts) with the extension taken out: the
// same rules, so that the extension, which uses this over its own channel, shows its inspector as
// it did.
import { defineVariableEditor, type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import type { InspectorFeed } from '../../model/source/tableSource.js';
import type { DexPropertyInspector } from './dex-property-inspector.js';

/** How connectInspector wires an inspector. */
export interface ConnectInspectorOptions {
  /**
   * The variable editor the Value row's matrix glyph opens. Default: the feed's own when it is a
   * table's handle (one editor for the table and its inspector), else one connectInspector makes,
   * in `<body>`, and takes away on dispose().
   */
  variableEditor?: DexVariableEditor;
  /**
   * What shows while there is nothing to inspect: an element, shown (and the inspector hidden,
   * by `hidden`) while there is nothing; or a function told `true` for nothing and `false` for a
   * page, for a page that hides and shows things its own way. Default: the inspector just shows
   * no rows.
   */
  empty?: HTMLElement | ((empty: boolean) => void);
}

/** A connected inspector: what connectInspector returns. */
export interface InspectorHandle {
  /**
   * Hear a clicked cross-reference (`dex-pi-navigate`'s target), until the returned function is
   * called: a row of a document, to open.
   */
  on(type: 'navigate', listener: (target: string) => void): () => void;
  /** Stop: the inspector keeps what it shows and hears nothing more. */
  dispose(): void;
}

/** Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. */
export function connectInspector(
  inspector: DexPropertyInspector,
  feed: InspectorFeed,
  options: ConnectInspectorOptions = {},
): InspectorHandle {
  // A table's handle has an editor of its own (TableHandle.variableEditor): share it.
  const shared = (feed as { variableEditor?: DexVariableEditor }).variableEditor;
  let editor = options.variableEditor ?? (typeof shared?.show === 'function' ? shared : undefined);
  let madeEditor = false;
  if (!editor) {
    defineVariableEditor();
    editor = document.createElement('dex-variable-editor');
    document.body.appendChild(editor);
    madeEditor = true;
  }
  const variableEditor = editor;
  const navigate = new Set<(target: string) => void>();
  // Whether the editor is open on this inspector's glyph: a new page closes only that, not a grid
  // the table beside it opened in the same editor.
  let openedHere = false;

  const setEmpty = (isEmpty: boolean): void => {
    const empty = options.empty;
    if (typeof empty === 'function') return empty(isEmpty);
    if (empty) {
      empty.hidden = !isEmpty;
      inspector.hidden = isEmpty;
    }
  };

  // The glyph in the Value row: the same editor, opened the same way, as the table's Value cell.
  const onOpen = (e: HTMLElementEventMap['dex-matrix-open']): void => {
    const detail = e.detail as Partial<typeof e.detail> | undefined;
    if (!detail?.matrix || !detail.anchorEl) return;
    const nodeId = detail.matrix.nodeId;
    if (typeof nodeId !== 'string' || nodeId === '') return;
    variableEditor.show(detail.anchorEl, detail.matrix);
    openedHere = true;
    void feed.matrix(nodeId).then((page) => void variableEditor.deliver(page), () => {});
  };
  // A cross-reference: its row is in a table, which is for whoever opens documents.
  const onNavigate = (e: HTMLElementEventMap['dex-pi-navigate']): void => {
    const target = e.detail?.sourceId;
    if (typeof target === 'string' && target !== '') for (const listener of [...navigate]) listener(target);
  };
  inspector.addEventListener('dex-matrix-open', onOpen);
  inspector.addEventListener('dex-pi-navigate', onNavigate);

  setEmpty(true);
  const stop = feed.onPage((page) => {
    // Each page replaces every row a grid opened from here was anchored to.
    if (openedHere) variableEditor.close();
    openedHere = false;
    const groups = Array.isArray(page.groups) ? page.groups : [];
    inspector.groups = groups;
    setEmpty(groups.length === 0);
  });

  return {
    on(_type, listener) {
      navigate.add(listener);
      return () => void navigate.delete(listener);
    },
    dispose() {
      stop();
      inspector.removeEventListener('dex-matrix-open', onOpen);
      inspector.removeEventListener('dex-pi-navigate', onNavigate);
      navigate.clear();
      if (madeEditor) variableEditor.remove();
    },
  };
}
