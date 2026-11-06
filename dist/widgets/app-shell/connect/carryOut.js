// Copyright 2026 The MathWorks, Inc.
//
// What each of the shell's document commands does, once connectShell has committed a cell editor
// still open (a toolbar press takes no focus): the editing ones are the active table's own menu
// items (TableHandle.run), the rest the shell's, on the tab active when the command was given. The
// commands that act at once (Settings, About, the palette, a view's) and the field's own Undo are
// connectShell's, before any of this.
import { tableActionOf } from './toolbarItems.js';
const message = (err) => (err instanceof Error ? err.message : String(err));
/** Carry out the command `id` on `tab`, the tab active when it was given. */
export function carryOut(id, tab, on) {
    const action = tableActionOf(id);
    if (action && action !== 'undo' && action !== 'redo') {
        tab?.handle?.run(action);
        return;
    }
    // A host's dialog that could not be shown (a browser's picker refused, SecurityError,
    // NotAllowedError) says why; one the user cancelled (AbortError) is an answer, and says nothing.
    const pickFailed = (what) => (err) => {
        if (!(err instanceof Error && err.name === 'AbortError'))
            on.failed(`Could not open ${what}: ${message(err)}`);
    };
    switch (id) {
        case 'open-file':
            void on.host.pickFiles().then(on.openPaths, pickFailed('a file'));
            break;
        case 'open-folder':
            void on.host.pickFolder?.().catch(pickFailed('a folder'));
            break;
        case 'save':
        case 'save-as':
            if (tab)
                void on.save(tab, id === 'save-as');
            break;
        case 'save-all':
            void on.tabs.items.filter((t) => t.dirty).reduce((prev, t) => prev.then(() => on.save(t)), Promise.resolve());
            break;
        case 'close-tab':
            if (tab)
                on.close(tab);
            break;
        case 'undo':
        case 'redo':
            tab?.handle?.[id]();
            break;
        case 'next-tab':
        case 'previous-tab':
            if (on.tabs.cycle(id === 'next-tab' ? 1 : -1))
                on.shown();
            break;
        case 'focus-filter':
            tab?.table?.focusFilter();
            break;
        case 'back':
        case 'forward':
        case 'up':
            on.nav[id]();
            on.later();
            break;
        case 'show-graph':
            // The Explorer's Root, where the relationship graph is drawn.
            if (on.tabs.deactivate())
                on.shown();
            break;
    }
}
