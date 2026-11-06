// Copyright 2026 The MathWorks, Inc.
//
// Whether an element takes typing: the one rule for whose a key is. A chord pressed in a field that
// takes text (the table's search box, a cell editor, a column filter, the folder's search) is the
// field's, Cmd/Ctrl+Z its own typing to undo; pressed anywhere else, it is a gesture the table or the
// app shell answers. The table's chords (isTypingInField, editingWire.ts) and the shell's (its key
// listener and its Undo command, connect/) both ask this, so the two never disagree about a field.
//
// By tag name and input type rather than by class: an element of another document (an iframe's)
// is no instance of this window's HTMLInputElement, and is a field all the same.

// The inputs that take no text: a press on one is a gesture, as on a button.
const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color']);

/**
 * Whether `el` takes typing: a text input (any input but a checkbox, a radio and the ones that are
 * buttons or pickers), a textarea, a select, whose letters pick an option, or an editable element.
 */
export function isTextField(el: Element | null | undefined): boolean {
  if (!el) return false;
  switch (el.tagName) {
    case 'INPUT':
      return !NOT_TEXT.has(((el as HTMLInputElement).type || 'text').toLowerCase());
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    default:
      return !!(el as HTMLElement).isContentEditable;
  }
}
