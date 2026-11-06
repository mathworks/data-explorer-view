// Copyright 2026 The MathWorks, Inc.
//
// What each of the shell's document commands does, once connectShell has committed a cell editor
// still open (a toolbar press takes no focus): the editing ones are the active table's own menu
// items (TableHandle.run), the rest the shell's, on the tab active when the command was given. The
// commands that act at once (Settings, About, the palette, a view's) and the field's own Undo are
// connectShell's, before any of this.
import { tableActionOf } from './toolbarItems.js';
const message = (err) => (err instanceof Error ? err.message : String(err));
/** The element the focus is on, through the shadow roots on the way: a table's grid, not it. */
function focusedElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement)
        el = el.shadowRoot.activeElement;
    return el;
}
/**
 * Show Root (`show`), which hides the active tab's `panel`. A browser drops a focus inside the panel
 * (a table's, Show Graph's chord or Show in Graph used there) to the page's body: that one goes to
 * `toRoot`, where the tab row's does as Root shows. Read before the panel hides, by the shadow host
 * the focus is in, which :focus-within matches the panel by; and let go of first, as the tab row's
 * is, so a graph still being drawn takes it once it is.
 */
export function showRootFrom(panel, show, toRoot) {
    const held = !!panel && !!document.activeElement && panel.contains(document.activeElement);
    show();
    if (!held)
        return;
    focusedElement()?.blur();
    toRoot();
}
/**
 * The name New offers for a new dictionary: `untitled.sldd`, or while a tab has that name,
 * `untitled1.sldd` and on, as Simulink names a new model, so two new files are told apart.
 */
export function untitledName(taken) {
    const names = new Set(taken);
    for (let n = 0;; n++) {
        const name = `untitled${n === 0 ? '' : n}.sldd`;
        if (!names.has(name))
            return name;
    }
}
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
            on.failed(`Could not ${what}: ${message(err)}`);
    };
    switch (id) {
        case 'new-file': {
            // Where it goes, a name no tab has offered; null is a cancel.
            const suggested = untitledName(on.tabs.items.map((t) => t.name));
            void on.host
                .newFile?.(suggested)
                .then((path) => (path === null ? undefined : on.openNew(path)), pickFailed('make a new file'))
                .catch((err) => on.failed(`Could not make a new file: ${message(err)}`));
            break;
        }
        case 'open-file':
            void on.host.pickFiles().then(on.openPaths, pickFailed('open a file'));
            break;
        case 'open-folder':
            void on.host.pickFolder?.().catch(pickFailed('open a folder'));
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
            // Round the focused pane's tabs: the other pane's are a Mod+1 or Mod+2 away.
            if (on.tabs.cycle(id === 'next-tab' ? 1 : -1))
                on.shown();
            break;
        case 'split-right':
        case 'move-to-other-pane':
            // The tab moves, and is shown and focused where it went; a pane's only tab makes no new pane.
            if (tab)
                on.rearrange(() => on.tabs.split(tab, id === 'split-right' ? 'right' : on.tabs.otherSide(tab)));
            break;
        case 'focus-pane-1':
        case 'focus-pane-2':
            on.goToPane(id === 'focus-pane-1' ? 0 : 1);
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
            // The Explorer's Root, where the relationship graph is drawn, the keyboard kept (showRootFrom).
            showRootFrom(on.tabs.active?.panel, () => {
                if (on.tabs.deactivate())
                    on.shown();
            }, on.keyboardToRoot);
            break;
    }
}
