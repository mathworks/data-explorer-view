// Copyright 2026 The MathWorks, Inc.
//
// The editing half of view's wire, held to the extension's own declarations: compiled by CI's
// downstream-vscode job inside the extension's checkout (copied to its root, with
// tsconfig.view-wire.json beside it), against the view under test installed there. Each line is one
// message, which must be the extension's both ways round (each assignable to the other) with the
// same keys; one that drifts fails to compile, naming its line.
//
// The modules view copied from the extension (transfer, clipboard, dragState, editorHub, clipMarks,
// slddBaseline, wideRepaint) were held here too, type for type, while the extension kept its own.
// It uses view's now and has deleted its copies, so there is nothing left to hold them to.
//
// Not compiled here: it imports the extension's files, which this repository does not have.
import type * as View from 'data-explorer-view/model';
import type * as Host from 'data-explorer-view/host';
import type * as Ext from './src/common/protocol.js';
import type { EditStackMirror } from './src/host/diskConflict.js';

/** Each assignable to the other, with the same keys. */
type Same<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? [keyof A] extends [keyof B]
      ? [keyof B] extends [keyof A]
        ? true
        : false
      : false
    : false
  : false;
/** `A` can be used where `B` is asked for. */
type Fits<A, B> = [A] extends [B] ? true : false;
/** Compiles only for `true`. */
type Is<T extends true> = T;

// The editing messages, from the table's end.
export type TableToHost = [
  Is<Same<View.EditMessage, Ext.EditMessage>>,
  Is<Same<View.CopyMessage, Ext.CopyMessage>>,
  Is<Same<View.CutMessage, Ext.CutMessage>>,
  Is<Same<View.DeleteMessage, Ext.DeleteMessage>>,
  Is<Same<View.PasteMessage, Ext.PasteMessage>>,
  Is<Same<View.AddChildMessage, Ext.AddChildMessage>>,
  Is<Same<View.AddEntryMessage, Ext.AddEntryMessage>>,
  Is<Same<View.UndoRedoMessage, Ext.UndoRedoMessage>>,
  Is<Same<View.DragStartMessage, Ext.DragStartMessage>>,
  Is<Same<View.DragEndMessage, Ext.DragEndMessage>>,
  Is<Same<View.DropMessage, Ext.DropMessage>>,
  Is<Same<View.RequestEditTextMessage, Ext.RequestEditTextMessage>>,
  // Every one of them is a message the extension's host takes.
  Is<Fits<View.TableEditClientMessage, Ext.TableToHostMessage>>,
];

// The editing messages, from the host.
export type HostToTable = [
  Is<Same<View.SectionRulesMessage, Ext.SectionRulesMessage>>,
  Is<Same<View.ClipboardStateMessage, Ext.ClipboardStateMessage>>,
  Is<Same<View.DragStateMessage, Ext.DragStateMessage>>,
  Is<Same<View.SelectRowsMessage, Ext.SelectRowsMessage>>,
  Is<Same<View.BeginRenameMessage, Ext.BeginRenameMessage>>,
  Is<Same<View.ValidationErrorMessage, Ext.ValidationErrorMessage>>,
  Is<Same<View.RefusedMessage, Ext.RefusedMessage>>,
  Is<Same<View.EditTextMessage, Ext.EditTextMessage>>,
  // Every one of them is a message the extension's table takes.
  Is<Fits<View.TableEditHostMessage, Ext.HostToTableMessage>>,
];

// The hooks the extension's editors will be plugged into: what it has today must fit them.
export type Hooks = [Is<Fits<EditStackMirror, Host.EditIndex>>];
