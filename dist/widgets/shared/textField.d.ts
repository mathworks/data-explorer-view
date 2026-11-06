/**
 * Whether `el` takes typing: a text input (any input but a checkbox, a radio and the ones that are
 * buttons or pickers), a textarea, a select, whose letters pick an option, or an editable element.
 */
export declare function isTextField(el: Element | null | undefined): boolean;
/**
 * Whether the focus, inside shadow roots too, is in a field that takes typing: for a command that
 * comes with no key event to read (a menu's or a toolbar's Undo), which is the field's own then.
 */
export declare function focusIsInTextField(doc?: Document): boolean;
