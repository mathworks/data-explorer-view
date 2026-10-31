// Copyright 2026 The MathWorks, Inc.
//
// The page's TextStore (hooks.ts): a JSON dictionary's text with an undo stack of its own, behaving
// as a VS Code TextDocument behaves where the JSON engine's rules depend on it. An edit lands, and
// is heard, a turn after it is asked for and before its promise resolves; until then the text and
// its version are what they were, and an edit asked for over a text that moved meanwhile is
// refused. Every change is heard, the store's own undo and redo included (with their reason), and
// `dirty`, read while a change is heard, is still what it was before it: a change that moved it is
// followed by one with no replacements, read with the new value, as VS Code reports a document's
// dirty state. A save that turns it clean is heard the same way, and on `onSave`.
//
// Where it is the page's own, and not a TextDocument:
// - A reload (`reset`) is one replacement of the characters that differ, and empties the undo
//   stack, as the page's MAT-file and compressed dictionary documents do. VS Code's is an edit over
//   whole lines, which Undo takes back. A change on an entry's boundary can then be repainted
//   narrowly here and wide there, or the other way round; the rows painted are the same.
// - Saves can land in any order, where VS Code runs a document's saves one at a time. A save of a
//   text the store has moved on from (one that landed late, over a newer one) leaves it dirty until
//   the next save, whatever undo does, even back to the very text that was written: the file holds
//   an older text than the store's, and which one is not tracked. That errs on the side of a save.
// - A listener that throws is reported (`report`: the host's notice, or the console), as VS Code's
//   emitter logs it; never thrown again, which a Node or Electron host would take for a crash.
import { minimalReplacement } from 'data-explorer-core';
/**
 * A store of `text`, as read from its file: clean, at version 1. A listener's throw goes to
 * `report` (by default the console).
 */
export function createTextStore(text, report = (err) => console.error(err)) {
    let current = text;
    let version = 1;
    const undoable = [];
    const redoable = [];
    // The undo stack's height when the text was last the file's, or null once that state is gone
    // (an edit made over an undone save, or a save of a text the store had moved on from).
    let savedAt = 0;
    // What `dirty` reads: the state as of the last change heard (see the header).
    let reported = false;
    const changeListeners = new Set();
    const saveListeners = new Set();
    // Changes are heard one at a time, in the order they landed.
    let queue = Promise.resolve();
    const actualDirty = () => savedAt !== undoable.length;
    // Each listener on its own terms, as VS Code's emitter calls them: one that throws costs the others
    // nothing, nor the change its landing (its dirty state, its edit's answer), and its throw is
    // reported, as the emitter logs it.
    const each = (listeners, ...args) => {
        for (const listener of [...listeners]) {
            try {
                listener(...args);
            }
            catch (err) {
                try {
                    report(err);
                }
                catch {
                    // A report that fails has nowhere left to go.
                }
            }
        }
    };
    const hear = (change) => each(changeListeners, change);
    // Tell `dirty`'s change, if the last change moved it.
    const settleDirty = () => {
        const dirty = actualDirty();
        if (dirty === reported)
            return;
        reported = dirty;
        hear({ changes: [] });
    };
    // Apply `patches` (in the text as it stands, from the start forwards) and answer them as a step.
    const replace = (patches, label) => {
        const step = { label, patches: [] };
        let out = '';
        let at = 0;
        for (const p of patches) {
            out += current.slice(at, p.offset) + p.text;
            step.patches.push({ ...p, replaced: current.slice(p.offset, p.offset + p.length) });
            at = p.offset + p.length;
        }
        current = out + current.slice(at);
        version++;
        return step;
    };
    // A change as a TextDocument reports it: each replacement in the text before it, from the end.
    const asChanges = (patches) => [...patches].reverse().map((p) => ({ rangeOffset: p.offset, rangeLength: p.length, text: p.text }));
    // The step's inverse, in the text after it, from the start forwards.
    const inverse = (step) => {
        let shift = 0;
        return step.patches.map((p) => {
            const out = { offset: p.offset + shift, length: p.text.length, text: p.replaced };
            shift += p.text.length - p.length;
            return out;
        });
    };
    // Run `land` a turn from now, after whatever was asked before it.
    const later = (land) => {
        const next = queue.then(land);
        queue = next.catch(() => { });
        return next;
    };
    return {
        get text() {
            return current;
        },
        get version() {
            return version;
        },
        get dirty() {
            return reported;
        },
        apply(patches, label = 'Edit') {
            const asked = version;
            const ordered = [...patches].sort((a, b) => a.offset - b.offset);
            return later(() => {
                // Refused, as VS Code refuses a WorkspaceEdit: the text moved since the patches were made
                // against it, or two of them overlap. Nothing lands. A patch past the end of the text is
                // refused too, where VS Code would clamp it to the text: no caller makes one.
                if (version !== asked)
                    return false;
                for (let k = 1; k < ordered.length; k++) {
                    if (ordered[k].offset < ordered[k - 1].offset + ordered[k - 1].length)
                        return false;
                }
                if (ordered.some((p) => p.offset < 0 || p.offset + p.length > current.length))
                    return false;
                const step = replace(ordered, label);
                undoable.push(step);
                redoable.length = 0;
                if (savedAt !== null && savedAt > undoable.length - 1)
                    savedAt = null;
                hear({ changes: asChanges(ordered) });
                settleDirty();
                return true;
            });
        },
        undo() {
            void later(() => {
                const step = undoable.pop();
                if (!step)
                    return;
                const back = inverse(step);
                replace(back, step.label);
                redoable.push(step);
                hear({ changes: asChanges(back), reason: 'undo' });
                settleDirty();
            });
        },
        redo() {
            void later(() => {
                const step = redoable.pop();
                if (!step)
                    return;
                replace(step.patches, step.label);
                undoable.push(step);
                hear({ changes: asChanges(step.patches), reason: 'redo' });
                settleDirty();
            });
        },
        onChange(listener) {
            changeListeners.add(listener);
            return () => void changeListeners.delete(listener);
        },
        onSave(listener) {
            saveListeners.add(listener);
            return () => void saveListeners.delete(listener);
        },
        saved(at) {
            // A save of a text the store has moved on from: the file is older than the text, and no state
            // of the undo stack is known to be it any longer.
            if (at !== version) {
                savedAt = null;
                settleDirty();
                return;
            }
            savedAt = undoable.length;
            settleDirty();
            each(saveListeners);
        },
        diverged() {
            savedAt = null;
            settleDirty();
        },
        reset(text) {
            return later(() => {
                // One replacement, of what differs (as VS Code's reload of a document reports one), or none
                // at all for the text the store already holds: its dirty state alone may move.
                const changes = text === current ? [] : [minimalReplacement(current, text)];
                if (changes.length > 0)
                    replace(changes, 'Reload');
                undoable.length = 0;
                redoable.length = 0;
                savedAt = 0;
                if (changes.length > 0)
                    hear({ changes: asChanges(changes) });
                settleDirty();
            });
        },
    };
}
