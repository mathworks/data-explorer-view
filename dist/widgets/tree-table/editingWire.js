import { dropDecision } from '../../model/actions/dropDecision.js';
import { sectionRowIdOf } from '../../model/actions/operands.js';
import { sectionNameFromRowId, WHOLE_FILE_SECTION } from '../../model/ids/sectionRowId.js';
import { buildContextMenuItems, resolveShortcutAction, shouldOpenCellEditor, shouldShowContextMenu, } from './menuItems.js';
// Whether a value read off a change is an object — the one shape every list element below
// has to be before a field of it is read.
function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
// The well-formed rules of a `sectionRules` change. A rule with no section name answers no
// row; an allow-list that is not a list is no restriction, as an absent one is.
function wellFormedRules(rules) {
    if (!Array.isArray(rules))
        return [];
    return rules
        .filter((r) => isRecord(r) && typeof r.sectionName === 'string')
        .map((r) => (Array.isArray(r.allowedTypes) ? r : { ...r, allowedTypes: [] }));
}
// Whether this keystroke is TEXT ENTRY rather than a gesture on the grid: the search
// box, the column-filter popup, the inline cell editor. Read off the COMPOSED PATH,
// because every one of those fields lives inside the table's shadow tree and `e.target`
// at this listener is the host element, which tells us nothing about where the caret is.
//
// The rule lives here once because both capture guards below need it and they must not
// disagree: a key that a field owns is not the table's to claim. Exported for an app's own chords,
// so that they leave the same keys to the same fields.
/** Whether `ev` is typing in a field of the table's (its search box, a column filter, a cell editor) rather than a gesture on the grid. */
export function isTypingInField(ev) {
    const active = ev.composedPath?.()[0] ?? ev.target;
    const tag = active?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!active?.isContentEditable;
}
// The Undo and Redo chords, which the table answers only where its options ask (undoChords): Cmd/Ctrl+Z
// and Shift+Cmd/Ctrl+Z, and Ctrl+Y off macOS. Their own resolver, so resolveShortcutAction (the chords
// every editing table answers) is untouched.
function undoChordOf(ev) {
    if (ev.altKey)
        return null;
    const key = ev.key.toLowerCase();
    if ((ev.metaKey || ev.ctrlKey) && key === 'z')
        return ev.shiftKey ? 'redo' : 'undo';
    if (ev.ctrlKey && !ev.metaKey && !ev.shiftKey && key === 'y' && !/Mac|iPhone|iPad/.test(navigator.platform ?? ''))
        return 'redo';
    return null;
}
// Copy/Cut/Delete carry the selection (the host resolves it), the rest carry the one row they
// act on.
const SELECTION_ACTIONS = new Set(['copy', 'cut', 'delete']);
/** The editing menu's own items, which a choice of is a command rather than the app's action. */
const EDITING_ACTIONS = new Set(['undo', 'redo', 'copy', 'cut', 'delete', 'paste', 'addChild', 'locateInText']);
/** Wire the editing half: the listeners go on through `host.listen`, the state stays in here. */
export function wireEditing(host) {
    const { table, source, errorDialog } = host;
    // Menu state cached from the source's changes so the menu builds synchronously on
    // right-click (no round-trip): whether the doc is editable, and clipboard state.
    let editable = false;
    let clipboardState = { canPaste: false, mode: null, items: [] };
    // This document's section drop-rules. Together with the broadcast drag descriptor they let
    // the predictor run dropDecision entirely client-side on dragover (no host round-trip).
    let sectionRulesList = [];
    // The in-flight drag the host broadcast (null when no drag is active). Because a drag can
    // originate in another table, this — not local dataTransfer — is the authoritative source
    // of what is being dragged.
    let dragDescriptor = null;
    const hasTextView = () => {
        const available = host.textView?.available;
        return typeof available === 'function' ? !!available(host.view()) : !!available;
    };
    // The rule of a document that is ONE target: a MAT-file has no section layer, so its host
    // posts a single rule for the whole file, under WHOLE_FILE_SECTION ('', the spelling host and
    // table share — sectionRules.wholeFileRules). No dictionary posts one, so for every
    // dictionary this is null and nothing below changes.
    const wholeFileRule = () => sectionRulesList.find((r) => r.sectionName === WHOLE_FILE_SECTION) ?? null;
    // Resolve the section a row belongs to, at any depth — the rule a paste into it or a drop
    // on it has to satisfy. A row with no section ancestor — a MAT-file's variable, or anything
    // under one — and no row at all (null, or '' from a drop on the empty body) resolve to the
    // whole-file rule, which is the document's one target when it has one, and null when it
    // does not.
    const sectionRuleForRow = (rowId) => {
        const sectionRowId = rowId ? sectionRowIdOf(rowId, host.rowsNow()) : null;
        if (sectionRowId == null)
            return wholeFileRule();
        const sectionName = sectionNameFromRowId(sectionRowId);
        if (sectionName == null)
            return null;
        return sectionRulesList.find((r) => r.sectionName === sectionName) ?? null;
    };
    // The menu for the CURRENT selection, anchored at `anchorRowId` (the right-clicked row,
    // or the primary selection for a keyboard chord). Both triggers go through here so they
    // cannot disagree — the keyboard does not re-derive enablement, it builds this and reads
    // the item.
    const menuFor = (anchorRowId, selection = host.selectedRowIds()) => {
        const rule = sectionRuleForRow(anchorRowId);
        return buildContextMenuItems({
            rows: host.rowsNow(),
            selectedRowIds: selection,
            anchorRowId,
            clipboard: clipboardState,
            editable,
            hasTextView: hasTextView(),
            // Paste's allow-check needs the target section's rules; without them the item is
            // offered only as far as "the clipboard is non-empty" can justify. The section's name
            // and this document's uri are what tell a cut pasted back where it came from.
            pasteTarget: rule
                ? { sectionName: rule.sectionName, sectionLabel: rule.sectionLabel, isDerived: rule.isDerived, allowedTypes: rule.allowedTypes }
                : null,
            docUri: host.docUri(),
        });
    };
    // An action, as the source's command with the operand shape that action takes.
    const act = (actionId, anchorRowId) => {
        if (!EDITING_ACTIONS.has(actionId))
            return false;
        if (actionId === 'undo' || actionId === 'redo') {
            source?.[actionId]();
            return true;
        }
        if (SELECTION_ACTIONS.has(actionId)) {
            source?.[actionId](host.selectedRowIds());
            return true;
        }
        if (!anchorRowId) {
            // A paste anchored at no row targets the document itself; '' is how the source is told
            // so. Only a one-target document can be that target (wholeFileRule). Its menu is the
            // only one that offers it, and this says so again here rather than trusting every
            // path that reaches act to have asked: a dictionary has no section to put a row-less
            // paste in.
            if (actionId === 'paste' && wholeFileRule())
                source?.paste('');
            return true;
        }
        if (actionId === 'locateInText')
            host.textView?.locate(anchorRowId);
        else
            source?.[actionId](anchorRowId);
        return true;
    };
    // The predictor injected into the table: given the row under the cursor ('' for the
    // empty body) and the drag mode, run the pure dropDecision against the broadcast drag
    // descriptor and this document's section rules. Returns null when there's no active drag or
    // the target section can't be resolved, which the table reads as a refusal: a drag the host
    // never announced (a file from the OS, text from another app) is not one this table takes.
    const predictDrop = (targetRowId, mode) => {
        if (!dragDescriptor)
            return null;
        const rule = sectionRuleForRow(targetRowId);
        if (!rule)
            return null;
        const target = {
            docUri: host.docUri(),
            sectionName: rule.sectionName,
            sectionLabel: rule.sectionLabel,
            isDerived: rule.isDerived,
            allowedTypes: rule.allowedTypes,
        };
        // The descriptor IS a DragSource (the source document, and each item's own section).
        return dropDecision(dragDescriptor, target, mode);
    };
    // Read-only documents never open the inline cell editor. The table opens it on double-click
    // and on Enter, gating only on per-row flags (which stay intact for cell coloring). Intercept
    // both gestures in the CAPTURE phase — before they reach the table's shadow-internal
    // handlers — and swallow them when the document is read-only. This is document-level
    // readonly, distinct from the row-level coloring flag.
    host.listen('dblclick', (e) => {
        if (!shouldOpenCellEditor(editable))
            e.stopPropagation();
    }, true);
    host.listen('keydown', (e) => {
        const ev = e;
        // Only Enter on the GRID is the cell-editor gesture this gate exists for. Enter in a
        // FIELD belongs to that field: the search box commits a search with it and the
        // column-filter popup applies with it.
        if (ev.key === 'Enter' && !isTypingInField(ev) && !shouldOpenCellEditor(editable)) {
            e.stopPropagation();
        }
    }, true);
    // Cmd/Ctrl+L: show the selected row's text in the plain-text view — the keyboard equivalent
    // of the Location in Text menu item, and gated by that item.
    host.listen('keydown', (e) => {
        const ev = e;
        if ((ev.key === 'l' || ev.key === 'L') && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey) {
            const anchorRowId = host.selectedRowIds()[0] ?? null;
            if (!anchorRowId)
                return;
            const item = menuFor(anchorRowId).find((i) => i.id === 'locateInText');
            if (!item || item.disabled)
                return;
            ev.preventDefault();
            ev.stopPropagation();
            act('locateInText', anchorRowId);
        }
    }, true);
    // Cut/Copy/Paste/Delete keyboard shortcuts — the keyboard half of the menu's actions (whose
    // labels advertise these chords). Enablement is not re-derived here: the menu for the current
    // selection IS the authority, so the chord does exactly what clicking that item would, on
    // exactly the same rows. Capture phase, so it runs before the table's own key handling;
    // skipped while a cell editor or the filter input is focused (there the chord is text editing).
    host.listen('keydown', (e) => {
        if (!editable)
            return;
        const ev = e;
        const action = resolveShortcutAction(ev);
        if (!action)
            return;
        // While typing in the inline cell editor, the search box or the column filter, C/X/V
        // and Delete/Backspace are text editing — let the field handle them natively.
        if (isTypingInField(ev))
            return;
        // The primary selection anchors the gesture, the same way the right-clicked row does:
        // it is what a paste targets the section of. With nothing selected the anchor is no row,
        // and the menu for that offers only Paste — enabled only where the document is one
        // target (an empty MAT-file pastes into the file), so a dictionary's Cmd+V with nothing
        // selected still does nothing.
        const anchorRowId = host.selectedRowIds()[0] ?? null;
        // Absent (a section selection offers no Copy at all) or disabled → do nothing, and let
        // the key through rather than swallowing it.
        const item = menuFor(anchorRowId).find((i) => i.id === action);
        if (!item || item.disabled)
            return;
        ev.preventDefault();
        ev.stopPropagation();
        act(action, anchorRowId);
    }, true);
    // Undo and Redo, as their menu items do, where the document may be edited (their items are
    // disabled where it may not).
    const history = (action) => {
        if (!editable)
            return false;
        act(action, null);
        return true;
    };
    // The Undo and Redo chords, only where the table is asked to answer them: under the VS Code
    // extension its own keybindings undo, and a table that answered too would undo twice. Outside the
    // fields, as Copy/Cut/Paste are.
    if (host.undoChords) {
        host.listen('keydown', (e) => {
            const ev = e;
            const action = undoChordOf(ev);
            if (!action || isTypingInField(ev) || !editable)
                return;
            ev.preventDefault();
            ev.stopPropagation();
            history(action);
        }, true);
    }
    // The drop predictor, so the table can render live cursor + tooltip feedback on dragover.
    table.dropPredictor = predictDrop;
    // The drag lifecycle. On drag start the host snapshots the dragged rows into its drag register
    // and broadcasts the descriptor; on end it clears and rebroadcasts; on drop it completes the
    // move or copy as a paste (and a source delete). Gated on an editable document, the fact
    // table.rowDrag is set from, so a read-only document never starts or takes one.
    host.listen('dex-row-drag-start', (e) => {
        if (!editable)
            return;
        const rowIds = e.detail?.rowIds ?? [];
        source?.dragStart(rowIds);
    });
    host.listen('dex-row-drag-end', () => {
        source?.dragEnd();
    });
    host.listen('dex-row-drop', (e) => {
        if (!editable)
            return;
        const detail = e.detail;
        // '' is a drop on the empty body, which the predictor allows only into a one-target
        // document — the drag twin of a paste anchored at no row, and refused here on the same
        // terms as that paste (act).
        const rowId = typeof detail?.targetRowId === 'string' ? detail.targetRowId : '';
        if (rowId === '' && !wholeFileRule())
            return;
        source?.drop(rowId, detail.mode);
    });
    // A tile in the Add gallery was clicked: ask for one entry of that class in the section the
    // tile names. Nothing about the current selection is sent, and that is the point — a tile
    // carries its own destination. Gated on `editable` like every other structural gesture; the
    // button does not exist on a read-only document (table.canAdd), so this is the second lock on
    // a door that has no handle.
    host.listen('dex-add-entry', (e) => {
        if (!editable)
            return;
        const detail = e.detail;
        source?.addEntry({ section: detail.section, className: detail.className, rename: !!detail.rename });
    });
    // A Value editor is opening on a summary: ask for the whole text it stands for, which the row
    // does not carry (answered by an `editText` change).
    host.listen('dex-edit-text-request', (e) => {
        if (!editable)
            return;
        const rowId = e.detail?.rowId;
        if (typeof rowId === 'string')
            source?.requestEditText(rowId);
    });
    // A committed cell edit, for the source to write back.
    host.listen('dex-edit-completed', (e) => {
        const detail = e.detail;
        source?.edit({ rowId: detail.rowId, columnId: detail.columnId, oldValue: detail.oldValue, newValue: detail.newValue });
    });
    return {
        painting(view) {
            // A source that takes no edits is a read-only document whatever its view says.
            editable = !!view.editable && source !== null;
            // A row drag is a structural edit, so it needs an editable document.
            table.rowDrag = editable;
            // The `+ Add` button exists only where entries can be created, which is the same
            // condition the context menu is gated on — the editable documents.
            table.canAdd = editable;
            // A MAT-file's gallery offers the classes its host lists, a dictionary's every tile.
            table.addClasses = view.add && Array.isArray(view.add.classes) ? view.add.classes.filter((c) => typeof c === 'string') : null;
            // A document that is read-only now has no drop rule left that is about it. Only then: an
            // editable paint's rules come AFTER it (a host sends sectionRules behind its rows), so
            // wiping them here would leave the table rule-less until the next change.
            if (!editable)
                sectionRulesList = [];
            // NOT the broadcast drag (dragDescriptor): it mirrors the host's drag register, which a
            // repaint does not end. Cleared here, a repaint landing mid-drag would leave this table
            // refusing the rest of that drag.
        },
        change(change) {
            switch (change.kind) {
                case 'sectionRules':
                    if (typeof change.docUri === 'string' && change.docUri)
                        host.setDocUri(change.docUri);
                    sectionRulesList = wellFormedRules(change.rules);
                    return true;
                case 'clipboard': {
                    const s = change.state;
                    clipboardState = {
                        canPaste: !!s.canPaste,
                        mode: s.mode ?? null,
                        items: Array.isArray(s.items) ? s.items.filter(isRecord) : [],
                        // Where the entries came from, when the host says: what lets Paste refuse a cut
                        // pasted back into its own section (menuItems, isNoopMove).
                        sourceDocUri: typeof s.sourceDocUri === 'string' ? s.sourceDocUri : undefined,
                    };
                    return true;
                }
                case 'drag': {
                    // The host broadcasts the in-flight drag (or null when it ends) to every table, so a
                    // drag started in another one predicts correctly here.
                    const d = change.descriptor;
                    dragDescriptor = isRecord(d) && Array.isArray(d.items) ? { ...d, items: d.items.filter(isRecord) } : null;
                    return true;
                }
                case 'select':
                    // Select rows by id (a rename changed one, a paste added several). Applied now if they
                    // are all present, else held until a rebuild brings the rest.
                    host.select(Array.isArray(change.rowIds) ? change.rowIds : []);
                    return true;
                case 'beginRename':
                    // Open the name editor on a just-created entry. Applied now if its row is already
                    // here, else held until the repaint arrives.
                    if (typeof change.rowId === 'string')
                        host.beginRename(change.rowId);
                    return true;
                case 'invalid':
                    // An invalid cell edit: the dialog scoped to this table. The source follows it with a
                    // repaint of the rejected row's entry, so the cell is back to its previous value by
                    // the time the dialog is dismissed.
                    errorDialog.show({
                        title: 'Invalid Value',
                        reason: change.reason,
                        invalidValue: change.invalidValue,
                        validValue: change.previousValue,
                    });
                    return true;
                case 'refused':
                    // A refused Add Child, Delete or Add: the same dialog, titled by the gesture, which
                    // stays until it is closed. A banner would be cleared by the next repaint.
                    errorDialog.show({ title: change.title, reason: change.reason });
                    return true;
                case 'editText':
                    // The whole text of a Value shown as a summary, asked for as its editor opens: the
                    // editor opens on it. None (the value changed under the request): core's reason, where
                    // it gives one.
                    if (typeof change.text === 'string')
                        table.openWholeValueEditor?.(change.rowId, change.text);
                    else if (typeof change.reason === 'string')
                        errorDialog.show({ title: 'Cannot Edit', reason: change.reason });
                    return true;
                default:
                    return false;
            }
        },
        menuAllowed(rowId) {
            // Read-only documents have no menu at all: no cell editor and no right-click actions.
            if (!shouldShowContextMenu(editable))
                return false;
            // A right-click on no row (the space under the rows, or an empty table) is a gesture on
            // the document. Only a one-target document has a menu there — Paste into the file,
            // Undo/Redo — so a dictionary's empty space stays inert.
            return rowId !== null || wholeFileRule() !== null;
        },
        editable: () => editable,
        menuFor,
        act,
        history,
    };
}
