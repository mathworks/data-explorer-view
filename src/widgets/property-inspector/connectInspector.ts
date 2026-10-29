// Copyright 2026 The MathWorks, Inc.
//
// A property inspector that follows a feed of pages: a connected table's handle (its selection,
// inspected) or the pages a host sends (inspectorFeed). It shows each page, says when there is
// nothing to show, opens the variable editor on its Value row's matrix glyph and fills it, and
// hands a clicked cross-reference to the app. The feed can change (follow()): one inspector beside
// several tables shows the active one's.
//
// The VS Code extension's inspector webview (its pi-main.ts) with the extension taken out: the
// same rules, so that the extension, which uses this over its own channel, shows its inspector as
// it did.
import { defineVariableEditor, type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import type { InspectorFeed, InspectorView } from '../../model/source/tableSource.js';
import type { DexPropertyInspector } from './dex-property-inspector.js';

/** How connectInspector wires an inspector. */
export interface ConnectInspectorOptions {
  /**
   * The variable editor the Value row's matrix glyph opens. Default: the followed feed's own when
   * it is a table's handle (one editor for the table and its inspector), else one connectInspector
   * makes, in `<body>`, as it first follows such a feed, and takes away on dispose().
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
   * Hear a clicked cross-reference (`dex-property-navigate`'s target), until the returned function
   * is called: a row of a document, to open.
   */
  on(type: 'navigate', listener: (target: string) => void): () => void;
  /**
   * Follow another feed, with the same options and listeners: for one inspector beside several
   * tables, the active table's handle. The inspector empties (its `empty` state) and then shows
   * that feed's pages, from its first (a table's handle sends its selection's page at once).
   * `null` follows none: the empty state, until a feed is followed again. A grid the inspector
   * opened closes; one the table beside it opened in a shared editor stays open. The feed it
   * already follows changes nothing.
   */
  follow(feed: InspectorFeed | null): void;
  /** Stop: the inspector keeps what it shows and hears nothing more. */
  dispose(): void;
}

/**
 * Wire `inspector` to `feed`: show every page it sends, and answer what the inspector asks. A
 * `null` feed starts it empty, following none until `follow()` gives it one.
 */
export function connectInspector(
  inspector: DexPropertyInspector,
  feed: InspectorFeed | null,
  options: ConnectInspectorOptions = {},
): InspectorHandle {
  // A table's handle has an editor of its own (TableHandle.variableEditor): share it. The one made
  // here is made when a feed without one is first followed.
  let made: DexVariableEditor | undefined;
  const editorFor = (next: InspectorFeed): DexVariableEditor => {
    const shared = (next as { variableEditor?: DexVariableEditor }).variableEditor;
    const editor = options.variableEditor ?? (typeof shared?.show === 'function' ? shared : undefined);
    if (editor) return editor;
    if (!made) {
      defineVariableEditor();
      made = document.createElement('dex-variable-editor');
      document.body.appendChild(made);
    }
    return made;
  };
  let following = feed;
  let variableEditor = feed ? editorFor(feed) : undefined;
  const navigate = new Set<(target: string) => void>();
  // Whether the editor is open on this inspector's glyph: a new page closes only that, not a grid
  // the table beside it opened in the same editor.
  let openedHere = false;
  let disposed = false;

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
    const editor = variableEditor;
    if (!detail?.matrix || !detail.anchorEl || !following || !editor) return;
    const nodeId = detail.matrix.nodeId;
    if (typeof nodeId !== 'string' || nodeId === '') return;
    editor.show(detail.anchorEl, detail.matrix);
    openedHere = true;
    void following.matrix(nodeId).then((page) => void editor.deliver(page), () => {});
  };
  // A cross-reference: its row is in a table, which is for whoever opens documents.
  const onNavigate = (e: HTMLElementEventMap['dex-property-navigate']): void => {
    const target = e.detail?.sourceId;
    if (typeof target === 'string' && target !== '') for (const listener of [...navigate]) listener(target);
  };
  inspector.addEventListener('dex-matrix-open', onOpen);
  inspector.addEventListener('dex-property-navigate', onNavigate);

  const show = (page: InspectorView): void => {
    // Each page replaces every row a grid opened from here was anchored to.
    if (openedHere) variableEditor?.close();
    openedHere = false;
    const groups = Array.isArray(page.groups) ? page.groups : [];
    inspector.groups = groups;
    setEmpty(groups.length === 0);
  };

  setEmpty(true);
  let stop = feed ? feed.onPage(show) : () => {};

  return {
    on(_type, listener) {
      navigate.add(listener);
      return () => void navigate.delete(listener);
    },
    follow(next) {
      if (disposed || next === following) return;
      stop();
      // The rows shown, and a grid opened on one of them, are the last feed's.
      if (openedHere) variableEditor?.close();
      openedHere = false;
      following = next;
      if (next) variableEditor = editorFor(next);
      inspector.groups = [];
      setEmpty(true);
      stop = next ? next.onPage(show) : () => {};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      inspector.removeEventListener('dex-matrix-open', onOpen);
      inspector.removeEventListener('dex-property-navigate', onNavigate);
      navigate.clear();
      made?.remove();
    },
  };
}
