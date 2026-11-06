// Copyright 2026 The MathWorks, Inc.
//
// Whether an element takes typing, for the app shell's chords and its Undo command (connect/): a
// chord pressed in a field that takes text (the folder's search, a table's search box or cell
// editor) is the field's, Cmd/Ctrl+Z its own typing to undo; pressed on anything else, a checkbox
// included, it is the shell's.
//
// The table keeps a wider rule of its own (isTypingInField, editingWire.ts): every input of its
// shadow root is its field, a checkbox too, since a Delete or a Cmd/Ctrl+C on the column menu's
// checkboxes or the Add gallery's Keep open is a key on that control and never a gesture on the
// rows. The shell leaves a table's keys to the table either way.
//
// By tag name and input type rather than by class: an element of another document (an iframe's)
// is no instance of this window's HTMLInputElement, and is a field all the same.
// The inputs that take no text: a press on one is a gesture, as on a button.
const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color']);
/**
 * Whether `el` takes typing: a text input (any input but a checkbox, a radio and the ones that are
 * buttons or pickers), a textarea, a select, whose letters pick an option, or an editable element.
 */
export function isTextField(el) {
    if (!el)
        return false;
    switch (el.tagName) {
        case 'INPUT':
            return !NOT_TEXT.has((el.type || 'text').toLowerCase());
        case 'TEXTAREA':
        case 'SELECT':
            return true;
        default:
            return !!el.isContentEditable;
    }
}
/**
 * Whether the focus, inside shadow roots too, is in a field that takes typing: for a command that
 * comes with no key event to read (a menu's or a toolbar's Undo), which is the field's own then.
 */
export function focusIsInTextField(doc = document) {
    let el = doc.activeElement;
    while (el?.shadowRoot?.activeElement)
        el = el.shadowRoot.activeElement;
    return isTextField(el);
}
